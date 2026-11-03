import { browser, type Browser } from '#imports';
import { remember, restore } from '@/lib/backup';
import { migrateTitles } from '@/lib/migrate';
import { getStatuses, statusesItem } from '@/lib/statuses';

const TOGGLE_PANEL = 'toggle-panel';

/**
 * Saves the group's status, or adds a saved one back to a title with none.
 * Both write only on change, so the extension's own updates don't loop.
 */
async function syncGroup(group: Browser.tabGroups.TabGroup): Promise<void> {
  try {
    const statuses = await getStatuses();
    if (!(await restore(group, statuses))) await remember(group, statuses);
  } catch (error) {
    console.warn('Tabstage: could not sync group', group.id, error);
  }
}

/**
 * Opens the side panel in the tab's window. Chrome only: Firefox opens the
 * sidebar with `_execute_sidebar_action`, and `browser.sidePanel` is undefined
 * there and on Chrome until a side panel entrypoint exists.
 */
async function openSidePanel(tab: Browser.tabs.Tab | undefined): Promise<void> {
  const sidePanel = browser.sidePanel as typeof browser.sidePanel | undefined;
  if (!sidePanel?.open) return;
  // Uses the tab's window first: an extra await could lose the user gesture
  // that `sidePanel.open` needs.
  const windowId = tab?.windowId ?? (await browser.windows.getCurrent()).id;
  if (windowId === undefined) return;
  try {
    await sidePanel.open({ windowId });
  } catch (error) {
    console.warn('Tabstage: could not open the side panel', error);
  }
}

export default defineBackground(() => {
  browser.tabGroups.onCreated.addListener(syncGroup);
  browser.tabGroups.onUpdated.addListener(syncGroup);

  statusesItem.watch((next, prev) => {
    migrateTitles(prev, next).catch((error: unknown) => {
      console.warn('Tabstage: could not migrate group titles', error);
    });
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === TOGGLE_PANEL) void openSidePanel(tab);
  });
});
