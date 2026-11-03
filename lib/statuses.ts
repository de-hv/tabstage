import { storage } from '#imports';
import type { GroupColor } from './colors';
import type { Status, StatusId } from './types';

export const DEFAULT_STATUSES: readonly Status[] = [
  { id: 'todo', label: 'To do', color: 'grey', order: 0 },
  { id: 'in-progress', label: 'In progress', color: 'blue', order: 1 },
  { id: 'review', label: 'Review', color: 'purple', order: 2 },
  { id: 'dev', label: 'Dev', color: 'cyan', order: 3 },
  { id: 'test', label: 'Test', color: 'yellow', order: 4 },
  { id: 'stg', label: 'STG', color: 'orange', order: 5 },
  { id: 'prod', label: 'PROD', color: 'pink', order: 6 },
  { id: 'done', label: 'Done', color: 'green', order: 7 },
];

/** The configured statuses, synced across the user's browsers. */
export const statusesItem = storage.defineItem<Status[]>('sync:statuses', {
  fallback: copyDefaults(),
});

function copyDefaults(): Status[] {
  return DEFAULT_STATUSES.map((status) => ({ ...status }));
}

/** Sorts by `order` and renumbers from 0, returning new objects. */
function normalize(statuses: readonly Status[]): Status[] {
  return [...statuses]
    .sort((a, b) => a.order - b.order)
    .map((status, index) => ({ ...status, order: index }));
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
  return normalize(await statusesItem.getValue());
}

export async function saveStatuses(statuses: readonly Status[]): Promise<void> {
  await statusesItem.setValue(normalize(statuses));
}

/** Stores the default statuses again. */
export async function resetStatuses(): Promise<void> {
  await statusesItem.setValue(copyDefaults());
}

/** Adds a status at the end of the list, with an id made from its label. */
export function addStatus(
  statuses: readonly Status[],
  { label, color }: Pick<Status, 'label' | 'color'>,
): Status[] {
  const list = normalize(statuses);
  return [
    ...list,
    { id: uniqueId(label, list), label, color, order: list.length },
  ];
}

export function removeStatus(
  statuses: readonly Status[],
  id: StatusId,
): Status[] {
  return normalize(statuses.filter((status) => status.id !== id));
}

export function renameStatus(
  statuses: readonly Status[],
  id: StatusId,
  label: string,
): Status[] {
  return normalize(
    statuses.map((status) =>
      status.id === id ? { ...status, label } : status,
    ),
  );
}

export function recolorStatus(
  statuses: readonly Status[],
  id: StatusId,
  color: GroupColor,
): Status[] {
  return normalize(
    statuses.map((status) =>
      status.id === id ? { ...status, color } : status,
    ),
  );
}

/** Moves a status to `toIndex`, clamped to the list bounds. */
export function moveStatus(
  statuses: readonly Status[],
  id: StatusId,
  toIndex: number,
): Status[] {
  const list = normalize(statuses);
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
