import { browser, type Browser } from '#imports';
import { forget } from './backup';
import type { GroupColor } from './colors';
import { getStatuses } from './statuses';
import { formatTitle, parseTitle } from './title';
import type { Status, StatusId } from './types';

/** A tab inside a group, with the fields the views need. */
export interface GroupTab {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
}

/** A native tab group with its parsed status and its tabs. */
export interface Group {
  id: number;
  windowId: number;
  /** The full title, status suffix included. */
  title: string;
  color: GroupColor;
  collapsed: boolean;
  name: string;
  ticketKey: string;
  statusId: StatusId | null;
  /** In tab strip order. */
  tabs: GroupTab[];
}

function toGroupTab(tab: Browser.tabs.Tab & { id: number }): GroupTab {
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    title: tab.title ?? '',
    url: tab.url ?? '',
    favIconUrl: tab.favIconUrl,
    active: tab.active,
  };
}

/**
 * Lists every group in every window, in tab strip order, with its parsed
 * status and its tabs.
 */
export async function listGroups(
  statuses?: readonly Status[],
): Promise<Group[]> {
  const [groups, tabs, list] = await Promise.all([
    browser.tabGroups.query({}),
    browser.tabs.query({}),
    statuses ?? getStatuses(),
  ]);

  const tabsByGroup = new Map<number, GroupTab[]>();
  for (const tab of tabs) {
    if (tab.id === undefined || tab.groupId === browser.tabGroups.TAB_GROUP_ID_NONE) {
      continue;
    }
    const groupTabs = tabsByGroup.get(tab.groupId) ?? [];
    groupTabs.push(toGroupTab({ ...tab, id: tab.id }));
    tabsByGroup.set(tab.groupId, groupTabs);
  }

  const firstIndex = (group: Group) =>
    group.tabs[0]?.index ?? Number.MAX_SAFE_INTEGER;

  return groups
    .map((group): Group => {
      const title = group.title ?? '';
      return {
        id: group.id,
        windowId: group.windowId,
        title,
        color: group.color,
        collapsed: group.collapsed,
        ...parseTitle(title, list),
        tabs: (tabsByGroup.get(group.id) ?? []).sort((a, b) => a.index - b.index),
      };
    })
    .sort((a, b) => a.windowId - b.windowId || firstIndex(a) - firstIndex(b));
}

/**
 * Sets a group's status, writing its title and color in one update. `null`
 * removes the status suffix, keeps the color, and drops the ticket's backup so
 * the background doesn't add the status back.
 */
export async function setStatus(
  groupId: number,
  statusId: StatusId | null,
): Promise<void> {
  const [group, statuses] = await Promise.all([
    browser.tabGroups.get(groupId),
    getStatuses(),
  ]);
  const { name, ticketKey } = parseTitle(group.title ?? '', statuses);

  if (statusId === null) {
    await forget(ticketKey);
    await browser.tabGroups.update(groupId, { title: formatTitle(name, null) });
    return;
  }

  const status = statuses.find((s) => s.id === statusId);
  if (!status) throw new Error(`Unknown status: ${statusId}`);
  await browser.tabGroups.update(groupId, {
    title: formatTitle(name, status),
    color: status.color,
  });
}

/** Activates the tab and focuses its window. */
export async function focusTab(tabId: number): Promise<void> {
  const tab = await browser.tabs.update(tabId, { active: true });
  if (tab) await browser.windows.update(tab.windowId, { focused: true });
}

/** Collapses an expanded group, or expands a collapsed one. */
export async function toggleCollapse(groupId: number): Promise<void> {
  const group = await browser.tabGroups.get(groupId);
  await browser.tabGroups.update(groupId, { collapsed: !group.collapsed });
}
