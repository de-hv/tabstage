import { ACCENT_COLORS, type AccentColor } from './colors';
import { groupsIn, itemStatusId } from './board';
import type { Board, BoardGroup, BoardItem, Destination, Status, StatusId } from './types';

/** One context menu entry. An entry with `submenu` opens it instead of running. */
export interface MenuItem {
  id: string;
  label: string;
  onSelect?: () => void;
  submenu?: MenuItem[];
  danger?: boolean;
  disabled?: boolean;
  /** A color square shown before the label (a status accent). */
  color?: string;
}

/** What the panel's menus can do. The panel wires each to `lib/actions.ts`. */
export interface MenuHandlers {
  newGroupWith(item: BoardItem): void;
  moveItem(item: BoardItem, destination: Destination): void;
  openItem(item: BoardItem): void;
  removeItem(item: BoardItem): void;
  renameGroup(group: BoardGroup): void;
  moveGroup(group: BoardGroup, statusId: StatusId): void;
  openAll(group: BoardGroup): void;
  clearClosed(group: BoardGroup): void;
  ungroup(group: BoardGroup): void;
  removeGroup(group: BoardGroup): void;
  renameStatus(status: Status): void;
  recolorStatus(status: Status, color: AccentColor): void;
  shiftStatus(status: Status, offset: -1 | 1): void;
  addStatusAfter(status: Status): void;
  deleteStatus(status: Status): void;
}

function sorted(statuses: readonly Status[]): Status[] {
  return [...statuses].sort((a, b) => a.order - b.order);
}

function statusTargets(
  statuses: readonly Status[],
  current: StatusId,
  onSelect: (status: Status) => void,
): MenuItem[] {
  return sorted(statuses).map((status) => ({
    id: `status-${status.id}`,
    label: status.id === current ? `${status.label} (current)` : status.label,
    color: status.color,
    disabled: status.id === current,
    onSelect: () => onSelect(status),
  }));
}

/** Tab menu: New group with tab, Add to group ▸, Move to status ▸, Take out of group, Reopen, Remove. */
export function itemMenu(
  item: BoardItem,
  board: Board,
  statuses: readonly Status[],
  on: MenuHandlers,
): MenuItem[] {
  const groups = sorted(statuses).flatMap((status) =>
    groupsIn(board, status.id).map((group) => ({ group, status })),
  );
  const menu: MenuItem[] = [
    { id: 'new-group', label: 'New group with tab', onSelect: () => on.newGroupWith(item) },
    {
      id: 'add-to-group',
      label: 'Add to group',
      disabled: groups.every(({ group }) => group.id === item.groupId),
      submenu: groups.map(({ group, status }) => ({
        id: `group-${group.id}`,
        label: `${group.name} · ${status.label}`,
        color: status.color,
        disabled: group.id === item.groupId,
        onSelect: () => on.moveItem(item, { kind: 'group', groupId: group.id }),
      })),
    },
    {
      id: 'move-to-status',
      label: 'Move to status',
      submenu: statusTargets(statuses, item.groupId === null ? itemStatusId(board, item) : '', (status) =>
        on.moveItem(item, { kind: 'status', statusId: status.id }),
      ),
    },
  ];
  if (item.groupId !== null) {
    menu.push({
      id: 'take-out',
      label: 'Take out of group',
      onSelect: () => on.moveItem(item, { kind: 'status', statusId: itemStatusId(board, item) }),
    });
  }
  menu.push(
    item.tabId === null
      ? { id: 'reopen', label: 'Reopen', onSelect: () => on.openItem(item) }
      : { id: 'go-to', label: 'Go to tab', onSelect: () => on.openItem(item) },
    { id: 'remove', label: 'Remove from Tabstage', danger: true, onSelect: () => on.removeItem(item) },
  );
  return menu;
}

/** Group menu: Rename, Move to status ▸, Open all, Clear closed links, Ungroup, Remove group. */
export function groupMenu(
  group: BoardGroup,
  board: Board,
  statuses: readonly Status[],
  on: MenuHandlers,
): MenuItem[] {
  const items = board.items.filter((item) => item.groupId === group.id);
  const closed = items.filter((item) => item.tabId === null).length;
  return [
    { id: 'rename', label: 'Rename', onSelect: () => on.renameGroup(group) },
    {
      id: 'move-to-status',
      label: 'Move to status',
      submenu: statusTargets(statuses, group.statusId, (status) => on.moveGroup(group, status.id)),
    },
    { id: 'open-all', label: 'Open all', disabled: closed === 0, onSelect: () => on.openAll(group) },
    { id: 'clear-closed', label: 'Clear closed links', disabled: closed === 0, onSelect: () => on.clearClosed(group) },
    { id: 'ungroup', label: 'Ungroup', onSelect: () => on.ungroup(group) },
    { id: 'remove', label: 'Remove group', danger: true, onSelect: () => on.removeGroup(group) },
  ];
}

/** Status "⋯" menu: Rename, Color ▸, Move up, Move down, Add status, Delete. */
export function statusMenu(status: Status, statuses: readonly Status[], on: MenuHandlers): MenuItem[] {
  const list = sorted(statuses);
  const index = list.findIndex((entry) => entry.id === status.id);
  return [
    { id: 'rename', label: 'Rename', onSelect: () => on.renameStatus(status) },
    {
      id: 'color',
      label: 'Color',
      submenu: ACCENT_COLORS.map((color) => ({
        id: `color-${color}`,
        label: color === status.color ? `${color} (current)` : color,
        color,
        disabled: color === status.color,
        onSelect: () => on.recolorStatus(status, color),
      })),
    },
    { id: 'move-up', label: 'Move up', disabled: index <= 0, onSelect: () => on.shiftStatus(status, -1) },
    {
      id: 'move-down',
      label: 'Move down',
      disabled: index === -1 || index >= list.length - 1,
      onSelect: () => on.shiftStatus(status, 1),
    },
    { id: 'add-status', label: 'Add status after', onSelect: () => on.addStatusAfter(status) },
    {
      id: 'delete',
      label: 'Delete status',
      danger: true,
      disabled: list.length <= 1,
      onSelect: () => on.deleteStatus(status),
    },
  ];
}
