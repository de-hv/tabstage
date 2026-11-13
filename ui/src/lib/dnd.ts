import type { Command, Target, Uuid, Workspace } from '../api/types';
import { findNote, findProfile, findTicket, laneIndex, lanes, pinnedIndex } from './workspace';

/** What is being dragged. */
export type DragItem =
  | { kind: 'ticket'; ticket: Uuid }
  | { kind: 'note'; note: Uuid }
  | { kind: 'status'; status: Uuid }
  | { kind: 'profile'; profile: Uuid };

/** Where it is dropped. */
export type DropTarget =
  /** A status lane of a profile (`status: null` is "No status"): a ticket goes there, before `before` or at the end. */
  | { kind: 'lane'; profile: Uuid; status: Uuid | null; before?: Uuid }
  /** Before a sub-ticket, as a sibling. */
  | { kind: 'beforeSubTicket'; ticket: Uuid }
  /** Into a top-level ticket, as its last sub-ticket. */
  | { kind: 'intoTicket'; ticket: Uuid }
  /** Before or after a status in the workflow; `null` is "No status", which stays last. */
  | { kind: 'status'; status: Uuid | null; after: boolean }
  /** Before a note, or at the end of a profile's notes. */
  | { kind: 'notes'; profile: Uuid; before?: Uuid }
  /** A profile row: a ticket or note moves to it, a profile moves to its place. */
  | { kind: 'profile'; profile: Uuid }
  /** The "Pinned" section: pin it, or reorder it, before `before` or at the end. */
  | { kind: 'pinned'; before?: Target };

/** The target a dragged ticket or note stands for. */
export function dragTarget(item: DragItem): Target | null {
  switch (item.kind) {
    case 'ticket':
      return { ticket: item.ticket };
    case 'note':
      return { note: item.note };
    case 'status':
    case 'profile':
      return null;
  }
}

/** The command a drop means, or `null` when it would change nothing. */
export function dropCommand(item: DragItem, target: DropTarget, workspace: Workspace): Command | null {
  if (target.kind === 'pinned') return dropPinned(item, target.before, workspace);
  switch (item.kind) {
    case 'ticket':
      return dropTicket(item.ticket, target, workspace);
    case 'note':
      return dropNote(item.note, target, workspace);
    case 'status':
      return dropStatus(item.status, target, workspace);
    case 'profile':
      return dropProfile(item.profile, target, workspace);
  }
}

function dropTicket(id: Uuid, target: DropTarget, workspace: Workspace): Command | null {
  const from = findTicket(workspace, id);
  if (!from) return null;
  if (target.kind === 'lane') {
    if (target.before === id) return null;
    const profile = findProfile(workspace, target.profile);
    const lane = profile && lanes(workspace, profile).find((candidate) => (candidate.status?.id ?? null) === target.status);
    if (!profile || !lane) return null;
    let index = laneIndex(profile, lane, target.before);
    const fromIndex = from.parent || from.profile.id !== profile.id ? -1 : profile.tickets.findIndex((t) => t.id === id);
    // The Rust side removes the ticket first, so a move down lands one slot earlier.
    if (fromIndex !== -1 && fromIndex < index) index -= 1;
    const sameStatus = (from.ticket.status ?? null) === target.status;
    if (fromIndex === index && sameStatus) return null;
    return {
      type: 'moveTicket',
      ticket: id,
      place: { profile: profile.id },
      index,
      ...(sameStatus && !from.parent ? {} : { lane: { status: target.status } }),
    };
  }
  if (target.kind === 'intoTicket') {
    if (target.ticket === id || (from.ticket.children?.length ?? 0) > 0) return null;
    const to = findTicket(workspace, target.ticket);
    if (!to || to.parent) return null;
    const siblings = to.ticket.children ?? [];
    if (from.parent?.id === to.ticket.id) {
      // Already in it: move it to the end.
      const fromIndex = siblings.findIndex((child) => child.id === id);
      const index = siblings.length - 1;
      return fromIndex === index ? null : { type: 'moveTicket', ticket: id, place: { ticket: to.ticket.id }, index };
    }
    return { type: 'moveTicket', ticket: id, place: { ticket: to.ticket.id }, index: siblings.length };
  }
  if (target.kind === 'beforeSubTicket') {
    if (target.ticket === id || (from.ticket.children?.length ?? 0) > 0) return null;
    const to = findTicket(workspace, target.ticket);
    if (!to?.parent) return null;
    const siblings = to.parent.children ?? [];
    let index = siblings.findIndex((child) => child.id === target.ticket);
    if (from.parent?.id === to.parent.id) {
      const fromIndex = siblings.findIndex((child) => child.id === id);
      if (fromIndex < index) index -= 1;
      if (fromIndex === index) return null;
    }
    return { type: 'moveTicket', ticket: id, place: { ticket: to.parent.id }, index };
  }
  if (target.kind === 'profile') {
    if (from.profile.id === target.profile && !from.parent) return null;
    const profile = findProfile(workspace, target.profile);
    return profile ? { type: 'moveTicket', ticket: id, place: { profile: profile.id }, index: profile.tickets.length } : null;
  }
  return null;
}

