import { AlertTriangle, ChevronDown, ChevronRight, PanelLeftClose, Plus, Search, Settings } from 'lucide-react';
import { type CSSProperties, type ReactNode, useState } from 'react';

import type { AppError, Command, ContainerColor, Folder, Group, Item, Place, Profile, Snapshot, Tab, Target } from '../api/types';
import { needsSetup } from '../lib/browsers';
import type { DragItem } from '../lib/dnd';
import { folderMenu, groupMenu, type MenuHandlers, type NewKind, profileMenu, tabMenu } from '../lib/menus';
import { profileColor } from '../lib/profileColors';
import { pressable } from '../lib/pressable';
import { countTabs, hasTicketLink, pinnedIndex, resolveColor } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { useTreeState } from '../state/useTreeState';
import { ActionMenu, type MenuEntry } from './ActionMenu';
import { type DropSpec, useDrag, useDrop } from './DragDrop';
import { IconPicker } from './IconPicker';
import { InlineInput } from './InlineInput';
import { type ItemKind, ItemIcon } from './ItemIcon';
import { NoteIcon, TicketChip, withTicket } from './Meta';
import { openPalette } from './Palette';
import { PinnedSection } from './PinnedSection';
import { ContainerColorPicker, ProfileColorButton } from './ProfileDot';
import { SidebarRail } from './SidebarRail';
import { TabUrl } from './TabUrl';


interface Props {
  snapshot: Snapshot;
  selection: Selection | null;
  settingsOpen: boolean;
  onSelect: (selection: Selection) => void;
  onOpenSettings: () => void;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  /** Show each tab's URL under its title. */
  showUrls: boolean;
  onShowUrls: (show: boolean) => void;
  /** Collapsed to a rail of icons. */
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  /** Lines that show which items belong to each parent. */
  indentGuides: boolean;
}

/** Pending inline "new group" or "new folder" field. */
interface Adding {
  place: Place;
  kind: 'group' | 'folder';
}

/** The tree: profiles, their groups, folders and tabs. Every row has a menu. */
export function Sidebar(props: Props) {
  const { snapshot, selection, settingsOpen, onSelect, onOpenSettings, apply, actions } = props;
  const tree = useTreeState();
  const [adding, setAdding] = useState<Adding | null>(null);
  const [addingProfile, setAddingProfile] = useState(false);
  const { workspace } = snapshot;

  const ctx: TreeContext = {
    snapshot,
    selection: settingsOpen ? null : selection,
    tree,
    adding,
    onSelect,
    apply,
    actions,
    onOpenSettings,
    showUrls: props.showUrls,
    onShowUrls: props.onShowUrls,
    startNew: (place, kind) => {
      if (kind === 'tab') {
        actions.newTab(place);
        return;
      }
      const container = 'profile' in place ? place.profile : 'group' in place ? place.group : place.folder;
      tree.set(container, true);
      setAdding({ place, kind });
    },
    stopAdding: () => setAdding(null),
  };

  if (props.collapsed) {
    return (
      <SidebarRail
        workspace={workspace}
        selection={selection}
        settingsOpen={settingsOpen}
        onSelect={onSelect}
        onOpenSettings={onOpenSettings}
        onExpand={() => props.onCollapse(false)}
        onOpenTab={(tab) => actions.open({ tab })}
      />
    );
  }

  return (
    <nav className="sidebar" aria-label="Library" data-guides={props.indentGuides || undefined}>
      <div className="sidebar__header">
        <button
          type="button"
          className="icon-button"
          aria-label="Collapse sidebar"
          title="Collapse sidebar (⌘\)"
          onClick={() => props.onCollapse(true)}
        >
          <PanelLeftClose className="icon" aria-hidden="true" />
        </button>
        <span className="sidebar__title">Library</span>
        <button type="button" className="icon-button" aria-label="Search" title="Search (⌘K)" onClick={openPalette}>
          <Search className="icon" aria-hidden="true" />
        </button>
      </div>
      <div className="sidebar__scroll">
        <PinnedSection
          workspace={workspace}
          selection={ctx.selection}
          expanded={tree.isExpanded('pinned', true)}
          onToggle={() => tree.set('pinned', !tree.isExpanded('pinned', true))}
          onSelect={onSelect}
          actions={actions}
          apply={(command) => void apply(command)}
        />
        <ul className="tree-list">
          {workspace.profiles.map((profile) => (
            <ProfileNode key={profile.id} ctx={ctx} profile={profile} />
          ))}
        </ul>
      </div>
      <div className="sidebar__footer">
        {addingProfile ? (
          <div className="sidebar__form">
            <InlineInput
              label="Profile name"
              placeholder="Work, Client X…"
              onCancel={() => setAddingProfile(false)}
              onSubmit={async (name) => {
                const failure = await apply({ type: 'addProfile', name });
                if (!failure) setAddingProfile(false);
                return !failure;
              }}
            />
          </div>
        ) : (
          <button type="button" className="sidebar__item" onClick={() => setAddingProfile(true)}>
            <Plus className="icon" aria-hidden="true" />
            New profile
          </button>
        )}
        <button
          type="button"
          className="sidebar__item"
          aria-current={settingsOpen ? 'page' : undefined}
          onClick={onOpenSettings}
        >
          <Settings className="icon" aria-hidden="true" />
          Settings
        </button>
      </div>
    </nav>
  );
}

