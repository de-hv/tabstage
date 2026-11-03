import { storage } from '#imports';
import type {
  Board,
  BoardGroup,
  BoardItem,
  Destination,
  StatusId,
  TabInfo,
} from './types';

/**
 * Pure board operations. Each returns a new board and never mutates its
 * input; unknown ids leave the board unchanged. Orders are renumbered from 0
 * with no gaps after every change (see `reorder`).
 */

export const EMPTY_BOARD: Readonly<Board> = Object.freeze({ groups: [], items: [] });

/** The added tabs and groups, kept in `storage.local` (sync has a small quota). */
export const boardItem = storage.defineItem<Board>('local:board', {
  fallback: { groups: [], items: [] },
});

export async function getBoard(): Promise<Board> {
  return normalizeBoard(await boardItem.getValue());
}

/** Accepts a stored or imported value and returns a well-formed board. */
export function normalizeBoard(value: Partial<Board> | null | undefined): Board {
  return reorder({
    groups: Array.isArray(value?.groups) ? value.groups : [],
    items: Array.isArray(value?.items) ? value.items : [],
  });
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Reads the board, applies `change` and saves the result (only when it
 * returned a new board). Calls in the same
 * page run one after the other, so two quick changes don't overwrite each
 * other.
 */
export function updateBoard(change: (board: Board) => Board): Promise<Board> {
  const run = queue.then(async () => {
    const board = await getBoard();
    const next = change(board);
    // Operations return their input when nothing changed: skip the write.
    if (next !== board) await boardItem.setValue(next);
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function newId(): string {
  return crypto.randomUUID();
}

/** The status an item is shown in: its group's, or its own when loose. */
export function itemStatusId(board: Board, item: BoardItem): StatusId {
  if (item.groupId === null) return item.statusId;
  return board.groups.find((group) => group.id === item.groupId)?.statusId ?? item.statusId;
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/** Items in one container (a status's loose items, or a group), in order. */
export function itemsIn(board: Board, container: Destination): BoardItem[] {
  return board.items
    .filter((item) =>
      container.kind === 'group'
        ? item.groupId === container.groupId
        : item.groupId === null && item.statusId === container.statusId,
    )
    .sort(byOrder);
}

/** Groups of a status, in order. */
export function groupsIn(board: Board, statusId: StatusId): BoardGroup[] {
  return board.groups.filter((group) => group.statusId === statusId).sort(byOrder);
}

/**
 * Renumbers `order` from 0 with no gaps: groups per status, loose items per
 * status and grouped items per group. Grouped items take their group's
 * status; items of a missing group become loose.
 */
export function reorder(board: Board): Board {
  const groupIds = new Set(board.groups.map((group) => group.id));
  const groupStatus = new Map(board.groups.map((group) => [group.id, group.statusId]));

  const groups = renumber(board.groups, (group) => group.statusId);
  const items = renumber(
    board.items.map((item) => {
      if (item.groupId !== null && !groupIds.has(item.groupId)) {
        return { ...item, groupId: null };
      }
      const statusId = item.groupId === null ? item.statusId : groupStatus.get(item.groupId)!;
      return statusId === item.statusId ? { ...item } : { ...item, statusId };
    }),
    (item) => (item.groupId === null ? `status:${item.statusId}` : `group:${item.groupId}`),
  );
  return { groups, items };
}

/** Renumbers per key, keeping the list's original positions. */
function renumber<T extends { order: number }>(list: T[], keyOf: (entry: T) => string): T[] {
  const buckets = new Map<string, T[]>();
  for (const entry of list) {
    const key = keyOf(entry);
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }
  const orderOf = new Map<T, number>();
  for (const bucket of buckets.values()) {
    // Stable sort: equal orders keep their list position.
    [...bucket].sort(byOrder).forEach((entry, index) => orderOf.set(entry, index));
  }
  return list.map((entry) =>
    entry.order === orderOf.get(entry) ? { ...entry } : { ...entry, order: orderOf.get(entry)! },
  );
}

function resolve(board: Board, destination: Destination): { statusId: StatusId; groupId: string | null } | undefined {
  if (destination.kind === 'status') return { statusId: destination.statusId, groupId: null };
  const group = board.groups.find((g) => g.id === destination.groupId);
  return group ? { statusId: group.statusId, groupId: group.id } : undefined;
}

/** Puts an item last in a container. */
function place(board: Board, item: BoardItem, destination: Destination): Board {
  const target = resolve(board, destination);
  if (!target) return board;
  const last = itemsIn(board, destination).filter((other) => other.id !== item.id);
  const moved: BoardItem = {
    ...item,
    ...target,
    order: (last.at(-1)?.order ?? -1) + 1,
  };
  const exists = board.items.some((other) => other.id === item.id);
  const items = exists
    ? board.items.map((other) => (other.id === item.id ? moved : other))
    : [...board.items, moved];
  return reorder({ ...board, items });
}

export function tabUrl(tab: TabInfo): string {
  return tab.url || tab.pendingUrl || '';
}

/**
 * Adds a tab at the end of `destination`. A tab that is already on the board
 * (same `tabId`) is moved there instead, so it never shows twice.
 */
export function addItem(
  board: Board,
  tab: TabInfo,
  destination: Destination,
  id: string = newId(),
): Board {
  const existing = tab.id === undefined ? undefined : board.items.find((item) => item.tabId === tab.id);
  if (existing) return place(board, existing, destination);
  const url = tabUrl(tab);
  const item: BoardItem = {
    id,
    url,
    title: tab.title || url || 'Untitled tab',
    ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
    statusId: '',
    groupId: null,
    tabId: tab.id ?? null,
    order: 0,
  };
  return place(board, item, destination);
}

/** Adds several tabs, in order. */
export function addItems(board: Board, tabs: readonly TabInfo[], destination: Destination): Board {
  return tabs.reduce((next, tab) => addItem(next, tab, destination), board);
}

/** Moves an item to the end of a status (loose) or a group. */
export function moveItem(board: Board, itemId: string, destination: Destination): Board {
  const item = board.items.find((entry) => entry.id === itemId);
  return item ? place(board, item, destination) : board;
}

/** Moves a group, with its items, to the end of another status. */
export function moveGroup(board: Board, groupId: string, statusId: StatusId): Board {
  const group = board.groups.find((entry) => entry.id === groupId);
  if (!group || group.statusId === statusId) return board;
  const order = (groupsIn(board, statusId).at(-1)?.order ?? -1) + 1;
  return reorder({
    ...board,
    groups: board.groups.map((entry) => (entry === group ? { ...entry, statusId, order } : entry)),
  });
}

/**
 * Creates a group at the end of `statusId` and moves `itemIds` into it, in
 * that order.
 */
export function createGroup(
  board: Board,
  { name, statusId, itemIds = [], id = newId() }: { name: string; statusId: StatusId; itemIds?: string[]; id?: string },
): Board {
  const order = (groupsIn(board, statusId).at(-1)?.order ?? -1) + 1;
  const group: BoardGroup = { id, name: name.trim() || 'New group', statusId, collapsed: false, order };
  return groupItems({ ...board, groups: [...board.groups, group] }, itemIds, id);
}

/** Moves items into an existing group, at its end. */
export function groupItems(board: Board, itemIds: readonly string[], groupId: string): Board {
  return itemIds.reduce(
    (next, itemId) => moveItem(next, itemId, { kind: 'group', groupId }),
    board,
  );
}

/** Removes a group; its items stay as loose items of the group's status. */
export function ungroup(board: Board, groupId: string): Board {
  const group = board.groups.find((entry) => entry.id === groupId);
  if (!group) return board;
  const loose = itemsIn(board, { kind: 'status', statusId: group.statusId });
  let next = (loose.at(-1)?.order ?? -1) + 1;
  const members = new Map(itemsIn(board, { kind: 'group', groupId }).map((item) => [item.id, next++]));
  return reorder({
    groups: board.groups.filter((entry) => entry !== group),
    items: board.items.map((item) =>
      members.has(item.id)
        ? { ...item, groupId: null, statusId: group.statusId, order: members.get(item.id)! }
        : item,
    ),
  });
}

export function renameGroup(board: Board, groupId: string, name: string): Board {
  const trimmed = name.trim();
  if (!trimmed) return board;
  return {
    ...board,
    groups: board.groups.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group)),
  };
}

export function setGroupCollapsed(board: Board, groupId: string, collapsed: boolean): Board {
  return {
    ...board,
    groups: board.groups.map((group) => (group.id === groupId ? { ...group, collapsed } : group)),
  };
}

export function removeItem(board: Board, itemId: string): Board {
  return reorder({ ...board, items: board.items.filter((item) => item.id !== itemId) });
}

/** Removes a group and every item in it. */
export function removeGroup(board: Board, groupId: string): Board {
  return reorder({
    groups: board.groups.filter((group) => group.id !== groupId),
    items: board.items.filter((item) => item.groupId !== groupId),
  });
}

/** Removes closed links: all of them, or only those in a group. */
export function clearClosed(board: Board, scope?: { groupId: string }): Board {
  return reorder({
    ...board,
    items: board.items.filter(
      (item) => item.tabId !== null || (scope !== undefined && item.groupId !== scope.groupId),
    ),
  });
}

export type DeleteStatusChoice = { moveTo: StatusId } | { remove: true };

/**
 * Clears a status from the board before the status itself is deleted: its
 * groups and loose items either move to the end of `moveTo` or are removed,
 * with the items of those groups.
 */
export function deleteStatus(board: Board, statusId: StatusId, choice: DeleteStatusChoice): Board {
  if ('remove' in choice) {
    const groupIds = new Set(groupsIn(board, statusId).map((group) => group.id));
    return reorder({
      groups: board.groups.filter((group) => !groupIds.has(group.id)),
      items: board.items.filter((item) =>
        item.groupId === null ? item.statusId !== statusId : !groupIds.has(item.groupId),
      ),
    });
  }
  const { moveTo } = choice;
  if (moveTo === statusId) return board;
  const groupStart = (groupsIn(board, moveTo).at(-1)?.order ?? -1) + 1;
  const itemStart = (itemsIn(board, { kind: 'status', statusId: moveTo }).at(-1)?.order ?? -1) + 1;
  return reorder({
    groups: board.groups.map((group) =>
      group.statusId === statusId ? { ...group, statusId: moveTo, order: groupStart + group.order } : group,
    ),
    items: board.items.map((item) =>
      item.groupId === null && item.statusId === statusId
        ? { ...item, statusId: moveTo, order: itemStart + item.order }
        : item,
    ),
  });
}

/** Counts the items shown in a status (loose and grouped). */
export function countInStatus(board: Board, statusId: StatusId): number {
  return board.items.filter((item) => itemStatusId(board, item) === statusId).length;
}

/** Moves every group and item whose status is not in `statusIds` to `fallback`. */
export function adoptOrphans(board: Board, statusIds: readonly StatusId[], fallback: StatusId): Board {
  const known = new Set(statusIds);
  const orphanStatuses = new Set([
    ...board.groups.map((group) => group.statusId),
    ...board.items.filter((item) => item.groupId === null).map((item) => item.statusId),
  ].filter((id) => !known.has(id)));
  return [...orphanStatuses].reduce(
    (next, statusId) => deleteStatus(next, statusId, { moveTo: fallback }),
    board,
  );
}
