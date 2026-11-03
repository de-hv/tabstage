import type { AccentColor } from './colors';

/** Stable id of a status. It doesn't change when the status is renamed. */
export type StatusId = string;

/** A status that loose tabs and groups can be in. Any order, no fixed flow. */
export interface Status {
  id: StatusId;
  label: string;
  color: AccentColor;
  /** Position in the list, from 0, with no gaps. */
  order: number;
}

/** A folder of tabs inside a status. Its status wins over its items' own. */
export interface BoardGroup {
  id: string;
  name: string;
  statusId: StatusId;
  collapsed: boolean;
  /** Position among the groups of its status, from 0. */
  order: number;
}

/** A tab the user added to Tabstage. `tabId` is `null` for a closed link. */
export interface BoardItem {
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
  /** Used when the item is loose; a grouped item follows its group. */
  statusId: StatusId;
  groupId: string | null;
  tabId: number | null;
  /** Position among the loose items of its status, or inside its group. */
  order: number;
}

/** Everything the extension tracks, stored in `local:board`. */
export interface Board {
  groups: BoardGroup[];
  items: BoardItem[];
}

/** Where an item goes: loose in a status, or inside a group. */
export type Destination =
  | { kind: 'status'; statusId: StatusId }
  | { kind: 'group'; groupId: string };

/** The tab fields the board keeps. */
export interface TabInfo {
  id?: number;
  url?: string;
  pendingUrl?: string;
  title?: string;
  favIconUrl?: string;
}
