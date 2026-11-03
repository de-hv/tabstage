import { browser, storage, type Browser } from '#imports';
import { getStatuses } from './statuses';
import { formatTitle, parseTitle } from './title';
import type { Status, StatusId } from './types';

type TabGroup = Browser.tabGroups.TabGroup;

/** The last status of each ticket key, kept on this device only. */
export const statusBackupItem = storage.defineItem<Record<string, StatusId>>(
  'local:statusBackup',
  { fallback: {} },
);

/**
 * Saves the status in the group's title under its ticket key. Writes only when
 * the entry changes. Returns whether it wrote.
 */
export async function remember(
  group: TabGroup,
  statuses?: readonly Status[],
): Promise<boolean> {
  const list = statuses ?? (await getStatuses());
  const { ticketKey, statusId } = parseTitle(group.title ?? '', list);
  if (!ticketKey || !statusId) return false;

  const backup = await statusBackupItem.getValue();
  if (backup[ticketKey] === statusId) return false;
  await statusBackupItem.setValue({ ...backup, [ticketKey]: statusId });
  return true;
}

/**
 * Adds the saved status back to a title with no status, and sets its color.
 * Does nothing when the title has a status, or when there is no saved status
 * that still exists. Returns whether it updated the group.
 */
export async function restore(
  group: TabGroup,
  statuses?: readonly Status[],
): Promise<boolean> {
  const list = statuses ?? (await getStatuses());
  const { name, ticketKey, statusId } = parseTitle(group.title ?? '', list);
  if (!ticketKey || statusId) return false;

  const saved = (await statusBackupItem.getValue())[ticketKey];
  const status = list.find((s) => s.id === saved);
  if (!status) return false;

  await browser.tabGroups.update(group.id, {
    title: formatTitle(name, status),
    color: status.color,
  });
  return true;
}

/** Drops the saved status of a ticket, so `restore` leaves it alone. */
export async function forget(ticketKey: string): Promise<void> {
  const backup = await statusBackupItem.getValue();
  if (!(ticketKey in backup)) return;
  const rest = { ...backup };
  delete rest[ticketKey];
  await statusBackupItem.setValue(rest);
}

/** Drops every saved entry that points to one of these statuses. */
export async function forgetStatuses(ids: readonly StatusId[]): Promise<void> {
  if (ids.length === 0) return;
  const backup = await statusBackupItem.getValue();
  const kept = Object.entries(backup).filter(([, id]) => !ids.includes(id));
  if (kept.length === Object.keys(backup).length) return;
  await statusBackupItem.setValue(Object.fromEntries(kept));
}
