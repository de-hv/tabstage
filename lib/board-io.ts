import { isAccentColor } from './colors';
import { validateStatuses } from './statuses';
import type { Board, BoardGroup, BoardItem, Status } from './types';

/** The backup file: the statuses and the board, as JSON. */
export interface Backup {
  app: 'tabstage';
  version: 1;
  exportedAt: string;
  statuses: Status[];
  board: Board;
}

export const BACKUP_FILE_NAME = 'tabstage-backup.json';

export function exportBackup(board: Board, statuses: readonly Status[], now = new Date()): string {
  const backup: Backup = {
    app: 'tabstage',
    version: 1,
    exportedAt: now.toISOString(),
    statuses: [...statuses],
    board,
  };
  return JSON.stringify(backup, null, 2);
}

/** A backup file that can't be imported. The message is shown to the user. */
export class BackupError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';

function parseStatus(value: unknown): Status {
  if (
    !isObject(value) ||
    !isString(value.id) ||
    !isString(value.label) ||
    !isAccentColor(value.color) ||
    typeof value.order !== 'number'
  ) {
    throw new BackupError('The file has an invalid status.');
  }
  return { id: value.id, label: value.label, color: value.color, order: value.order };
}

function parseGroup(value: unknown): BoardGroup {
  if (!isObject(value) || !isString(value.id) || !isString(value.name) || !isString(value.statusId)) {
    throw new BackupError('The file has an invalid group.');
  }
  return {
    id: value.id,
    name: value.name,
    statusId: value.statusId,
    collapsed: value.collapsed === true,
    order: typeof value.order === 'number' ? value.order : 0,
  };
}

function parseItem(value: unknown): BoardItem {
  if (
    !isObject(value) ||
    !isString(value.id) ||
    !isString(value.url) ||
    !isString(value.statusId) ||
    !(value.groupId === null || isString(value.groupId))
  ) {
    throw new BackupError('The file has an invalid tab.');
  }
  return {
    id: value.id,
    url: value.url,
    title: isString(value.title) ? value.title : value.url,
    ...(isString(value.favIconUrl) ? { favIconUrl: value.favIconUrl } : {}),
    statusId: value.statusId,
    groupId: value.groupId,
    // Tab ids belong to the session that exported them.
    tabId: null,
    order: typeof value.order === 'number' ? value.order : 0,
  };
}

/**
 * Reads a backup file. Throws a `BackupError` with a readable message when
 * it is not valid JSON, not a Tabstage backup, or its statuses don't pass
 * `validateStatuses`. Every tab comes back as a closed link; groups and items
 * pointing at an unknown status or group are rejected.
 */
export function parseBackup(text: string): { statuses: Status[]; board: Board } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('The file is not valid JSON.');
  }
  if (!isObject(data) || data.app !== 'tabstage' || data.version !== 1) {
    throw new BackupError('The file is not a Tabstage backup.');
  }
  if (!Array.isArray(data.statuses) || !isObject(data.board)) {
    throw new BackupError('The file is not a Tabstage backup.');
  }
  const statuses = data.statuses.map(parseStatus);
  const errors = validateStatuses(statuses);
  if (errors.length > 0) throw new BackupError(errors[0]!.message);

  const board = data.board;
  const groups = (Array.isArray(board.groups) ? board.groups : []).map(parseGroup);
  const items = (Array.isArray(board.items) ? board.items : []).map(parseItem);
  const statusIds = new Set(statuses.map((status) => status.id));
  const groupIds = new Set(groups.map((group) => group.id));
  if (groups.some((group) => !statusIds.has(group.statusId)) || items.some((item) => !statusIds.has(item.statusId))) {
    throw new BackupError('The file uses a status it does not define.');
  }
  if (items.some((item) => item.groupId !== null && !groupIds.has(item.groupId))) {
    throw new BackupError('The file uses a group it does not define.');
  }
  return { statuses, board: { groups, items } };
}
