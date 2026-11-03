import { groupsIn, itemsIn } from './board';
import type { Board, BoardGroup, BoardItem, Status, StatusId } from './types';

/** A group as a tile shows it. */
export interface GroupView {
  group: BoardGroup;
  items: BoardItem[];
}

/** One status tile: its groups, then its loose items. */
export interface Tile {
  status: Status;
  groups: GroupView[];
  items: BoardItem[];
  /** Items shown in the tile (loose and grouped). */
  count: number;
  /** Nothing to show: the tile is drawn compact, at half width. */
  empty: boolean;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function itemMatches(item: BoardItem, query: string): boolean {
  return item.title.toLowerCase().includes(query) || item.url.toLowerCase().includes(query);
}

/**
 * Builds a tile per status, in status order. Groups and items whose status
 * no longer exists go to the first status, so nothing is hidden.
 *
 * With a filter (case and extra spaces ignored), a group whose name matches
 * keeps all its items; other groups keep only their matching items and are
 * dropped when none match. Every status keeps its tile.
 */
export function buildTiles(board: Board, statuses: readonly Status[], filter = ''): Tile[] {
  const ordered = [...statuses].sort((a, b) => a.order - b.order);
  const first = ordered[0]?.id;
  const known = new Set(ordered.map((status) => status.id));
  const home = (statusId: StatusId) => (known.has(statusId) ? statusId : first);
  const query = normalize(filter);

  return ordered.map((status) => {
    const sourceIds = [status.id, ...(status.id === first ? orphanIds(board, known) : [])];

    const groups: GroupView[] = [];
    for (const statusId of sourceIds) {
      for (const group of groupsIn(board, statusId)) {
        if (home(group.statusId) !== status.id) continue;
        const all = itemsIn(board, { kind: 'group', groupId: group.id });
        const items =
          !query || group.name.toLowerCase().includes(query)
            ? all
            : all.filter((item) => itemMatches(item, query));
        if (!query || items.length > 0) groups.push({ group, items });
      }
    }

    const items = sourceIds
      .flatMap((statusId) => itemsIn(board, { kind: 'status', statusId }))
      .filter((item) => !query || itemMatches(item, query));

    const count = items.length + groups.reduce((sum, view) => sum + view.items.length, 0);
    return { status, groups, items, count, empty: groups.length === 0 && items.length === 0 };
  });
}

/** Status ids used on the board that aren't configured. */
function orphanIds(board: Board, known: Set<StatusId>): StatusId[] {
  const ids = new Set<StatusId>();
  for (const group of board.groups) if (!known.has(group.statusId)) ids.add(group.statusId);
  for (const item of board.items) {
    if (item.groupId === null && !known.has(item.statusId)) ids.add(item.statusId);
  }
  return [...ids];
}
