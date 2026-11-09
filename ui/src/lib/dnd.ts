import type { Command, Folder, Group, Place, Tab, Workspace } from '../api/types';

/** What is being dragged. */
export type DragItem =
  | { kind: 'tab'; tab: string }
  | { kind: 'folder'; folder: string }
  | { kind: 'group'; group: string };

/** Where it is dropped. */
export type DropTarget =
  /** On a tab or folder row of a list: take that row's place. */
  | { kind: 'before'; node: string }
  /** The empty space after a list. */
  | { kind: 'end'; place: Place }
  /** On a folder header: into the folder. */
  | { kind: 'folder'; folder: string }
  /** On a group in the sidebar. */
  | { kind: 'group'; group: string }
  /** On a status tile of the board. */
  | { kind: 'tile'; status: string | null };

/** Where a tab or folder sits: its list and its index in that list. */
interface Location {
  group: Group;
  folder?: Folder;
  index: number;
}

function locate(workspace: Workspace, id: string): Location | null {
  for (const group of workspace.groups) {
    for (const [index, node] of group.children.entries()) {
      if (node.id === id) return { group, index };
      if (node.type === 'folder') {
        const inFolder = node.tabs.findIndex((tab) => tab.id === id);
        if (inFolder !== -1) return { group, folder: node, index: inFolder };
      }
    }
  }
  return null;
}

function findTab(workspace: Workspace, id: string): Tab | undefined {
  const at = locate(workspace, id);
  if (!at) return undefined;
  const node = at.folder ? at.folder.tabs[at.index] : at.group.children[at.index];
  return node as Tab | undefined;
}

function findFolder(workspace: Workspace, id: string): Folder | undefined {
  for (const group of workspace.groups) {
    const node = group.children.find((child) => child.id === id);
    if (node?.type === 'folder') return node;
  }
  return undefined;
}

function samePlace(at: Location, place: Place): boolean {
  return 'folder' in place ? at.folder?.id === place.folder : !at.folder && at.group.id === place.group;
}

function placeOf(at: Location): Place {
  return at.folder ? { folder: at.folder.id } : { group: at.group.id };
}

function listLength(workspace: Workspace, place: Place): number | null {
  if ('folder' in place) return findFolder(workspace, place.folder)?.tabs.length ?? null;
  return workspace.groups.find((group) => group.id === place.group)?.children.length ?? null;
}

/**
 * The index to send for "put it at `index` of `place`": the Rust side removes
 * the item first, so a move down the same list lands one slot earlier.
 * `null` when the item would stay where it is.
 */
function finalIndex(from: Location, place: Place, index: number): number | null {
  if (!samePlace(from, place)) return index;
  const adjusted = from.index < index ? index - 1 : index;
  return adjusted === from.index ? null : adjusted;
}

function moveTab(workspace: Workspace, tab: string, place: Place, index: number): Command | null {
  const from = locate(workspace, tab);
  if (!from) return null;
  const to = finalIndex(from, place, index);
  return to === null ? null : { type: 'moveTab', tab, place, index: to };
}

function moveFolder(workspace: Workspace, folder: string, group: string, index: number): Command | null {
  const from = locate(workspace, folder);
  if (!from) return null;
  const to = finalIndex(from, { group }, index);
  return to === null ? null : { type: 'moveFolder', folder, group, index: to };
}

/** The command a drop means, or `null` when it would change nothing. */
export function dropCommand(item: DragItem, target: DropTarget, workspace: Workspace): Command | null {
  switch (item.kind) {
    case 'tab':
      return dropTab(item.tab, target, workspace);
    case 'folder':
      return dropFolder(item.folder, target, workspace);
    case 'group':
      return dropGroup(item.group, target, workspace);
  }
}

function dropTab(tab: string, target: DropTarget, workspace: Workspace): Command | null {
  switch (target.kind) {
    case 'before': {
      if (target.node === tab) return null;
      const at = locate(workspace, target.node);
      return at ? moveTab(workspace, tab, placeOf(at), at.index) : null;
    }
    case 'end': {
      const length = listLength(workspace, target.place);
      return length === null ? null : moveTab(workspace, tab, target.place, length);
    }
    case 'folder': {
      const folder = findFolder(workspace, target.folder);
      // Already inside: the header is not a "move to the end" target.
      if (!folder || folder.tabs.some((candidate) => candidate.id === tab)) return null;
      return moveTab(workspace, tab, { folder: folder.id }, folder.tabs.length);
    }
    case 'group': {
      const length = listLength(workspace, { group: target.group });
      return length === null ? null : moveTab(workspace, tab, { group: target.group }, length);
    }
    case 'tile': {
      const at = locate(workspace, tab);
      // A folder status decides the tile of every tab in it.
      if (!at || at.folder?.status) return null;
      const current = findTab(workspace, tab)?.status ?? null;
      return current === target.status ? null : { type: 'setStatus', target: { tab }, status: target.status };
    }
  }
}

function dropFolder(folder: string, target: DropTarget, workspace: Workspace): Command | null {
  switch (target.kind) {
    case 'before':
    case 'folder': {
      const node = target.kind === 'before' ? target.node : target.folder;
      if (node === folder) return null;
      const at = locate(workspace, node);
      // Folders only live in a group's top level.
      if (!at || at.folder) return null;
      return moveFolder(workspace, folder, at.group.id, at.index);
    }
    case 'end': {
      if ('folder' in target.place) return null;
      const length = listLength(workspace, target.place);
      return length === null ? null : moveFolder(workspace, folder, target.place.group, length);
    }
    case 'group': {
      const length = listLength(workspace, { group: target.group });
      return length === null ? null : moveFolder(workspace, folder, target.group, length);
    }
    case 'tile': {
      const current = findFolder(workspace, folder)?.status ?? null;
      return current === target.status
        ? null
        : { type: 'setStatus', target: { folder }, status: target.status };
    }
  }
}

function dropGroup(group: string, target: DropTarget, workspace: Workspace): Command | null {
  if (target.kind !== 'group' || target.group === group) return null;
  const index = workspace.groups.findIndex((candidate) => candidate.id === target.group);
  return index === -1 ? null : { type: 'moveGroup', group, index };
}

/** A "Move to…" menu entry: a keyboard way to do what dragging does. */
export interface MoveDestination {
  label: string;
  command: Command;
}

/**
 * Where a tab or folder can be moved from its menu: every group (to its
 * end) and, for tabs, every folder. The current container is left out.
 */
export function moveDestinations(item: DragItem, workspace: Workspace): MoveDestination[] {
  if (item.kind === 'group') return [];
  const id = item.kind === 'tab' ? item.tab : item.folder;
  const at = locate(workspace, id);
  const destinations: MoveDestination[] = [];
  for (const group of workspace.groups) {
    const isHere = item.kind === 'tab' ? at?.group.id === group.id && !at.folder : at?.group.id === group.id;
    const toGroup = isHere ? null : dropCommand(item, { kind: 'group', group: group.id }, workspace);
    if (toGroup) destinations.push({ label: group.name, command: toGroup });
    if (item.kind !== 'tab') continue;
    for (const node of group.children) {
      if (node.type !== 'folder') continue;
      const toFolder = dropCommand(item, { kind: 'folder', folder: node.id }, workspace);
      if (toFolder) destinations.push({ label: `${group.name} / ${node.name}`, command: toFolder });
    }
  }
  return destinations;
}