function dropNote(id: Uuid, target: DropTarget, workspace: Workspace): Command | null {
  const from = findNote(workspace, id);
  if (!from) return null;
  const profileId = target.kind === 'notes' || target.kind === 'profile' ? target.profile : null;
  const profile = profileId ? findProfile(workspace, profileId) : undefined;
  if (!profile) return null;
  let index = profile.notes.length;
  if (target.kind === 'notes' && target.before) {
    if (target.before === id) return null;
    index = profile.notes.findIndex((note) => note.id === target.before);
    if (index === -1) return null;
  } else if (target.kind === 'profile' && from.profile.id === profile.id) {
    return null;
  }
  if (from.profile.id === profile.id) {
    const fromIndex = profile.notes.findIndex((note) => note.id === id);
    if (fromIndex < index) index -= 1;
    if (fromIndex === index) return null;
  }
  return { type: 'moveNote', note: id, profile: profile.id, index };
}

function dropStatus(id: Uuid, target: DropTarget, workspace: Workspace): Command | null {
  if (target.kind !== 'status') return null;
  const { statuses } = workspace;
  const fromIndex = statuses.findIndex((status) => status.id === id);
  if (fromIndex === -1) return null;
  let index: number;
  if (target.status === null) {
    // "No status" is always last: dropping on it moves a status to the end.
    index = statuses.length;
  } else {
    const at = statuses.findIndex((status) => status.id === target.status);
    if (at === -1) return null;
    index = target.after ? at + 1 : at;
  }
  // The Rust side removes the status first, so a move down lands one slot earlier.
  if (fromIndex < index) index -= 1;
  return index === fromIndex ? null : { type: 'moveStatus', status: id, index };
}

function dropProfile(profile: Uuid, target: DropTarget, workspace: Workspace): Command | null {
  if (target.kind !== 'profile' || target.profile === profile) return null;
  const index = workspace.profiles.findIndex((candidate) => candidate.id === target.profile);
  return index === -1 ? null : { type: 'moveProfile', profile, index };
}

/** Pins what is dropped on the "Pinned" section, or moves it there when it already is. */
function dropPinned(item: DragItem, before: Target | undefined, workspace: Workspace): Command | null {
  const target = dragTarget(item);
  if (!target) return null;
  const from = pinnedIndex(workspace, target);
  if (from === -1) return { type: 'pin', target };
  const count = workspace.pinned?.length ?? 0;
  const to = before ? pinnedIndex(workspace, before) : count;
  if (to === -1) return null;
  const index = from < to ? to - 1 : to;
  return index === from ? null : { type: 'movePinned', target, index };
}
