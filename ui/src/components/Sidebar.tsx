import { AlertTriangle, ChevronDown, ChevronRight, Plus, Settings } from 'lucide-react';
import { type CSSProperties, type ReactNode, useState } from 'react';

import type { AppError, Command, Folder, Group, Item, Place, Profile, Snapshot, Tab } from '../api/types';
import { needsSetup } from '../lib/browsers';
import { nextGroupColor } from '../lib/colors';
import type { DragItem } from '../lib/dnd';
import { folderMenu, groupMenu, type MenuHandlers, type NewKind, profileMenu, tabMenu } from '../lib/menus';
import { countTabs } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { useTreeState } from '../state/useTreeState';
import { ActionMenu, type MenuEntry } from './ActionMenu';
import { type DropSpec, useDrag, useDrop } from './DragDrop';
import { IconPicker } from './IconPicker';
import { InlineInput } from './InlineInput';
import { type ItemKind, ItemIcon } from './ItemIcon';
import { ProfileColorButton } from './ProfileDot';
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

  return (
    <nav className="sidebar" aria-label="Library">
      <div className="sidebar__scroll">
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

function handlers(ctx: TreeContext, own: Omit<MenuHandlers, 'workspace' | 'onMove'>): MenuHandlers {
  return { ...own, workspace: ctx.snapshot.workspace, onMove: (command) => void ctx.apply(command) };
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
            <ItemNode key={item.id} ctx={ctx} item={item} depth={1} />
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

function ItemNode({ ctx, item, depth }: { ctx: TreeContext; item: Item; depth: number }) {
  switch (item.type) {
    case 'group':
      return <GroupNode ctx={ctx} group={item} depth={depth} />;
    case 'folder':
      return <FolderNode ctx={ctx} folder={item} depth={depth} />;
    case 'tab':
      return <TabNode ctx={ctx} tab={item} depth={depth} />;
  }
}

function GroupNode({ ctx, group, depth }: { ctx: TreeContext; group: Group; depth: number }) {
  const expanded = ctx.tree.isExpanded(group.id, false);
  const place: Place = { group: group.id };
  return (
    <li>
      <Row
        depth={depth}
        kind="group"
        name={group.name}
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
              onDelete: () => ctx.actions.requestDelete({ group: group.id }),
            }),
          )
        }
      />
      {expanded && (
        <ul className="tree-list">
          {group.children.map((node) => (
            <ItemNode key={node.id} ctx={ctx} item={node} depth={depth + 1} />
          ))}
          <AddingRow ctx={ctx} place={place} depth={depth + 1} />
        </ul>
      )}
    </li>
  );
}

function FolderNode({ ctx, folder, depth }: { ctx: TreeContext; folder: Folder; depth: number }) {
  const expanded = ctx.tree.isExpanded(folder.id, false);
  const place: Place = { folder: folder.id };
  return (
    <li>
      <Row
        depth={depth}
        kind="folder"
        name={folder.name}
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
              onDelete: () => ctx.actions.requestDelete({ folder: folder.id }),
            }),
          )
        }
      />
      {expanded && (
        <ul className="tree-list">
          {folder.tabs.map((tab) => (
            <TabNode key={tab.id} ctx={ctx} tab={tab} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TabNode({ ctx, tab, depth }: { ctx: TreeContext; tab: Tab; depth: number }) {
  return (
    <li>
      <Row
        depth={depth}
        kind="tab"
        name={tab.title}
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
              ? {
                  type: 'addGroup',
                  profile: place.profile,
                  name,
                  color: nextGroupColor(ctx.snapshot.workspace),
                }
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
}

interface RowProps {
  depth: number;
  kind: 'profile' | ItemKind;
  name: string;
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
  const drag = useDrag(props.drag);
  const drop = useDrop(props.drop);
  const controls: RowControls = { rename: () => setRenaming(true), openLeading: () => setLeadingOpen(true) };

  return (
    <div
      className={props.subtitle ? 'tree-row tree-row--two-line' : 'tree-row'}
      data-kind={kind}
      data-current={current || undefined}
      style={{ '--depth': depth } as CSSProperties}
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
        <button
          type="button"
          className="tree-row__name"
          title={props.title ?? name}
          aria-current={current ? 'page' : undefined}
          aria-label={props.subtitle ? name : undefined}
          onClick={onActivate}
          onDoubleClick={props.onOpen}
        >
          {props.subtitle ? (
            <>
              <span className="tree-row__title">{name}</span>
              {props.subtitle}
            </>
          ) : (
            name
          )}
        </button>
      )}
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
}