interface TreeContext {
  snapshot: Snapshot;
  selection: Selection | null;
  tree: ReturnType<typeof useTreeState>;
  adding: Adding | null;
  onSelect: (selection: Selection) => void;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  onOpenSettings: () => void;
  showUrls: boolean;
  onShowUrls: (show: boolean) => void;
  startNew: (place: Place, kind: NewKind) => void;
  stopAdding: () => void;
}

/**
 * What a parent passes down: `tint`, the color its rows show (`undefined`:
 * none); `color`, the one a child gets with "Use parent color" (a profile
 * gives its dot's color but no tint); and its name for the color picker.
 */
interface Parent {
  tint: number | undefined;
  color: number | undefined;
  name: string;
}

function handlers(ctx: TreeContext, own: Omit<MenuHandlers, 'workspace' | 'onMove'>): MenuHandlers {
  return { ...own, workspace: ctx.snapshot.workspace, onMove: (command) => void ctx.apply(command) };
}

/** "Pin to top" or "Unpin" for a menu. */
function pinHandler(ctx: TreeContext, target: Target) {
  return {
    pinned: pinnedIndex(ctx.snapshot.workspace, target) !== -1,
    onToggle: () => ctx.actions.togglePin(target),
  };
}

/** "Open ticket" for a menu, when the item's ticket can open. */
function ticketHandler(ctx: TreeContext, target: Target, id: string, ticketId: string | undefined) {
  return hasTicketLink(ctx.snapshot.workspace, id, ticketId) ? () => ctx.actions.openTicket(target) : undefined;
}

function isCurrent(ctx: TreeContext, kind: Selection['kind'], id: string): boolean {
  return ctx.selection?.kind === kind && ctx.selection.id === id;
}

