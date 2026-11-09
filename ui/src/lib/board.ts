import type { Folder, Group, Status, Tab } from '../api/types';

export type BoardItem =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'tab'; tab: Tab; folder?: Folder };

export interface Tile {
  /** `null` is the "no status" tile. */
  status: Status | null;
  items: BoardItem[];
}

/**
 * Splits a group into one tile per status, in status order, plus a last
 * tile for items without a status.
 *
 * A folder with a status stays together in that tile, since its status
 * applies to every tab in it. The tabs of a folder without status go to the
 * tile of their own status and keep a reference to the folder.
 */
export function groupByStatus(group: Group, statuses: Status[]): Tile[] {
  const tiles: Tile[] = [...statuses.map((status) => ({ status, items: [] })), { status: null, items: [] }];
  const none = tiles.length - 1;
  const tileFor = (id: string | undefined): Tile => {
    const index = statuses.findIndex((status) => status.id === id);
    return tiles[index === -1 ? none : index] as Tile;
  };

  for (const node of group.children) {
    if (node.type === 'tab') {
      tileFor(node.status).items.push({ kind: 'tab', tab: node });
    } else if (node.status && statuses.some((status) => status.id === node.status)) {
      tileFor(node.status).items.push({ kind: 'folder', folder: node });
    } else {
      for (const tab of node.tabs) tileFor(tab.status).items.push({ kind: 'tab', tab, folder: node });
    }
  }
  return tiles;
}
