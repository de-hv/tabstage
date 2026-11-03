import type { GroupColor } from './colors';

/** Stable id of a status. It doesn't change when the status is renamed. */
export type StatusId = string;

/** A Jira-like status that a tab group can be in. */
export interface Status {
  id: StatusId;
  /** Text shown after ` · ` in the group title. */
  label: string;
  /** Native tab group color for the groups in this status. */
  color: GroupColor;
  /** Position in the list, from 0, with no gaps. */
  order: number;
}

/** A group title split into its parts. */
export interface ParsedTitle {
  /** The title without the status suffix. */
  name: string;
  /** The Jira key found in the name, or the trimmed name when there is none. */
  ticketKey: string;
  /** The matched status, or `null` for the "No status" lane. */
  statusId: StatusId | null;
}
