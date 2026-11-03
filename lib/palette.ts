import { itemStatusId } from './board';
import type { Board, BoardGroup, BoardItem, Status } from './types';

/** What a palette result does when it runs. */
export type PaletteAction =
  /** Focuses the item's tab, or reopens a closed link. */
  | { kind: 'open-item'; id: string; item: BoardItem; status: Status | undefined }
  /** Scrolls the panel to the group and focuses it. */
  | { kind: 'show-group'; id: string; group: BoardGroup; status: Status | undefined }
  | { kind: 'move-item'; id: string; item: BoardItem; status: Status }
  | { kind: 'move-group'; id: string; group: BoardGroup; status: Status }
  /** Adds the active tab of the current window. */
  | { kind: 'add-tab'; id: string; status: Status };

/** At most this many results are returned. */
export const MAX_RESULTS = 50;

const ADD_WORD = 'add';

const SCORE = {
  addExact: 1000,
  statusList: 800,
  move: 600,
  statusExactBonus: 50,
  statusPrefixList: 250,
  group: 200,
  item: 100,
  addPrefix: 90,
} as const;

interface Scored {
  action: PaletteAction;
  score: number;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

const TICKET_KEY = /[a-z][a-z0-9]+-(\d+)/;

/**
 * How well `query` names a group or item: 100 for the whole name, 90 for a
 * ticket number in it (`6115` for `CAR-6115 spec`), 70 for a name prefix or a
 * ticket number suffix, 50 for a name match, 0 for none.
 */
export function scoreName(name: string, query: string): number {
  const text = normalize(name);
  const number = TICKET_KEY.exec(text)?.[1];
  if (text === query) return 100;
  if (number === query) return 90;
  if (text.startsWith(query) || (number?.endsWith(query) ?? false)) return 70;
  if (text.includes(query)) return 50;
  return 0;
}

function scoreItem(item: BoardItem, query: string): number {
  const score = scoreName(item.title, query);
  if (score) return score;
  return item.url.toLowerCase().includes(query) ? 20 : 0;
}

/** 2 for an exact label or id, 1 for a prefix, 0 for no match. */
function matchStatus(status: Status, query: string): number {
  const names = [normalize(status.label), status.id.toLowerCase()];
  if (names.includes(query)) return 2;
  return names.some((name) => name.startsWith(query)) ? 1 : 0;
}

/** `<item|group> <status>`: every split of the words into a ref and a status. */
function moveResults(words: string[], board: Board, statuses: readonly Status[]): Scored[] {
  const results: Scored[] = [];
  for (let split = 1; split < words.length; split++) {
    const ref = words.slice(0, split).join(' ');
    const statusPart = words.slice(split).join(' ');
    if (ref === ADD_WORD) continue;
    for (const status of statuses) {
      const match = matchStatus(status, statusPart);
      if (!match) continue;
      const bonus = match === 2 ? SCORE.statusExactBonus : 0;
      for (const group of board.groups) {
        const score = scoreName(group.name, ref);
        if (!score || group.statusId === status.id) continue;
        results.push({
          action: { kind: 'move-group', id: `move-group-${group.id}-${status.id}`, group, status },
          score: SCORE.move + score + 10 + bonus,
        });
      }
      for (const item of board.items) {
        const score = scoreItem(item, ref);
        if (!score || itemStatusId(board, item) === status.id) continue;
        results.push({
          action: { kind: 'move-item', id: `move-item-${item.id}-${status.id}`, item, status },
          score: SCORE.move + score + bonus,
        });
      }
    }
  }
  return results;
}

function statusOf(statuses: readonly Status[], id: string): Status | undefined {
  return statuses.find((status) => status.id === id);
}

function openItem(board: Board, item: BoardItem, statuses: readonly Status[]): PaletteAction {
  return { kind: 'open-item', id: `item-${item.id}`, item, status: statusOf(statuses, itemStatusId(board, item)) };
}

function showGroup(group: BoardGroup, statuses: readonly Status[]): PaletteAction {
  return { kind: 'show-group', id: `group-${group.id}`, group, status: statusOf(statuses, group.statusId) };
}

/** `<status>`: the groups and items in a status named, or starting with, the query. */
function statusListResults(query: string, board: Board, statuses: readonly Status[]): Scored[] {
  const results: Scored[] = [];
  for (const status of statuses) {
    const match = matchStatus(status, query);
    if (!match) continue;
    const score = match === 2 ? SCORE.statusList : SCORE.statusPrefixList;
    for (const group of board.groups) {
      if (group.statusId === status.id) results.push({ action: showGroup(group, statuses), score });
    }
    for (const item of board.items) {
      if (itemStatusId(board, item) === status.id) {
        results.push({ action: openItem(board, item, statuses), score });
      }
    }
  }
  return results;
}

/** `<text>`: groups by name, items by title or URL. */
function textResults(query: string, board: Board, statuses: readonly Status[]): Scored[] {
  const results: Scored[] = [];
  for (const group of board.groups) {
    const score = scoreName(group.name, query);
    if (score) results.push({ action: showGroup(group, statuses), score: SCORE.group + score });
  }
  for (const item of board.items) {
    const score = scoreItem(item, query);
    if (score) results.push({ action: openItem(board, item, statuses), score: SCORE.item + score });
  }
  return results;
}

/** `add` adds the current tab to the first status; `add <status>` to that one. */
function addResults(words: string[], statuses: readonly Status[]): Scored[] {
  const [first, ...rest] = words;
  if (!first) return [];
  if (rest.length === 0) {
    if (!ADD_WORD.startsWith(first)) return [];
    const exact = first === ADD_WORD;
    // A bare `add` offers every status, the first one on top.
    return statuses.map((status, index) => ({
      action: { kind: 'add-tab', id: `add-${status.id}`, status },
      score: (exact ? SCORE.addExact : SCORE.addPrefix) - index,
    }));
  }
  if (first !== ADD_WORD) return [];
  const statusPart = rest.join(' ');
  return statuses.flatMap((status) => {
    const match = matchStatus(status, statusPart);
    return match
      ? [{
          action: { kind: 'add-tab', id: `add-${status.id}`, status } as PaletteAction,
          score: SCORE.addExact + (match === 2 ? SCORE.statusExactBonus : 0),
        }]
      : [];
  });
}

/**
 * Turns the palette input into ranked actions, best first. Matching ignores
 * case and extra spaces.
 * - empty: every group, then every item
 * - `<item|group> <status>`: move it (`6115 dev`, `pr review`); the status may
 *   be a prefix
 * - `<status>`: the groups and items in that status
 * - `add` / `add <status>`: add the current tab
 * - any text: groups by name, items by title or URL
 *
 * Ties keep that order, then the board's order. Each action appears once,
 * with its best score.
 */
export function parseCommand(input: string, board: Board, statuses: readonly Status[]): PaletteAction[] {
  const ordered = [...statuses].sort((a, b) => a.order - b.order);
  const query = normalize(input);
  if (!query) {
    return [
      ...board.groups.map((group) => showGroup(group, ordered)),
      ...board.items.map((item) => openItem(board, item, ordered)),
    ].slice(0, MAX_RESULTS);
  }

  const words = query.split(' ');
  const scored = [
    ...addResults(words, ordered),
    ...moveResults(words, board, ordered),
    ...statusListResults(query, board, ordered),
    ...textResults(query, board, ordered),
  ];

  const best = new Map<string, Scored>();
  for (const entry of scored) {
    const seen = best.get(entry.action.id);
    if (!seen || entry.score > seen.score) best.set(entry.action.id, entry);
  }
  // Map keeps first-insertion order and sort is stable, so ties keep it.
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.action);
}
