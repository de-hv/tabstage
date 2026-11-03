import { browser, type Browser } from '#imports';
import { boardItem } from '@/lib/board';
import { handleMenuClick, menusApi, rebuildMenus } from '@/lib/menus';
import { enableActionToggle, openPalette, openPanel } from '@/lib/panel';
import { statusesItem } from '@/lib/statuses';
import { registerTracker } from '@/lib/tracker';
import type { Board } from '@/lib/types';

const TOGGLE_PANEL = 'toggle-panel';
const OPEN_PALETTE = 'open-palette';

/** What the page menu shows of the board: the groups' names, statuses and order. */
function menuSignature(board: Board | null): string {
  return JSON.stringify(
    (board?.groups ?? []).map(({ id, name, statusId, order }) => [id, name, statusId, order]),
  );
}

function warn(what: string) {
  return (error: unknown) => console.warn(`Tabstage: could not ${what}`, error);
}

/**
 * Tracks the added tabs, builds the page menu and opens the panel. It never
 * reads or changes native tab groups.
 */
export default defineBackground(() => {
  void registerTracker();
  enableActionToggle();

  void rebuildMenus();
  statusesItem.watch(() => void rebuildMenus());
  boardItem.watch((next, prev) => {
    if (menuSignature(next) !== menuSignature(prev)) void rebuildMenus();
  });
  menusApi()?.onClicked.addListener((info, tab) => {
    handleMenuClick(info.menuItemId, tab).catch(warn('add the tab'));
  });

  browser.commands.onCommand.addListener((command: string, tab?: Browser.tabs.Tab) => {
    // Both open calls run before any await, while the shortcut's gesture holds.
    if (command === TOGGLE_PANEL) openPanel(tab?.windowId).catch(warn('open the side panel'));
    if (command === OPEN_PALETTE) openPalette(tab?.windowId).catch(warn('open the palette'));
  });
});
