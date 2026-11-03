import { browser, type Browser } from '#imports';
import { addItem, getBoard, groupsIn, updateBoard } from './board';
import { getStatuses } from './statuses';
import type { Board, Destination, Status } from './types';

/**
 * The page right-click menu: "Tabstage → Add to ▸ <status> / <group>". On
 * Firefox it is also on the tab strip's menu (`tab` context).
 */

export const ROOT_ID = 'tabstage';
export const ADD_TO_ID = 'tabstage-add-to';
const STATUS_PREFIX = 'tabstage-status:';
const GROUP_PREFIX = 'tabstage-group:';

type ContextType = `${Browser.contextMenus.ContextType}` | 'tab';

export interface MenuEntry {
  id: string;
  title: string;
  parentId?: string;
  type?: 'normal' | 'separator';
  contexts?: ContextType[];
}

interface MenusApi {
  create(properties: MenuEntry, callback?: () => void): number | string;
  removeAll(): Promise<void>;
  onClicked: {
    addListener(listener: (info: { menuItemId: number | string }, tab?: Browser.tabs.Tab) => void): void;
  };
}

/** Firefox exposes `menus` (with the `tab` context); Chrome `contextMenus`. */
export function menusApi(): MenusApi | undefined {
  const api = browser as unknown as { menus?: MenusApi; contextMenus?: MenusApi };
  return api.menus ?? api.contextMenus;
}

export function menuContexts(): ContextType[] {
  return import.meta.env.BROWSER === 'firefox' ? ['page', 'tab'] : ['page'];
}

/** The menu entries for the current statuses and groups, in order. */
export function buildMenuEntries(board: Board, statuses: readonly Status[]): MenuEntry[] {
  const contexts = menuContexts();
  const ordered = [...statuses].sort((a, b) => a.order - b.order);
  const entries: MenuEntry[] = [
    { id: ROOT_ID, title: 'Tabstage', contexts },
    { id: ADD_TO_ID, parentId: ROOT_ID, title: 'Add to', contexts },
    ...ordered.map((status) => ({
      id: `${STATUS_PREFIX}${status.id}`,
      parentId: ADD_TO_ID,
      title: status.label,
      contexts,
    })),
  ];
  const groups = ordered.flatMap((status) =>
    groupsIn(board, status.id).map((group) => ({ group, status })),
  );
  if (groups.length > 0) {
    entries.push({ id: 'tabstage-separator', parentId: ADD_TO_ID, type: 'separator', title: '', contexts });
    for (const { group, status } of groups) {
      entries.push({
        id: `${GROUP_PREFIX}${group.id}`,
        parentId: ADD_TO_ID,
        title: `${group.name} (${status.label})`,
        contexts,
      });
    }
  }
  return entries;
}

/** The destination of a clicked menu id, or `undefined` for other ids. */
export function destinationOf(menuItemId: number | string): Destination | undefined {
  const id = String(menuItemId);
  if (id.startsWith(STATUS_PREFIX)) return { kind: 'status', statusId: id.slice(STATUS_PREFIX.length) };
  if (id.startsWith(GROUP_PREFIX)) return { kind: 'group', groupId: id.slice(GROUP_PREFIX.length) };
  return undefined;
}

let building: Promise<void> = Promise.resolve();

/** Rebuilds the whole menu. Rebuilds run one after the other. */
export function rebuildMenus(): Promise<void> {
  const api = menusApi();
  if (!api) return Promise.resolve();
  building = building
    .then(async () => {
      const [board, statuses] = await Promise.all([getBoard(), getStatuses()]);
      await api.removeAll();
      for (const entry of buildMenuEntries(board, statuses)) api.create(entry);
    })
    .catch((error: unknown) => console.warn('Tabstage: could not build the menu', error));
  return building;
}

/** Adds the clicked page's tab to the chosen status or group. */
export async function handleMenuClick(menuItemId: number | string, tab: Browser.tabs.Tab | undefined): Promise<void> {
  const destination = destinationOf(menuItemId);
  if (!destination || !tab) return;
  await updateBoard((board) => addItem(board, tab, destination));
}
