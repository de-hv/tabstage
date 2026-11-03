import { browser, storage, type Browser } from '#imports';
import { tabUrl, updateBoard } from './board';
import type { Board, BoardItem, TabInfo } from './types';

/**
 * Keeps board items linked to their tabs. During a session an item is linked
 * by `tabId`; tab ids change between sessions, so after a browser start (and
 * when a tab is created) closed items are linked again by URL. Native tab
 * groups are never read or changed.
 */

/**
 * Set once per browser session. `storage.session` is cleared when the browser
 * quits, so a missing flag means the stored tab ids are from an old session.
 */
export const sessionLinkedItem = storage.defineItem<boolean>('session:linked', {
  fallback: false,
});

/** Copies url, title and favicon from a tab, when they changed. */
function refresh(item: BoardItem, tab: TabInfo): BoardItem {
  const url = tabUrl(tab) || item.url;
  const title = tab.title || item.title;
  const favIconUrl = tab.favIconUrl ?? item.favIconUrl;
  if (url === item.url && title === item.title && favIconUrl === item.favIconUrl) return item;
  return { ...item, url, title, ...(favIconUrl ? { favIconUrl } : {}) };
}

/**
 * Links closed items to open tabs with the same URL. Each tab links to at
 * most one item, and tabs already linked to an item are skipped, so two tabs
 * with the same URL fill two closed items.
 */
export function linkByUrl(board: Board, tabs: readonly TabInfo[]): Board {
  const taken = new Set(board.items.map((item) => item.tabId).filter((id) => id !== null));
  const free = tabs.filter((tab) => tab.id !== undefined && !taken.has(tab.id));
  let changed = false;
  const items = board.items.map((item) => {
    if (item.tabId !== null) return item;
    const at = free.findIndex((tab) => tabUrl(tab) === item.url);
    if (at === -1) return item;
    const [tab] = free.splice(at, 1);
    changed = true;
    return { ...refresh(item, tab!), tabId: tab!.id! };
  });
  return changed ? { ...board, items } : board;
}

/**
 * Checks the stored links against the open tabs. With `fresh` (a new browser
 * session) every stored tab id is stale and is dropped first; otherwise items
 * whose tab is gone become closed links. Then closed items relink by URL.
 */
export function relink(board: Board, tabs: readonly TabInfo[], fresh: boolean): Board {
  const open = new Set(tabs.map((tab) => tab.id));
  const items = board.items.map((item) =>
    item.tabId !== null && (fresh || !open.has(item.tabId)) ? { ...item, tabId: null } : item,
  );
  return linkByUrl({ ...board, items }, tabs);
}

/** Refreshes the item linked to `tabId`. */
export function applyTabUpdate(board: Board, tabId: number, tab: TabInfo): Board {
  let changed = false;
  const items = board.items.map((item) => {
    if (item.tabId !== tabId) return item;
    const next = refresh(item, tab);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? { ...board, items } : board;
}

/** The item linked to `tabId` becomes a closed link. */
export function applyTabRemoved(board: Board, tabId: number): Board {
  if (!board.items.some((item) => item.tabId === tabId)) return board;
  return {
    ...board,
    items: board.items.map((item) => (item.tabId === tabId ? { ...item, tabId: null } : item)),
  };
}

/** `updateBoard` writes only when the change did something. */
async function change(apply: (board: Board) => Board): Promise<void> {
  await updateBoard(apply);
}

/** Relinks the board against the open tabs (browser start, import). */
export async function relinkOpenTabs(fresh = false): Promise<void> {
  const tabs = await browser.tabs.query({});
  await change((board) => relink(board, tabs, fresh));
}

/** Opens a closed item in a new tab and links it. */
export async function reopenItem(item: BoardItem): Promise<void> {
  const tab = await browser.tabs.create({ url: item.url, active: true });
  if (tab.id === undefined) return;
  const tabId = tab.id;
  await updateBoard((board) => ({
    ...board,
    items: board.items.map((entry) => {
      if (entry.id === item.id) return { ...entry, tabId };
      // The background may have linked the new tab to another closed item
      // with the same URL first.
      return entry.tabId === tabId ? { ...entry, tabId: null } : entry;
    }),
  }));
}

/** Brings an open item's tab and window to the front. */
export async function focusItemTab(tabId: number): Promise<void> {
  const tab = await browser.tabs.update(tabId, { active: true });
  if (tab?.windowId !== undefined) {
    await browser.windows.update(tab.windowId, { focused: true });
  }
}

/** Opens the item: focuses its tab, or reopens a closed link. */
export async function openItem(item: BoardItem): Promise<void> {
  if (item.tabId === null) return reopenItem(item);
  try {
    await focusItemTab(item.tabId);
  } catch {
    // The tab is gone and the background missed it: reopen.
    await reopenItem({ ...item, tabId: null });
  }
}

function warn(what: string) {
  return (error: unknown) => console.warn(`Tabstage: could not ${what}`, error);
}

/**
 * Registers the tab listeners in the background and relinks once. Call it
 * synchronously from `defineBackground`, so events that wake the service
 * worker reach the listeners.
 */
export function registerTracker(): Promise<void> {
  // Each listener returns its promise: the browser ignores it, tests await it.
  browser.tabs.onCreated.addListener((tab: Browser.tabs.Tab) => {
    if (!tabUrl(tab)) return undefined;
    return change((board) => linkByUrl(board, [tab])).catch(warn('link a new tab'));
  });

  browser.tabs.onUpdated.addListener(
    (tabId: number, info: Browser.tabs.OnUpdatedInfo, tab: Browser.tabs.Tab) => {
      if (info.url === undefined && info.title === undefined && info.favIconUrl === undefined) {
        return undefined;
      }
      return change((board) => {
        const linked = board.items.some((item) => item.tabId === tabId);
        // A restored or reopened tab often gets its URL after onCreated.
        return linked ? applyTabUpdate(board, tabId, tab) : linkByUrl(board, [tab]);
      }).catch(warn('update a tab'));
    },
  );

  browser.tabs.onRemoved.addListener((tabId: number) => {
    return change((board) => applyTabRemoved(board, tabId)).catch(warn('unlink a closed tab'));
  });

  return (async () => {
    const fresh = !(await sessionLinkedItem.getValue());
    await relinkOpenTabs(fresh);
    await sessionLinkedItem.setValue(true);
  })().catch(warn('relink the board'));
}
