import type { Command, Place, Target, Workspace } from '../api/types';
import { listLength, type Location, locate, pinnedIndex, placeLabel, samePlace } from './workspace';

/** What is being dragged. */
export type DragItem =
  | { kind: 'tab'; tab: string }
  | { kind: 'folder'; folder: string }
  | { kind: 'group'; group: string }
  | { kind: 'profile'; profile: string };

/** Where it is dropped. */
export type DropTarget =
  /** On a group, folder or tab row: take that row's place. */
  | { kind: 'before'; node: string }
  /** On a profile, group or folder (header, sidebar row or board column): go to its end. */
  | { kind: 'into'; place: Place }
  /** The space after a list: go to its end, also from within the same list. */
  | { kind: 'end'; place: Place }
  /** The "Pinned" section: pin it, or reorder it, before `before` or at the end. */
  | { kind: 'pinned'; before?: Target };

/**
 * The index to send for "put it at `index` of `place`": the Rust side removes
 * the item first, so a move down the same list lands one slot earlier.
 * `null` when the item would stay where it is.
 */
function finalIndex(from: Location, place: Place, index: number): number | null {
  if (!samePlace(from.place, place)) return index;
  const adjusted = from.index < index ? index - 1 : index;
  return adjusted === from.index ? null : adjusted;
}

/** Where a drop puts things, or `null` for a target that does not exist. */
function destination(workspace: Workspace, target: DropTarget): { place: Place; index: number } | null {
  if (target.kind === 'into' || target.kind === 'end') {
    const length = listLength(workspace, target.place);
    return length === null ? null : { place: target.place, index: length };
  }
  if (target.kind === 'pinned') return null;
  const at = locate(workspace, target.node);
  return at ? { place: at.place, index: at.index } : null;
}

/** The command a drop means, or `null` when it would change nothing. */
export function dropCommand(item: DragItem, target: DropTarget, workspace: Workspace): Command | null {
  if (target.kind === 'pinned') return dropPinned(item, target.before, workspace);
  if (item.kind === 'profile') return dropProfile(item.profile, target, workspace);
  const id = item.kind === 'tab' ? item.tab : item.kind === 'folder' ? item.folder : item.group;
  if (target.kind === 'before' && target.node === id) return null;
  const from = locate(workspace, id);
  const to = destination(workspace, target);
  if (!from || !to) return null;
  // Dropping on its own container is not a "move to the end".
  if (target.kind === 'into' && samePlace(from.place, to.place)) return null;
  const index = finalIndex(from, to.place, to.index);
  if (index === null) return null;
  switch (item.kind) {
    case 'tab':
      return { type: 'moveTab', tab: item.tab, place: to.place, index };
    case 'folder':
      // Folders do not nest.
      return 'folder' in to.place ? null : { type: 'moveFolder', folder: item.folder, place: to.place, index };
    case 'group':
      // Groups only live directly in a profile.
      return 'profile' in to.place
        ? { type: 'moveGroup', group: item.group, profile: to.place.profile, index }
        : null;
  }
}

/** The target a dragged group, folder or tab stands for. */
export function dragTarget(item: DragItem): Target | null {
  switch (item.kind) {
    case 'tab':
      return { tab: item.tab };
    case 'folder':
      return { folder: item.folder };
    case 'group':
      return { group: item.group };
    case 'profile':
      return null;
  }
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
  // The Rust side removes the item first, so a move down lands one slot earlier.
  const index = from < to ? to - 1 : to;
  return index === from ? null : { type: 'movePinned', target, index };
}

function dropProfile(profile: string, target: DropTarget, workspace: Workspace): Command | null {
  if (target.kind === 'pinned' || target.kind === 'before' || !('profile' in target.place) || target.place.profile === profile) return null;
  const onto = target.place.profile;
  const index = workspace.profiles.findIndex((candidate) => candidate.id === onto);
  return index === -1 ? null : { type: 'moveProfile', profile, index };
}

/** A "Move to…" menu entry: a keyboard way to do what dragging does. */
export interface MoveDestination {
  label: string;
  command: Command;
}

/** Every place, profile by profile, in tree order. */
function allPlaces(workspace: Workspace): Place[] {
  return workspace.profiles.flatMap((profile) => [
    { profile: profile.id },
    ...profile.items.flatMap((item): Place[] => {
      if (item.type === 'folder') return [{ folder: item.id }];
      if (item.type === 'tab') return [];
      return [
        { group: item.id },
        ...item.children.flatMap((node): Place[] => (node.type === 'folder' ? [{ folder: node.id }] : [])),
      ];
    }),
  ]);
}

/** Where an item can be moved from its menu; its current place is left out. */
export function moveDestinations(item: DragItem, workspace: Workspace): MoveDestination[] {
  if (item.kind === 'profile') return [];
  return allPlaces(workspace).flatMap((place) => {
    const command = dropCommand(item, { kind: 'into', place }, workspace);
    return command ? [{ label: placeLabel(workspace, place), command }] : [];
  });
}