function ProfileNode({ ctx, profile }: { ctx: TreeContext; profile: Profile }) {
  const expanded = ctx.tree.isExpanded(profile.id, true);
  const place: Place = { profile: profile.id };
  const unconfigured = needsSetup(ctx.snapshot, profile.id);
  const canDelete = ctx.snapshot.workspace.profiles.length > 1;

  return (
    <li>
      <Row
        depth={0}
        kind="profile"
        name={profile.name}
        own={profile.color}
        expanded={expanded}
        onToggle={() => ctx.tree.set(profile.id, !expanded)}
        current={isCurrent(ctx, 'profile', profile.id)}
        onActivate={() => ctx.onSelect({ kind: 'profile', id: profile.id })}
        drag={{ kind: 'profile', profile: profile.id }}
        drop={{ kind: 'into', place }}
        onRename={async (name) => !(await ctx.apply({ type: 'renameProfile', profile: profile.id, name }))}
        leading={(open, setOpen) => (
          <ProfileColorButton
            profile={profile}
            open={open}
            onOpenChange={setOpen}
            onChange={(color) => void ctx.apply({ type: 'setProfileColor', profile: profile.id, color })}
          />
        )}
        trailing={
          unconfigured && (
            <span className="tree-row__warning" role="img" aria-label={`${profile.name}: no browser chosen on this computer`}>
              <AlertTriangle className="icon" aria-hidden="true" />
            </span>
          )
        }
        menu={(row) =>
          profileMenu({
            ...handlers(ctx, {
              onNew: (kind) => ctx.startNew(place, kind),
              onOpen: () => ctx.actions.open({ profile: profile.id }),
              onRename: row.rename,
              onIcon: row.openLeading,
              onDelete: () => ctx.actions.requestDelete({ profile: profile.id }),
            }),
            onColor: row.openLeading,
            onConfigure: () => ctx.actions.configureProfile(profile.id),
            canDelete,
            showsUrls: ctx.showUrls,
            onToggleUrls: () => ctx.onShowUrls(!ctx.showUrls),
          })
        }
      />
      {expanded && (
        <ul className="tree-list">
          {profile.items.map((item) => (
            <ItemNode key={item.id} ctx={ctx} item={item} depth={1} parent={{ tint: undefined, color: profile.color, name: profile.name }} />
          ))}
          <AddingRow ctx={ctx} place={place} depth={1} />
          {profile.items.length === 0 && ctx.adding === null && (
            <li className="tree-empty" style={{ '--depth': 1 } as CSSProperties}>
              Empty. Right-click to add.
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

interface NodeProps {
  ctx: TreeContext;
  depth: number;
  parent: Parent;
}

function ItemNode({ item, ...rest }: NodeProps & { item: Item }) {
  switch (item.type) {
    case 'group':
      return <GroupNode {...rest} group={item} />;
    case 'folder':
      return <FolderNode {...rest} folder={item} />;
    case 'tab':
      return <TabNode {...rest} tab={item} />;
  }
}

function GroupNode({ ctx, group, depth, parent }: NodeProps & { group: Group }) {
  const expanded = ctx.tree.isExpanded(group.id, false);
  const place: Place = { group: group.id };
  const own = resolveColor(group.color, parent.color);
  return (
    <li>
      <Row
        depth={depth}
        kind="group"
        name={group.name}
        tint={parent.tint}
        own={own}
        color={{
          value: group.color,
          parent,
          onChange: (color) => void ctx.apply({ type: 'setColor', target: { group: group.id }, color }),
        }}
        ticketId={group.ticketId}
        note={group.note}
        expanded={expanded}
        onToggle={() => ctx.tree.set(group.id, !expanded)}
        current={isCurrent(ctx, 'group', group.id)}
        onActivate={() => ctx.onSelect({ kind: 'group', id: group.id })}
        drag={{ kind: 'group', group: group.id }}
        drop={(item) => (item.kind === 'group' ? { kind: 'before', node: group.id } : { kind: 'into', place })}
        onRename={async (name) => !(await ctx.apply({ type: 'renameGroup', group: group.id, name }))}
        leading={(open, setOpen) => (
          <IconButton ctx={ctx} name={group.name} kind="group" target={{ group: group.id }} icon={group.icon} open={open} onOpenChange={setOpen} />
        )}
        trailing={<span className="row__count">{countTabs(group)}</span>}
        menu={(row) =>
          groupMenu(
            group.id,
            handlers(ctx, {
              onNew: (kind) => ctx.startNew(place, kind),
              onOpen: () => ctx.actions.open({ group: group.id }),
              onRename: row.rename,
              onIcon: row.openLeading,
              onDetails: () => ctx.actions.editDetails({ group: group.id }),
              onColor: row.openColor,
              onTicket: ticketHandler(ctx, { group: group.id }, group.id, group.ticketId),
              pin: pinHandler(ctx, { group: group.id }),
              onDelete: () => ctx.actions.requestDelete({ group: group.id }),
            }),
          )
        }
      />
      {expanded && (
        <ul className="tree-list">
          {group.children.map((node) => (
            <ItemNode key={node.id} ctx={ctx} item={node} depth={depth + 1} parent={{ tint: own, color: own, name: group.name }} />
          ))}
          <AddingRow ctx={ctx} place={place} depth={depth + 1} />
        </ul>
      )}
    </li>
  );
}

function FolderNode({ ctx, folder, depth, parent }: NodeProps & { folder: Folder }) {
  const expanded = ctx.tree.isExpanded(folder.id, false);
  const place: Place = { folder: folder.id };
  const own = resolveColor(folder.color, parent.color);
  return (
    <li>
      <Row
        depth={depth}
        kind="folder"
        name={folder.name}
        tint={parent.tint}
        own={own}
        color={{
          value: folder.color,
          parent,
          onChange: (color) => void ctx.apply({ type: 'setColor', target: { folder: folder.id }, color }),
        }}
        ticketId={folder.ticketId}
        note={folder.note}
        expanded={expanded}
        onToggle={() => ctx.tree.set(folder.id, !expanded)}
        current={isCurrent(ctx, 'folder', folder.id)}
        onActivate={() => ctx.onSelect({ kind: 'folder', id: folder.id })}
        drag={{ kind: 'folder', folder: folder.id }}
        drop={(item) => (item.kind === 'tab' ? { kind: 'into', place } : { kind: 'before', node: folder.id })}
        onRename={async (name) => !(await ctx.apply({ type: 'renameFolder', folder: folder.id, name }))}
        leading={(open, setOpen) => (
          <IconButton ctx={ctx} name={folder.name} kind="folder" target={{ folder: folder.id }} icon={folder.icon} open={open} onOpenChange={setOpen} />
        )}
        trailing={<span className="row__count">{folder.tabs.length}</span>}
        menu={(row) =>
          folderMenu(
            folder.id,
            handlers(ctx, {
              onNew: (kind) => ctx.startNew(place, kind),
              onOpen: () => ctx.actions.open({ folder: folder.id }),
              onRename: row.rename,
              onIcon: row.openLeading,
              onDetails: () => ctx.actions.editDetails({ folder: folder.id }),
              onColor: row.openColor,
              onTicket: ticketHandler(ctx, { folder: folder.id }, folder.id, folder.ticketId),
              pin: pinHandler(ctx, { folder: folder.id }),
              onDelete: () => ctx.actions.requestDelete({ folder: folder.id }),
            }),
          )
        }
      />
      {expanded && (
        <ul className="tree-list">
          {folder.tabs.map((tab) => (
            <TabNode key={tab.id} ctx={ctx} tab={tab} depth={depth + 1} parent={{ tint: own, color: own, name: folder.name }} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TabNode({ ctx, tab, depth, parent }: NodeProps & { tab: Tab }) {
  return (
    <li>
      <Row
        depth={depth}
        kind="tab"
        name={tab.title}
        tint={parent.tint}
        ticketId={tab.ticketId}
        note={tab.note}
        title={`${tab.title}\n${tab.url}`}
        subtitle={ctx.showUrls ? <TabUrl url={tab.url} compact /> : undefined}
        current={isCurrent(ctx, 'tab', tab.id)}
        onActivate={() => ctx.onSelect({ kind: 'tab', id: tab.id })}
        onOpen={() => ctx.actions.open({ tab: tab.id })}
        drag={{ kind: 'tab', tab: tab.id }}
        drop={{ kind: 'before', node: tab.id }}
        onRename={async (title) => !(await ctx.apply({ type: 'renameTab', tab: tab.id, title }))}
        leading={(open, setOpen) => (
          <IconButton ctx={ctx} name={tab.title} kind="tab" target={{ tab: tab.id }} icon={tab.icon} open={open} onOpenChange={setOpen} />
        )}
        menu={(row) =>
          tabMenu(
            tab.id,
            handlers(ctx, {
              onNew: () => undefined,
              onOpen: () => ctx.actions.open({ tab: tab.id }),
              onRename: row.rename,
              onIcon: row.openLeading,
              onDetails: () => ctx.actions.editDetails({ tab: tab.id }),
              onTicket: ticketHandler(ctx, { tab: tab.id }, tab.id, tab.ticketId),
              pin: pinHandler(ctx, { tab: tab.id }),
              onDelete: () => ctx.actions.requestDelete({ tab: tab.id }),
            }),
          )
        }
      />
    </li>
  );
}

function AddingRow({ ctx, place, depth }: { ctx: TreeContext; place: Place; depth: number }) {
  const { adding } = ctx;
  if (!adding || JSON.stringify(adding.place) !== JSON.stringify(place)) return null;
  const isGroup = adding.kind === 'group';
  return (
    <li className="tree-form" style={{ '--depth': depth } as CSSProperties}>
      <InlineInput
        label={isGroup ? 'Group name' : 'Folder name'}
        placeholder={isGroup ? 'In TEST, Reading…' : 'Sprint, Docs…'}
        onCancel={ctx.stopAdding}
        onSubmit={async (name) => {
          const command: Command =
            isGroup && 'profile' in place
              ? { type: 'addGroup', profile: place.profile, name }
              : { type: 'addFolder', place, name };
          const failure = await ctx.apply(command);
          if (!failure) ctx.stopAdding();
          return !failure;
        }}
      />
    </li>
  );
}

interface IconButtonProps {
  ctx: TreeContext;
  name: string;
  kind: ItemKind;
  target: Parameters<ItemActions['setIcon']>[0];
  icon: Group['icon'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function IconButton({ ctx, name, kind, target, icon, open, onOpenChange }: IconButtonProps) {
  return (
    <IconPicker
      name={name}
      icon={icon}
      open={open}
      onOpenChange={onOpenChange}
      onChange={(next) => ctx.actions.setIcon(target, next)}
    >
      <button type="button" className="tree-row__icon" aria-label={`Icon of ${name}`}>
        <ItemIcon icon={icon} kind={kind} />
      </button>
    </IconPicker>
  );
}

/** What a row's menu can ask the row to do. */
interface RowControls {
  rename: () => void;
  /** Opens the icon (or color) picker on the row's leading button. */
  openLeading: () => void;
  /** Opens the color picker of a group or folder. */
  openColor: () => void;
}

interface RowProps {
  depth: number;
  kind: 'profile' | ItemKind;
  name: string;
  /** Color of the parent, shown as the row's background tint. */
  tint?: number;
  /** Color of the item itself, for its icon. */
  own?: number;
  /** A group's or folder's own color and how to change it. */
  color?: {
    value: ContainerColor | undefined;
    parent: Parent;
    onChange: (color: ContainerColor) => void;
  };
  /** Shown as a chip before the name. */
  ticketId?: string;
  /** Shown as an icon with the note as its tooltip. */
  note?: string;
  title?: string;
  /** Second line under the name, e.g. a tab's URL. */
  subtitle?: ReactNode;
  /** Leaf rows (tabs) have no chevron. */
  expanded?: boolean;
  onToggle?: () => void;
  current?: boolean;
  onActivate: () => void;
  /** Double-click: open in the browser (tabs only). */
  onOpen?: () => void;
  drag: DragItem;
  drop: DropSpec;
  onRename: (name: string) => Promise<boolean>;
  leading: (open: boolean, setOpen: (open: boolean) => void) => ReactNode;
  trailing?: ReactNode;
  menu: (row: RowControls) => MenuEntry[];
}

function Row(props: RowProps) {
  const { depth, kind, name, expanded, onToggle, current = false, onActivate, onRename, menu } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const [leadingOpen, setLeadingOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const drag = useDrag(props.drag);
  const drop = useDrop(props.drop);
  const controls: RowControls = {
    rename: () => setRenaming(true),
    openLeading: () => setLeadingOpen(true),
    openColor: () => setColorOpen(true),
  };
  const style: Record<string, string | number> = { '--depth': depth };
  if (props.tint !== undefined) style['--parent'] = profileColor(props.tint);
  if (props.own !== undefined) style['--own'] = profileColor(props.own);

  const row = (
    <div
      className={props.subtitle ? 'tree-row tree-row--two-line' : 'tree-row'}
      data-kind={kind}
      data-current={current || undefined}
      data-tinted={props.tint !== undefined || undefined}
      data-own={props.own !== undefined || undefined}
      style={style as CSSProperties}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
      {...(renaming ? {} : drag)}
      {...drop}
    >
      {expanded === undefined ? (
        <span className="tree-row__chevron" aria-hidden="true" />
      ) : (
        <button
          type="button"
          className="tree-row__chevron"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
          onClick={onToggle}
        >
          {expanded ? <ChevronDown className="icon" aria-hidden="true" /> : <ChevronRight className="icon" aria-hidden="true" />}
        </button>
      )}
      {props.leading(leadingOpen, setLeadingOpen)}
      {renaming ? (
        <div className="tree-row__rename">
          <InlineInput
            label="New name"
            initial={name}
            onCancel={() => setRenaming(false)}
            onSubmit={async (next) => {
              const saved = await onRename(next);
              if (saved) setRenaming(false);
              return saved;
            }}
          />
        </div>
      ) : (
        <div
          {...pressable(onActivate)}
          className="tree-row__name"
          title={props.title ?? name}
          aria-current={current ? 'page' : undefined}
          aria-label={props.subtitle || props.ticketId ? withTicket(name, props.ticketId) : undefined}
          onClick={onActivate}
          onDoubleClick={props.onOpen}
        >
          {props.subtitle ? (
            <>
              <span className="tree-row__title">
                <TicketChip ticketId={props.ticketId} />
                {name}
              </span>
              {props.subtitle}
            </>
          ) : props.ticketId ? (
            <span className="tree-row__title">
              <TicketChip ticketId={props.ticketId} />
              {name}
            </span>
          ) : (
            name
          )}
        </div>
      )}
      <NoteIcon note={props.note} />
      {props.trailing}
      <ActionMenu
        label={`Options for ${name}`}
        entries={menu(controls)}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        className="tree-row__more"
      />
    </div>
  );

  if (!props.color) return row;
  return (
    <ContainerColorPicker
      name={name}
      color={props.color.value}
      parentColor={props.color.parent.color}
      parentName={props.color.parent.name}
      open={colorOpen}
      onOpenChange={setColorOpen}
      onChange={props.color.onChange}
    >
      {row}
    </ContainerColorPicker>
  );
}

