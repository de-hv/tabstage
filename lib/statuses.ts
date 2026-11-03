import { storage } from '#imports';
import { V1_COLOR_TO_ACCENT, isAccentColor, type AccentColor } from './colors';
import type { Status, StatusId } from './types';

export const DEFAULT_STATUSES: readonly Status[] = [
  { id: 'todo', label: 'To do', color: 'lavender', order: 0 },
  { id: 'in-progress', label: 'In progress', color: 'blue', order: 1 },
  { id: 'in-review', label: 'In review', color: 'mauve', order: 2 },
  { id: 'in-dev', label: 'In dev', color: 'peach', order: 3 },
  { id: 'done', label: 'Done', color: 'green', order: 4 },
];

/** The ids of the v1 default statuses, used to spot an untouched v1 list. */
export const V1_DEFAULT_IDS = ['todo', 'in-progress', 'review', 'dev', 'test', 'stg', 'prod', 'done'];

/** The v1 default labels; the opt-in cleanup strips them from native titles. */
export const V1_DEFAULT_LABELS = ['To do', 'In progress', 'Review', 'Dev', 'Test', 'STG', 'PROD', 'Done'];

function copyDefaults(): Status[] {
  return DEFAULT_STATUSES.map((status) => ({ ...status }));
}

function toAccent(color: unknown): AccentColor {
  if (isAccentColor(color)) return color;
  return (typeof color === 'string' && V1_COLOR_TO_ACCENT[color]) || 'lavender';
}

/**
 * Turns the v1 list (native group colors) into v2: an untouched v1 default
 * list becomes the new defaults; a customized one keeps its statuses and
 * gets the closest accent for each color.
 */
export function migrateV1Statuses(stored: unknown): Status[] {
  if (!Array.isArray(stored) || stored.length === 0) return copyDefaults();
  const list = stored as Status[];
  const ids = list.map((status) => status.id);
  const untouched =
    ids.length === V1_DEFAULT_IDS.length && V1_DEFAULT_IDS.every((id) => ids.includes(id));
  if (untouched) return copyDefaults();
  return normalizeStatuses(list);
}

/**
 * The configured statuses, synced across the user's browsers. Version 2
 * moved from native group colors to the accent palette.
 */
export const statusesItem = storage.defineItem<Status[]>('sync:statuses', {
  fallback: copyDefaults(),
  version: 2,
  migrations: { 2: migrateV1Statuses },
});

/**
 * Sorts by `order`, renumbers from 0 and fixes any color that is not an
 * accent (a browser still on v1 can sync one in). Returns new objects.
 */
export function normalizeStatuses(statuses: readonly Status[]): Status[] {
  return [...statuses]
    .sort((a, b) => a.order - b.order)
    .map((status, index) => ({ ...status, color: toAccent(status.color), order: index }));
}

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(label: string, statuses: readonly Status[]): StatusId {
  const base = slugify(label) || 'status';
  const taken = new Set(statuses.map((status) => status.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export async function getStatuses(): Promise<Status[]> {
  return normalizeStatuses(await statusesItem.getValue());
}

export async function saveStatuses(statuses: readonly Status[]): Promise<void> {
  await statusesItem.setValue(normalizeStatuses(statuses));
}

/** Stores the default statuses again. */
export async function resetStatuses(): Promise<void> {
  await statusesItem.setValue(copyDefaults());
}

/**
 * Adds a status with an id made from its label, at the end of the list or
 * right after `afterId`.
 */
export function addStatus(
  statuses: readonly Status[],
  { label, color }: Pick<Status, 'label' | 'color'>,
  afterId?: StatusId,
): Status[] {
  const list = normalizeStatuses(statuses);
  const added: Status = { id: uniqueId(label, list), label, color, order: list.length };
  const at = afterId === undefined ? -1 : list.findIndex((status) => status.id === afterId);
  if (at === -1) return [...list, added];
  return moveStatus([...list, added], added.id, at + 1);
}

export function removeStatus(statuses: readonly Status[], id: StatusId): Status[] {
  return normalizeStatuses(statuses.filter((status) => status.id !== id));
}

export function renameStatus(statuses: readonly Status[], id: StatusId, label: string): Status[] {
  return normalizeStatuses(
    statuses.map((status) => (status.id === id ? { ...status, label } : status)),
  );
}

export function recolorStatus(
  statuses: readonly Status[],
  id: StatusId,
  color: AccentColor,
): Status[] {
  return normalizeStatuses(
    statuses.map((status) => (status.id === id ? { ...status, color } : status)),
  );
}

/** Moves a status to `toIndex`, clamped to the list bounds. */
export function moveStatus(statuses: readonly Status[], id: StatusId, toIndex: number): Status[] {
  const list = normalizeStatuses(statuses);
  const moved = list.find((status) => status.id === id);
  if (!moved) return list;
  const rest = list.filter((status) => status !== moved);
  const to = Math.min(Math.max(toIndex, 0), rest.length);
  rest.splice(to, 0, moved);
  return rest.map((status, index) => ({ ...status, order: index }));
}

/** Finds a status by its label, ignoring case and surrounding spaces. */
export function findStatusByLabel(
  statuses: readonly Status[],
  label: string,
): Status | undefined {
  const wanted = label.trim().toLowerCase();
  return statuses.find((status) => status.label.trim().toLowerCase() === wanted);
}

/** A reason a status list can't be saved. `statusId` is `null` for the list. */
export interface StatusError {
  statusId: StatusId | null;
  message: string;
}

/**
 * Checks a list before it is saved: at least one status, every label
 * non-empty and unique ignoring case, every color an accent. Every status
 * that shares a label gets an error. Returns no errors for a valid list.
 */
export function validateStatuses(statuses: readonly Status[]): StatusError[] {
  if (statuses.length === 0) {
    return [{ statusId: null, message: 'Keep at least one status.' }];
  }

  const count = new Map<string, number>();
  for (const { label } of statuses) {
    const key = label.trim().toLowerCase();
    count.set(key, (count.get(key) ?? 0) + 1);
  }

  const errors: StatusError[] = [];
  for (const { id, label, color } of statuses) {
    const trimmed = label.trim();
    if (!trimmed) {
      errors.push({ statusId: id, message: 'A status needs a label.' });
    } else if ((count.get(trimmed.toLowerCase()) ?? 0) > 1) {
      errors.push({
        statusId: id,
        message: `"${trimmed}" is used by more than one status (case is ignored).`,
      });
    } else if (!isAccentColor(color)) {
      errors.push({ statusId: id, message: `"${trimmed}" has an unknown color.` });
    }
  }
  return errors;
}
