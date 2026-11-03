import { browser, type Browser } from '#imports';
import { forgetStatuses } from './backup';
import { formatTitle, parseTitle } from './title';
import type { Status, StatusId } from './types';

type UpdateProperties = Browser.tabGroups.UpdateProperties;

/** What changed for one status id, or `null` when it was deleted. */
type Change = { status: Status; recolored: boolean } | null;

function diffStatuses(
  prev: readonly Status[],
  next: readonly Status[],
): Map<StatusId, Change> {
  const changes = new Map<StatusId, Change>();
  for (const before of prev) {
    const after = next.find((s) => s.id === before.id);
    if (!after) {
      changes.set(before.id, null);
    } else if (after.label !== before.label || after.color !== before.color) {
      changes.set(before.id, {
        status: after,
        recolored: after.color !== before.color,
      });
    }
  }
  return changes;
}

/**
 * Rewrites the groups whose status was renamed, recolored or deleted between
 * `prev` and `next`, matching statuses by id. A rename replaces the label and
 * keeps the color, a recolor sets the new color, and a delete strips the suffix
 * so the group lands in "No status". Returns how many groups it updated.
 */
export async function migrateTitles(
  prev: readonly Status[],
  next: readonly Status[],
): Promise<number> {
  const changes = diffStatuses(prev, next);
  if (changes.size === 0) return 0;

  const deleted = [...changes].filter(([, c]) => c === null).map(([id]) => id);
  // Before the titles change, so the background can't restore a deleted status.
  await forgetStatuses(deleted);

  const groups = await browser.tabGroups.query({});
  let updated = 0;
  for (const group of groups) {
    const { name, statusId } = parseTitle(group.title ?? '', prev);
    if (!statusId || !changes.has(statusId)) continue;

    const change = changes.get(statusId) ?? null;
    const properties: UpdateProperties = {
      title: formatTitle(name, change?.status ?? null),
    };
    if (change?.recolored) properties.color = change.status.color;
    if (properties.title === group.title && !properties.color) continue;

    await browser.tabGroups.update(group.id, properties);
    updated++;
  }
  return updated;
}
