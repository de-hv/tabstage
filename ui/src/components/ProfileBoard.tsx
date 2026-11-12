import { Link as LinkIcon, ListTree, NotebookText, Plus, Ticket as TicketIcon } from 'lucide-react';
import { type CSSProperties, useState } from 'react';

import type { AppError, Command, Profile, Snapshot, Ticket } from '../api/types';
import { profileOpensIn } from '../lib/browsers';
import { pressable } from '../lib/pressable';
import { profileColor } from '../lib/profileColors';
import { type Lane, countLinks, findStatus, lanes } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { useClickOrDoubleClick } from '../state/useClickOrDoubleClick';
import { useDrag, useDrop } from './DragDrop';
import { InlineInput } from './InlineInput';
import { ItemIcon } from './ItemIcon';
import { ProfileDot } from './ProfileDot';
import { SetupNote } from './SetupNote';
import { StatusPill } from './StatusPill';

interface Props {
  snapshot: Snapshot;
  profile: Profile;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
}

/**
 * A profile as a board: one column per status, in workflow order, plus "No
 * status". Dragging a card to another column changes its status. The notes
 * sit below.
 */
export function ProfileBoard({ snapshot, profile, actions, onSelect }: Props) {
  const [addingIn, setAddingIn] = useState<string | null | undefined>(undefined);
  const [addingNote, setAddingNote] = useState(false);
  const { workspace } = snapshot;
  const columns = lanes(workspace, profile);
  const count = profile.tickets.reduce((total, ticket) => total + 1 + (ticket.children?.length ?? 0), 0);

  return (
    <main className="board-view" aria-labelledby="view-title">
      <header className="group__header">
        <ProfileDot color={profile.color} />
        <h1 id="view-title" className="group__name">
          {profile.name}
        </h1>
        <span className="group__meta">
          {count} {count === 1 ? 'ticket' : 'tickets'} · opens in {profileOpensIn(snapshot, profile.id)}
        </span>
        <div className="group__actions">
          <button type="button" className="button" onClick={() => setAddingIn(null)}>
            <TicketIcon className="icon" aria-hidden="true" />
            New ticket
          </button>
          <button type="button" className="button" onClick={() => setAddingNote(true)}>
            <NotebookText className="icon" aria-hidden="true" />
            New note
          </button>
        </div>
      </header>

      <SetupNote snapshot={snapshot} profile={profile} onConfigure={() => actions.configureProfile(profile.id)} />

      {workspace.statuses.length === 0 && (
        <p className="board__hint">
          Statuses such as “In review” or “Done” sort tickets into columns.{' '}
          <button type="button" className="link-button" onClick={actions.editStatuses}>
            Add statuses
          </button>
        </p>
      )}

      <div className="board" role="list" aria-label="Status board">
        {columns.map((lane) => (
          <Column
            key={lane.status?.id ?? 'none'}
            profile={profile}
            lane={lane}
            adding={addingIn === (lane.status?.id ?? null)}
            onAdd={() => setAddingIn(lane.status?.id ?? null)}
            onStopAdding={() => setAddingIn(undefined)}
            actions={actions}
            onSelect={onSelect}
            snapshot={snapshot}
          />
        ))}
      </div>

      <section className="board-notes" aria-label="Notes">
        <h2 className="settings__heading">Notes</h2>
        {addingNote && (
          <InlineInput
            label="Note title"
            placeholder="Standup notes"
            onCancel={() => setAddingNote(false)}
            onSubmit={async (title) => {
              const saved = await actions.newNote(profile.id, title);
              if (saved) setAddingNote(false);
              return saved;
            }}
          />
        )}
        {profile.notes.length === 0 && !addingNote ? (
          <p className="column__empty">Notes hold what is not a ticket: standups, plans, loose links.</p>
        ) : (
          <div className="note-cards">
            {profile.notes.map((note) => (
              <div
                key={note.id}
                {...pressable(() => onSelect({ kind: 'note', id: note.id }))}
                className="card"
                onClick={() => onSelect({ kind: 'note', id: note.id })}
              >
                <ItemIcon icon={note.icon} kind="note" />
                <span className="card__title">{note.title}</span>
                {(note.links?.length ?? 0) > 0 && <span className="row__count">{note.links?.length}</span>}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

interface ColumnProps {
  snapshot: Snapshot;
  profile: Profile;
  lane: Lane;
  adding: boolean;
  onAdd: () => void;
  onStopAdding: () => void;
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
}

function Column({ snapshot, profile, lane, adding, onAdd, onStopAdding, actions, onSelect }: ColumnProps) {
  const status = lane.status?.id ?? null;
  const drop = useDrop({ kind: 'lane', profile: profile.id, status });
  const name = lane.status?.name ?? 'No status';
  const style = lane.status ? ({ '--lane': profileColor(lane.status.color) } as CSSProperties) : undefined;
  return (
    <section className="column" role="listitem" aria-label={name} data-lane={lane.status ? true : undefined} style={style} {...drop}>
      <header className="column__header">
        <StatusPill name={name} color={lane.status?.color} />
        <span className="row__count">{lane.tickets.length}</span>
        <button type="button" className="icon-button column__add" aria-label={`New ticket in ${name}`} onClick={onAdd}>
          <Plus className="icon" aria-hidden="true" />
        </button>
      </header>
      {adding && (
        <InlineInput
          label="Ticket title"
          placeholder="CAR-6210 Decouple compliance status"
          onCancel={onStopAdding}
          onSubmit={async (title) => {
            const saved = await actions.newTicket({ profile: profile.id }, title, status);
            if (saved) onStopAdding();
            return saved;
          }}
        />
      )}
      <ul className="column__cards">
        {lane.tickets.map((ticket) => (
          <li key={ticket.id}>
            <Card snapshot={snapshot} profile={profile} lane={lane} ticket={ticket} actions={actions} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      {lane.tickets.length === 0 && !adding && <p className="column__empty">Drop tickets here</p>}
    </section>
  );
}

interface CardProps {
  snapshot: Snapshot;
  profile: Profile;
  lane: Lane;
  ticket: Ticket;
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
}

function Card({ snapshot, profile, lane, ticket, actions, onSelect }: CardProps) {
  const drag = useDrag({ kind: 'ticket', ticket: ticket.id });
  const drop = useDrop({ kind: 'lane', profile: profile.id, status: lane.status?.id ?? null, before: ticket.id });
  const clicks = useClickOrDoubleClick(
    () => onSelect({ kind: 'ticket', id: ticket.id }),
    () => (ticket.url ? actions.openTicket(ticket.id) : onSelect({ kind: 'ticket', id: ticket.id })),
  );
  const children = ticket.children ?? [];
  const done = children.filter((child) => findStatus(snapshot.workspace, child.status)?.id === lane.status?.id).length;
  const links = countLinks(ticket);
  return (
    <div
      {...pressable(() => onSelect({ kind: 'ticket', id: ticket.id }))}
      className="card ticket-card"
      title={ticket.url ? `${ticket.title}\nDouble-click to open` : ticket.title}
      {...clicks}
      {...drag}
      {...drop}
    >
      <span className="ticket-card__top">
        <ItemIcon icon={ticket.icon} kind="ticket" />
        {ticket.key && <span className="ticket">{ticket.key}</span>}
      </span>
      <span className="card__title">{ticket.title}</span>
      {(children.length > 0 || links > 0) && (
        <span className="ticket-card__meta">
          {children.length > 0 && (
            <span title={`${children.length} sub-tickets, ${done} in this status`}>
              <ListTree className="icon" aria-hidden="true" />
              {done}/{children.length}
            </span>
          )}
          {links > 0 && (
            <span title={`${links} links`}>
              <LinkIcon className="icon" aria-hidden="true" />
              {links}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
