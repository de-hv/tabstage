import type { Group, GroupTab } from './groups';
import { NO_STATUS_LABEL } from './lanes';
import type { Status, StatusId } from './types';

/** What a palette result does when it runs. */
export type PaletteAction =
  /** Focuses the group's active tab, or its first one. */
  | { kind: 'focus-group'; id: string; group: Group; tabId: number }
  | { kind: 'focus-tab'; id: string; group: Group; tab: GroupTab }
  /** `status` is `null` for "No status". */
  | { kind: 'set-status'; id: string; group: Group; status: Status | null }
  | { kind: 'open-panel'; id: string };

/** At most this many results are returned. */
export const MAX_RESULTS = 50;

export const OPEN_PANEL_ID = 'open-panel';
const PANEL_WORDS = ['panel', 'side panel', 'sidebar', 'open panel', 'open side panel'];
const NO_STATUS_ALIASES = [NO_STATUS_LABEL.toLowerCase(), 'none'];

const SCORE = {
  panelExact: 1000,
  statusList: 800,
  setStatus: 600,
  statusExactBonus: 50,
  statusPrefixList: 250,
  group: 200,
  tab: 100,
  panelPrefix: 90,
} as const;

/** A status, or "No status", as a target the palette can match by name. */
interface Target {
  status: Status | null;
  id: StatusId | null;
  names: string[];
}

interface Scored {
  action: PaletteAction;
  score: number;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function targetsOf(statuses: readonly Status[]): Target[] {
  return [
    ...[...statuses]
      .sort((a, b) => a.order - b.order)
      .map((status) => ({
        status,
        id: status.id,
        names: [normalize(status.label), status.id.toLowerCase()],
      })),
    { status: null, id: null, names: NO_STATUS_ALIASES },
  ];
}

/** 2 for an exact name, 1 for a name prefix, 0 for no match. */
function matchTarget(target: Target, query: string): number {
  if (target.names.includes(query)) return 2;
  return target.names.some((name) => name.startsWith(query)) ? 1 : 0;
}

/**
 * How well `query` names the group: 100 for the full ticket key, 90 for its
 * number, 70 for a key prefix or a number suffix (`6115` for `CAR-6115`), 60
 * for a name prefix, 50 for a name match, 0 for none.
 */
export function scoreGroup(group: Group, query: string): number {
  const key = group.ticketKey.toLowerCase();
  const number = /-(\d+)$/.exec(key)?.[1];
  const name = group.name.toLowerCase();
  if (key === query) return 100;
  if (number === query) return 90;
  if (key.startsWith(query) || (number?.endsWith(query) ?? false)) return 70;
  if (name.startsWith(query)) return 60;
  if (name.includes(query)) return 50;
  return 0;
}

function scoreTab(tab: GroupTab, query: string): number {
  const title = tab.title.toLowerCase();
  if (title.startsWith(query)) return 40;
  if (title.includes(query)) return 30;
  if (tab.url.toLowerCase().includes(query)) return 20;
  return 0;
}

function focusGroup(group: Group): PaletteAction | undefined {
  const tab = group.tabs.find((t) => t.active) ?? group.tabs[0];
  if (!tab) return undefined;
  return { kind: 'focus-group', id: `group-${group.id}`, group, tabId: tab.id };
}

const openPanelAction: PaletteAction = { kind: 'open-panel', id: OPEN_PANEL_ID };

/** `<key|number|name> <status>`: every split of the words into a ref and a status. */
function setStatusResults(
  words: string[],
  groups: readonly Group[],
  targets: Target[],
): Scored[] {
  const results: Scored[] = [];
  for (let split = 1; split < words.length; split++) {
    const ref = words.slice(0, split).join(' ');
    const statusPart = words.slice(split).join(' ');
    for (const target of targets) {
      const statusMatch = matchTarget(target, statusPart);
      if (!statusMatch) continue;
      for (const group of groups) {
        const refScore = scoreGroup(group, ref);
        if (!refScore || group.statusId === target.id) continue;
        results.push({
          action: {
            kind: 'set-status',
            id: `set-${group.id}-${target.id ?? 'none'}`,
            group,
            status: target.status,
          },
          score:
            SCORE.setStatus + refScore + (statusMatch === 2 ? SCORE.statusExactBonus : 0),
        });
      }
    }
  }
  return results;
}

/** `<status>`: the groups in a status named, or starting with, the query. */
function statusListResults(
  query: string,
  groups: readonly Group[],
  targets: Target[],
): Scored[] {
  const results: Scored[] = [];
  for (const target of targets) {
    const match = matchTarget(target, query);
    if (!match) continue;
    for (const group of groups) {
      if (group.statusId !== target.id) continue;
      const action = focusGroup(group);
      if (action) {
        results.push({
          action,
          score: match === 2 ? SCORE.statusList : SCORE.statusPrefixList,
        });
      }
    }
  }
  return results;
}

/** `<text>`: groups by key, number or name, and tabs by title or URL. */
function textResults(query: string, groups: readonly Group[]): Scored[] {
  const results: Scored[] = [];
  for (const group of groups) {
    const score = scoreGroup(group, query);
    const action = score ? focusGroup(group) : undefined;
    if (action) results.push({ action, score: SCORE.group + score });
  }
  for (const group of groups) {
    for (const tab of group.tabs) {
      const score = scoreTab(tab, query);
      if (score) {
        results.push({
          action: { kind: 'focus-tab', id: `tab-${tab.id}`, group, tab },
          score: SCORE.tab + score,
        });
      }
    }
  }
  return results;
}

function panelResults(query: string): Scored[] {
  if (PANEL_WORDS.includes(query)) return [{ action: openPanelAction, score: SCORE.panelExact }];
  if (PANEL_WORDS.some((word) => word.startsWith(query))) {
    return [{ action: openPanelAction, score: SCORE.panelPrefix }];
  }
  return [];
}

/**
 * Turns the palette input into ranked actions, best first. Matching ignores
 * case and extra spaces.
 * - empty: every group (focus), then "Open side panel"
 * - `<key|number> <status>`: set that group's status (`6115 dev`), also with
 *   a status prefix (`6115 d` offers Dev and Done) or `none` / `no status`
 * - `<status>`: the groups in that status
 * - `panel`: open the side panel
 * - any text: groups by ticket key, number or name, and tabs by title or URL
 *
 * Ties keep that order, then the groups' order. Each action appears once,
 * with its best score.
 */
export function parseCommand(
  input: string,
  groups: readonly Group[],
  statuses: readonly Status[],
): PaletteAction[] {
  const query = normalize(input);
  if (!query) {
    const all = groups.map(focusGroup).filter((a): a is PaletteAction => a !== undefined);
    return [...all, openPanelAction].slice(0, MAX_RESULTS);
  }

  const targets = targetsOf(statuses);
  const scored = [
    ...setStatusResults(query.split(' '), groups, targets),
    ...statusListResults(query, groups, targets),
    ...textResults(query, groups),
    ...panelResults(query),
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
