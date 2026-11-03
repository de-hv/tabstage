import * as ops from './board';
import { getBoard, updateBoard, type DeleteStatusChoice } from './board';
import {
  addStatus,
  getStatuses,
  moveStatus,
  recolorStatus,
  removeStatus,
  renameStatus,
  resetStatuses,
  saveStatuses,
  validateStatuses,
  DEFAULT_STATUSES,
  type StatusError,
} from './statuses';
import { openItem, reopenItem } from './tracker';
import type { AccentColor } from './colors';
import type { Destination, StatusId, TabInfo } from './types';

/**
 * The board and status changes the panel and the options page run. Each one
 * reads the stored value, applies a pure operation and saves it. Native tab
 * groups are never touched.
 */

export const addTabs = (tabs: readonly TabInfo[], destination: Destination) =>
  updateBoard((board) => ops.addItems(board, tabs, destination));

export const moveItem = (itemId: string, destination: Destination) =>
  updateBoard((board) => ops.moveItem(board, itemId, destination));

export const moveGroup = (groupId: string, statusId: StatusId) =>
  updateBoard((board) => ops.moveGroup(board, groupId, statusId));

/** Creates a group with the given items and resolves to its id. */
export async function createGroup(input: { name: string; statusId: StatusId; itemIds?: string[] }): Promise<string> {
  const id = ops.newId();
  await updateBoard((board) => ops.createGroup(board, { ...input, id }));
  return id;
}

export const ungroup = (groupId: string) => updateBoard((board) => ops.ungroup(board, groupId));

export const renameGroup = (groupId: string, name: string) =>
  updateBoard((board) => ops.renameGroup(board, groupId, name));

export const setGroupCollapsed = (groupId: string, collapsed: boolean) =>
  updateBoard((board) => ops.setGroupCollapsed(board, groupId, collapsed));

export const removeItem = (itemId: string) => updateBoard((board) => ops.removeItem(board, itemId));

export const removeGroup = (groupId: string) => updateBoard((board) => ops.removeGroup(board, groupId));

export const clearClosed = (scope?: { groupId: string }) =>
  updateBoard((board) => ops.clearClosed(board, scope));

/** Reopens every closed link of a group; open ones are left as they are. */
export async function openAll(groupId: string): Promise<void> {
  const board = await getBoard();
  for (const item of ops.itemsIn(board, { kind: 'group', groupId })) {
    if (item.tabId === null) await reopenItem(item);
  }
}

export { openItem };

/** Validates and saves a status list; resolves to the errors, if any. */
async function saveChecked(next: Parameters<typeof saveStatuses>[0]): Promise<StatusError[]> {
  const errors = validateStatuses(next);
  if (errors.length === 0) await saveStatuses(next);
  return errors;
}

export async function renameStatusLabel(id: StatusId, label: string): Promise<StatusError[]> {
  return saveChecked(renameStatus(await getStatuses(), id, label.trim()));
}

export async function setStatusColor(id: StatusId, color: AccentColor): Promise<StatusError[]> {
  return saveChecked(recolorStatus(await getStatuses(), id, color));
}

/** Moves a status one place up (-1) or down (+1). */
export async function shiftStatus(id: StatusId, offset: -1 | 1): Promise<StatusError[]> {
  const statuses = await getStatuses();
  const index = statuses.findIndex((status) => status.id === id);
  if (index === -1) return [];
  return saveChecked(moveStatus(statuses, id, index + offset));
}

/** Adds a status with a free "New status" label, after `afterId` or last. */
export async function addNewStatus(
  { label, color }: { label?: string; color?: AccentColor } = {},
  afterId?: StatusId,
): Promise<StatusError[]> {
  const statuses = await getStatuses();
  let name = label?.trim() ?? '';
  if (!name) {
    name = 'New status';
    for (let n = 2; statuses.some((s) => s.label.toLowerCase() === name.toLowerCase()); n++) {
      name = `New status ${n}`;
    }
  }
  return saveChecked(addStatus(statuses, { label: name, color: color ?? 'lavender' }, afterId));
}

/**
 * Deletes a status. Its groups and loose items move to `choice.moveTo` or are
 * removed; the board is saved first, so nothing points at a missing status.
 */
export async function deleteStatusAndItems(id: StatusId, choice: DeleteStatusChoice): Promise<StatusError[]> {
  const statuses = await getStatuses();
  const next = removeStatus(statuses, id);
  const errors = validateStatuses(next);
  if (errors.length > 0) return errors;
  await updateBoard((board) => ops.deleteStatus(board, id, choice));
  await saveStatuses(next);
  return [];
}

/** Restores the default statuses; items of removed statuses go to the first one. */
export async function restoreDefaultStatuses(): Promise<void> {
  const ids = DEFAULT_STATUSES.map((status) => status.id);
  await updateBoard((board) => ops.adoptOrphans(board, ids, ids[0]!));
  await resetStatuses();
}
