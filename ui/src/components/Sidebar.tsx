import { AlertTriangle, GripVertical, PanelLeftClose, Plus, Search, Settings } from 'lucide-react';
import { type CSSProperties, useState } from 'react';

import type { AppError, Command, Note, Profile, Snapshot, Target, Ticket } from '../api/types';
import { needsSetup } from '../lib/browsers';
import type { DragItem, DropTarget } from '../lib/dnd';
import { noteMenu, profileMenu, ticketMenu } from '../lib/menus';
import { pressable } from '../lib/pressable';
import { type Lane, findStatus, findTicket, lanes } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { useTreeState } from '../state/useTreeState';
import { type DropHit, type DropPoint, useDrag, useDrop } from './DragDrop';
import { IconPicker } from './IconPicker';
import { InlineInput } from './InlineInput';
import { type ItemKind, ItemIcon } from './ItemIcon';
import { openPalette } from './Palette';
import { PinnedSection } from './PinnedSection';
import { ProfileColorButton } from './ProfileDot';
import { SidebarRail } from './SidebarRail';
import { StatusPill } from './StatusPill';
import { TreeRow } from './TreeRow';

interface Props {
  snapshot: Snapshot;
  selection: Selection | null;
  settingsOpen: boolean;
  onSelect: (selection: Selection) => void;
  onOpenSettings: () => void;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  /** Collapsed to a rail of icons. */
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}

/** Pending inline "new ticket" or "new note" field. */
interface Adding {
  profile: string;
  kind: 'ticket' | 'note';
  /** The lane a new ticket goes in. */
  status: string | null;
}

interface TreeContext {
  snapshot: Snapshot;
  selection: Selection | null;
  tree: ReturnType<typeof useTreeState>;
  adding: Adding | null;
  setAdding: (adding: Adding | null) => void;
  onSelect: (selection: Selection) => void;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
}

