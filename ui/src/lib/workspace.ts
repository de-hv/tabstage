import type { Note, Profile, Status, Target, Ticket, Uuid, Workspace } from '../api/types';

export function findProfile(workspace: Workspace, id: Uuid): Profile | undefined {
  return workspace.profiles.find((profile) => profile.id === id);
}

/** A ticket or sub-ticket with its profile and, for a sub-ticket, its parent. */
export interface TicketRef {
  profile: Profile;
  parent?: Ticket;
  ticket: Ticket;
}

export function findTicket(workspace: Workspace, id: Uuid): TicketRef | null {
  for (const profile of workspace.profiles) {
    for (const ticket of profile.tickets) {
      if (ticket.id === id) return { profile, ticket };
      const child = ticket.children?.find((candidate) => candidate.id === id);
      if (child) return { profile, parent: ticket, ticket: child };
    }
  }
  return null;
}

export function findNote(workspace: Workspace, id: Uuid): { profile: Profile; note: Note } | null {
  for (const profile of workspace.profiles) {
    const note = profile.notes.find((candidate) => candidate.id === id);
    if (note) return { profile, note };
  }
  return null;
}

export function findStatus(workspace: Workspace, id: Uuid | undefined | null): Status | undefined {
  return id ? workspace.statuses.find((status) => status.id === id) : undefined;
}

/** The tickets and sub-tickets of every profile, in order. */
export function allTickets(workspace: Workspace): TicketRef[] {
  return workspace.profiles.flatMap((profile) =>
    profile.tickets.flatMap((ticket) => [
      { profile, ticket },
      ...(ticket.children ?? []).map((child) => ({ profile, parent: ticket, ticket: child })),
    ]),
  );
}

/** A status lane of a profile: the tickets with that status, in order. */
export interface Lane {
  /** `null` for "No status". */
  status: Status | null;
  tickets: Ticket[];
}

/**
 * A profile's tickets by status, in workflow order, with "No status" last.
 * A ticket whose status no longer exists counts as having none.
 */
export function lanes(workspace: Workspace, profile: Profile): Lane[] {
  const known = new Set(workspace.statuses.map((status) => status.id));
  const result: Lane[] = workspace.statuses.map((status) => ({
    status,
    tickets: profile.tickets.filter((ticket) => ticket.status === status.id),
  }));
  result.push({ status: null, tickets: profile.tickets.filter((ticket) => !ticket.status || !known.has(ticket.status)) });
  return result;
}

/** Index in `profile.tickets` to insert at so a ticket lands at the end of a lane, or before `before`. */
export function laneIndex(profile: Profile, lane: Lane, before?: Uuid): number {
  if (before) {
    const index = profile.tickets.findIndex((ticket) => ticket.id === before);
    if (index !== -1) return index;
  }
  const last = lane.tickets.at(-1);
  return last ? profile.tickets.findIndex((ticket) => ticket.id === last.id) + 1 : profile.tickets.length;
}

/** The id a target points at. */
export function targetId(target: Target): Uuid {
  return 'ticket' in target ? target.ticket : target.note;
}

export function sameTarget(a: Target, b: Target): boolean {
  if ('ticket' in a) return 'ticket' in b && a.ticket === b.ticket;
  return 'note' in b && a.note === b.note;
}

/** Position of an item in the "Pinned" section, or -1. */
export function pinnedIndex(workspace: Workspace, target: Target): number {
  return (workspace.pinned ?? []).findIndex((pinned) => sameTarget(pinned, target));
}

/** A pinned item with what the sidebar shows of it. */
export type PinnedItem = { target: Target; profile: Profile } & (
  | { kind: 'ticket'; item: Ticket; status?: Status }
  | { kind: 'note'; item: Note }
);

/** The pinned items that still exist, in order. */
export function pinnedItems(workspace: Workspace): PinnedItem[] {
  return (workspace.pinned ?? []).flatMap((target): PinnedItem[] => {
    if ('ticket' in target) {
      const found = findTicket(workspace, target.ticket);
      return found
        ? [{ target, profile: found.profile, kind: 'ticket', item: found.ticket, status: findStatus(workspace, found.ticket.status) }]
        : [];
    }
    const found = findNote(workspace, target.note);
    return found ? [{ target, profile: found.profile, kind: 'note', item: found.note }] : [];
  });
}

/** The notes that mention a ticket's key, in any profile. */
export function mentionsOf(workspace: Workspace, key: string | undefined): { profile: Profile; note: Note }[] {
  if (!key) return [];
  const pattern = new RegExp(`(^|[^A-Za-z0-9-])${escapeRegExp(key)}(?![A-Za-z0-9-])`, 'i');
  return workspace.profiles.flatMap((profile) =>
    profile.notes.filter((note) => pattern.test(note.body ?? '')).map((note) => ({ profile, note })),
  );
}

/** Tickets with a key, by key in upper case, for linking keys in notes. */
export function ticketsByKey(workspace: Workspace): Map<string, Ticket> {
  const keys = new Map<string, Ticket>();
  for (const { ticket } of allTickets(workspace)) {
    if (ticket.key && !keys.has(ticket.key.toUpperCase())) keys.set(ticket.key.toUpperCase(), ticket);
  }
  return keys;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
