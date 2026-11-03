import type { GroupColor } from './colors';
import type { Group } from './groups';
import type { Status, StatusId } from './types';

/** Lane id of the groups with no status. */
export const NO_STATUS_LANE_ID = 'no-status';
export const NO_STATUS_LABEL = 'No status';

/** A column of the side panel: one status, or "No status". */
export interface Lane {
  id: string;
  /** `null` for the "No status" lane. */
  statusId: StatusId | null;
  label: string;
  /** `null` for the "No status" lane. */
  color: GroupColor | null;
  groups: Group[];
  count: number;
}

function matches(group: Group, query: string): boolean {
  return [group.name, group.ticketKey, ...group.tabs.map((tab) => tab.title)]
    .some((text) => text.toLowerCase().includes(query));
}

/**
 * Splits groups into lanes: "No status" first, then one lane per status in
 * its configured order. The filter matches the group name, ticket key and tab
 * titles, ignoring case. With no filter every lane is returned, empty ones
 * included; with a filter only lanes with a match are.
 */
export function buildLanes(
  groups: readonly Group[],
  statuses: readonly Status[],
  filter: string,
): Lane[] {
  const query = filter.trim().toLowerCase();
  const visible = query ? groups.filter((group) => matches(group, query)) : groups;
  const ordered = [...statuses].sort((a, b) => a.order - b.order);
  const known = new Set(ordered.map((status) => status.id));

  const lane = (
    id: string,
    statusId: StatusId | null,
    label: string,
    color: GroupColor | null,
    laneGroups: Group[],
  ): Lane => ({ id, statusId, label, color, groups: laneGroups, count: laneGroups.length });

  const lanes = [
    lane(
      NO_STATUS_LANE_ID,
      null,
      NO_STATUS_LABEL,
      null,
      visible.filter((group) => group.statusId === null || !known.has(group.statusId)),
    ),
    ...ordered.map((status) =>
      lane(
        status.id,
        status.id,
        status.label,
        status.color,
        visible.filter((group) => group.statusId === status.id),
      ),
    ),
  ];

  return query ? lanes.filter((l) => l.count > 0) : lanes;
}