/** The library: pinned items, then each profile's tickets by status and its notes. */
export function Sidebar(props: Props) {
  const { snapshot, selection, settingsOpen, onSelect, onOpenSettings, apply, actions } = props;
  const tree = useTreeState();
  const [adding, setAdding] = useState<Adding | null>(null);
  const [addingProfile, setAddingProfile] = useState(false);
  const { workspace } = snapshot;

  if (props.collapsed) {
    return (
      <SidebarRail
        workspace={workspace}
        selection={selection}
        settingsOpen={settingsOpen}
        onSelect={onSelect}
        onOpenSettings={onOpenSettings}
        onExpand={() => props.onCollapse(false)}
      />
    );
  }

  const ctx: TreeContext = {
    snapshot,
    selection: settingsOpen ? null : selection,
    tree,
    adding,
    setAdding: (next) => {
      if (next) {
        tree.set(next.profile, true);
        if (next.kind === 'ticket') tree.set(laneKey(next.profile, next.status), true);
      }
      setAdding(next);
    },
    onSelect,
    apply,
    actions,
  };

  return (
    <nav className="sidebar" aria-label="Library">
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

function isCurrent(ctx: TreeContext, kind: Selection['kind'], id: string): boolean {
  return ctx.selection?.kind === kind && ctx.selection.id === id;
}

function menuContext(ctx: TreeContext) {
  return { workspace: ctx.snapshot.workspace, actions: ctx.actions, apply: (command: Command) => void ctx.apply(command) };
}

function ProfileNode({ ctx, profile }: { ctx: TreeContext; profile: Profile }) {
  const expanded = ctx.tree.isExpanded(profile.id, true);
  const unconfigured = needsSetup(ctx.snapshot, profile.id);
  const canDelete = ctx.snapshot.workspace.profiles.length > 1;
  const addingHere = ctx.adding?.profile === profile.id ? ctx.adding : null;
  const shown = lanes(ctx.snapshot.workspace, profile).filter(
    (lane) => lane.tickets.length > 0 || (addingHere?.kind === 'ticket' && addingHere.status === (lane.status?.id ?? null)),
  );
  const addingNote = addingHere?.kind === 'note';
  const empty = profile.tickets.length === 0 && profile.notes.length === 0 && !addingHere;

  return (
    <li>
      <TreeRow
        depth={0}
        kind="profile"
        name={profile.name}
        expanded={expanded}
        onToggle={() => ctx.tree.set(profile.id, !expanded)}
        current={isCurrent(ctx, 'profile', profile.id)}
        onActivate={() => ctx.onSelect({ kind: 'profile', id: profile.id })}
        drag={{ kind: 'profile', profile: profile.id }}
        drop={{ kind: 'profile', profile: profile.id }}
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
          profileMenu(profile.id, row, {
            ...menuContext(ctx),
            onNewTicket: () => ctx.setAdding({ profile: profile.id, kind: 'ticket', status: null }),
            onNewNote: () => ctx.setAdding({ profile: profile.id, kind: 'note', status: null }),
            canDelete,
          })
        }
      />
      {expanded && (
        <ul className="tree-list">
          {shown.map((lane) => (
            <LaneNode key={lane.status?.id ?? 'none'} ctx={ctx} profile={profile} lane={lane} />
          ))}
          {(profile.notes.length > 0 || addingNote) && <NotesNode ctx={ctx} profile={profile} adding={addingNote} />}
          {empty && (
            <li className="tree-empty" style={{ '--depth': 1 } as CSSProperties}>
              No tickets yet. Right-click to add one.
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** Key of a lane's expanded state in the tree state. */
function laneKey(profile: string, status: string | null): string {
  return `lane:${profile}:${status ?? 'none'}`;
}

/**
 * Share of a row's height, at its top and at its bottom, where a dropped
 * ticket goes before or after it; the middle nests it.
 */
const EDGE = 0.3;

/**
 * A status lane: its pill, then its tickets. A click on the pill collapses
 * or expands the lane. Dropping a ticket on the head gives it the status;
 * dragging the head reorders the statuses.
 */
function LaneNode({ ctx, profile, lane }: { ctx: TreeContext; profile: Profile; lane: Lane }) {
  const status = lane.status?.id ?? null;
  const key = laneKey(profile.id, status);
  const expanded = ctx.tree.isExpanded(key, true);
  const drag = useDrag({ kind: 'status', status: status ?? '' });
  const drop = useDrop((item: DragItem, at: DropPoint): DropTarget | DropHit | null => {
    if (item.kind !== 'status') return { kind: 'lane', profile: profile.id, status };
    if (status === null) return { target: { kind: 'status', status: null, after: false }, edge: 'top' };
    const after = at.offset > at.height / 2;
    return { target: { kind: 'status', status, after }, edge: after ? 'bottom' : 'top' };
  });
  const adding = ctx.adding?.profile === profile.id && ctx.adding.kind === 'ticket' && ctx.adding.status === status;
  const name = lane.status?.name ?? 'No status';
  const toggle = () => ctx.tree.set(key, !expanded);
  return (
    <li className="lane" aria-label={`${profile.name}: ${name}`}>
      <div className="lane__head" data-draggable={lane.status ? true : undefined} {...drop} {...(lane.status ? drag : {})}>
        {lane.status && (
          <span className="lane__grip" aria-hidden="true">
            <GripVertical className="icon" />
          </span>
        )}
        <div
          {...pressable(toggle)}
          className="lane__toggle"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
          title={expanded ? `Collapse ${name}` : `Expand ${name}`}
          onClick={toggle}
        >
          <StatusPill name={name} color={lane.status?.color} count={lane.tickets.length} collapsed={!expanded} />
        </div>
        <button
          type="button"
          className="icon-button lane__add"
          aria-label={`New ticket in ${name}`}
          title={`New ticket in ${name}`}
          onClick={() => ctx.setAdding({ profile: profile.id, kind: 'ticket', status })}
        >
          <Plus className="icon" aria-hidden="true" />
        </button>
      </div>
      {expanded && (
        <ul className="tree-list">
          {adding && (
            <li className="tree-form" style={{ '--depth': 1 } as CSSProperties}>
              <InlineInput
                label="Ticket title"
                placeholder="CAR-6210 Decouple compliance status"
                onCancel={() => ctx.setAdding(null)}
                onSubmit={async (title) => {
                  const saved = await ctx.actions.newTicket({ profile: profile.id }, title, status);
                  if (saved) ctx.setAdding(null);
                  return saved;
                }}
              />
            </li>
          )}
          {lane.tickets.map((ticket) => (
            <TicketNode key={ticket.id} ctx={ctx} profile={profile} ticket={ticket} depth={1} lane={lane} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface TicketNodeProps {
  ctx: TreeContext;
  profile: Profile;
  ticket: Ticket;
  depth: number;
  /** The lane of a top-level ticket. */
  lane?: Lane;
  /** The parent of a sub-ticket. */
  parent?: Ticket;
}

function TicketNode({ ctx, profile, ticket, depth, lane, parent }: TicketNodeProps) {
  const children = ticket.children ?? [];
  const hasInside = children.length > 0;
  const expanded = ctx.tree.isExpanded(ticket.id, false);
  const status = findStatus(ctx.snapshot.workspace, ticket.status);
  const target: Target = { ticket: ticket.id };
  return (
    <li>
      <TreeRow
        depth={depth}
        kind="ticket"
        ticketKind={ticket.kind}
        name={ticket.title}
        ticketKey={ticket.key}
        note={ticket.note}
        lane={status?.color}
        title={[ticket.key, ticket.title, status && `Status: ${status.name}`].filter(Boolean).join('\n')}
        expanded={hasInside ? expanded : undefined}
        onToggle={() => ctx.tree.set(ticket.id, !expanded)}
        current={isCurrent(ctx, 'ticket', ticket.id)}
        onActivate={() => ctx.onSelect({ kind: 'ticket', id: ticket.id })}
        onOpen={ticket.url ? () => ctx.actions.openTicket(ticket.id) : undefined}
        drag={{ kind: 'ticket', ticket: ticket.id }}
        drop={(item, at) => ticketDrop(ctx, profile, ticket, item, at, lane, parent)}
        onRename={async (name) => !(await ctx.apply({ type: 'rename', target, name }))}
        leading={(open, setOpen) => (
          <IconButton
            ctx={ctx}
            name={ticket.title}
            kind={ticket.kind ?? 'ticket'}
            target={target}
            icon={ticket.icon}
            open={open}
            onOpenChange={setOpen}
          />
        )}
        trailing={children.length > 0 ? <span className="row__count">{children.length}</span> : undefined}
        menu={(row) => ticketMenu(ticket.id, row, menuContext(ctx))}
      />
      {hasInside && expanded && (
        <ul className="tree-list">
          {children.map((child) => (
            <TicketNode key={child.id} ctx={ctx} profile={profile} ticket={child} depth={depth + 1} parent={ticket} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Where a ticket dragged over a ticket row lands: into it, as a sub-ticket,
 * when over the middle of a top-level ticket; before or after it otherwise.
 */
function ticketDrop(
  ctx: TreeContext,
  profile: Profile,
  ticket: Ticket,
  item: DragItem,
  at: DropPoint,
  lane?: Lane,
  parent?: Ticket,
): DropHit | null {
  if (item.kind !== 'ticket' || item.ticket === ticket.id) return null;
  const dragged = findTicket(ctx.snapshot.workspace, item.ticket);
  const canNest = !parent && dragged !== null && (dragged.ticket.children?.length ?? 0) === 0;
  const edge = at.height * EDGE;
  if (canNest && at.offset >= edge && at.offset <= at.height - edge) {
    return { target: { kind: 'intoTicket', ticket: ticket.id } };
  }
  const after = at.offset > at.height / 2;
  if (parent) {
    const siblings = parent.children ?? [];
    const next = siblings[siblings.findIndex((child) => child.id === ticket.id) + 1];
    const target: DropTarget = !after
      ? { kind: 'beforeSubTicket', ticket: ticket.id }
      : next
        ? { kind: 'beforeSubTicket', ticket: next.id }
        : { kind: 'intoTicket', ticket: parent.id };
    return { target, edge: after ? 'bottom' : 'top' };
  }
  if (!lane) return null;
  const next = lane.tickets[lane.tickets.findIndex((candidate) => candidate.id === ticket.id) + 1];
  const before = after ? next?.id : ticket.id;
  return {
    target: { kind: 'lane', profile: profile.id, status: lane.status?.id ?? null, ...(before ? { before } : {}) },
    edge: after ? 'bottom' : 'top',
  };
}

function NotesNode({ ctx, profile, adding }: { ctx: TreeContext; profile: Profile; adding: boolean }) {
  const drop = useDrop({ kind: 'notes', profile: profile.id });
  return (
    <li className="lane lane--notes" aria-label={`${profile.name}: Notes`}>
      <div className="lane__head" {...drop}>
        <span className="lane__label">Notes</span>
        <span className="lane__count">{profile.notes.length}</span>
        <button
          type="button"
          className="icon-button lane__add"
          aria-label={`New note in ${profile.name}`}
          title="New note"
          onClick={() => ctx.setAdding({ profile: profile.id, kind: 'note', status: null })}
        >
          <Plus className="icon" aria-hidden="true" />
        </button>
      </div>
      <ul className="tree-list">
        {adding && (
          <li className="tree-form" style={{ '--depth': 1 } as CSSProperties}>
            <InlineInput
              label="Note title"
              placeholder="Standup notes"
              onCancel={() => ctx.setAdding(null)}
              onSubmit={async (title) => {
                const saved = await ctx.actions.newNote(profile.id, title);
                if (saved) ctx.setAdding(null);
                return saved;
              }}
            />
          </li>
        )}
        {profile.notes.map((note) => (
          <NoteNode key={note.id} ctx={ctx} profile={profile} note={note} />
        ))}
      </ul>
    </li>
  );
}

function NoteNode({ ctx, profile, note }: { ctx: TreeContext; profile: Profile; note: Note }) {
  const target: Target = { note: note.id };
  return (
    <li>
      <TreeRow
        depth={1}
        kind="note"
        name={note.title}
        current={isCurrent(ctx, 'note', note.id)}
        onActivate={() => ctx.onSelect({ kind: 'note', id: note.id })}
        drag={{ kind: 'note', note: note.id }}
        drop={(item) => (item.kind === 'note' ? { kind: 'notes', profile: profile.id, before: note.id } : null)}
        onRename={async (name) => !(await ctx.apply({ type: 'rename', target, name }))}
        leading={(open, setOpen) => (
          <IconButton ctx={ctx} name={note.title} kind="note" target={target} icon={note.icon} open={open} onOpenChange={setOpen} />
        )}
        menu={(row) => noteMenu(note.id, row, menuContext(ctx))}
      />
    </li>
  );
}

interface IconButtonProps {
  ctx: TreeContext;
  name: string;
  kind: ItemKind;
  target: Target;
  icon: Ticket['icon'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function IconButton({ ctx, name, kind, target, icon, open, onOpenChange }: IconButtonProps) {
  return (
    <IconPicker name={name} icon={icon} open={open} onOpenChange={onOpenChange} onChange={(next) => ctx.actions.setIcon(target, next)}>
      <button type="button" className="tree-row__icon" aria-label={`Icon of ${name}`}>
        <ItemIcon icon={icon} kind={kind} />
      </button>
    </IconPicker>
  );
}
