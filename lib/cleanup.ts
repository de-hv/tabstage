import { browser } from '#imports';
import { V1_DEFAULT_LABELS } from './statuses';
import { stripStatusSuffix } from './title';
import type { Status } from './types';

/**
 * The opt-in cleanup of the v1 ` · <status>` suffix in native tab group
 * titles. This is the only code that touches native groups: it runs only when
 * the user presses the Options button, asks for `tabGroups` as an optional
 * permission first, and changes titles only (never colors or grouping).
 */

interface TabGroupsApi {
  query(info: object): Promise<{ id: number; title?: string }[]>;
  update(groupId: number, properties: { title: string }): Promise<unknown>;
}

export type CleanupResult =
  | { kind: 'denied' }
  | { kind: 'unsupported' }
  | { kind: 'done'; cleaned: number };

/**
 * Asks for the permission and strips the suffix of every group whose title
 * ends with a current or v1 default status label. Call it straight from the
 * click: `permissions.request` needs the user gesture, so it runs before any
 * await.
 */
export async function cleanupNativeTitles(statuses: readonly Status[]): Promise<CleanupResult> {
  const granted = await browser.permissions.request({ permissions: ['tabGroups'] });
  if (!granted) return { kind: 'denied' };
  const tabGroups = (browser as unknown as { tabGroups?: TabGroupsApi }).tabGroups;
  if (!tabGroups) return { kind: 'unsupported' };

  const labels = [...statuses.map((status) => status.label), ...V1_DEFAULT_LABELS];
  let cleaned = 0;
  for (const group of await tabGroups.query({})) {
    const title = stripStatusSuffix(group.title ?? '', labels);
    if (title === null) continue;
    await tabGroups.update(group.id, { title });
    cleaned++;
  }
  return { kind: 'done', cleaned };
}
