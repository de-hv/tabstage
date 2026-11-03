import { describe, expect, it, vi } from 'vitest';
import { BoardMother } from '../__mocks__/board.mother';
import { StatusMother } from '../__mocks__/status.mother';
import { groupMenu, itemMenu, statusMenu, type MenuHandlers, type MenuItem } from './panel-menus';

const statuses = StatusMother.defaults();
const board = BoardMother.sample();
const [loose, closed, grouped] = board.items as [typeof board.items[0], typeof board.items[0], typeof board.items[0]];
const group = board.groups[0]!;

function handlers(): MenuHandlers {
  return {
    newGroupWith: vi.fn(),
    moveItem: vi.fn(),
    openItem: vi.fn(),
    removeItem: vi.fn(),
    renameGroup: vi.fn(),
    moveGroup: vi.fn(),
    openAll: vi.fn(),
    clearClosed: vi.fn(),
    ungroup: vi.fn(),
    removeGroup: vi.fn(),
    renameStatus: vi.fn(),
    recolorStatus: vi.fn(),
    shiftStatus: vi.fn(),
    addStatusAfter: vi.fn(),
    deleteStatus: vi.fn(),
  };
}

const labels = (menu: MenuItem[]) => menu.map((entry) => entry.label);
const find = (menu: MenuItem[], id: string) => menu.find((entry) => entry.id === id)!;

describe('itemMenu', () => {
  it('lists the tab actions for a loose open tab', () => {
    expect(labels(itemMenu(loose, board, statuses, handlers()))).toEqual([
      'New group with tab',
      'Add to group',
      'Move to status',
      'Go to tab',
      'Remove from Tabstage',
    ]);
  });

  it('offers Reopen for a closed link and Take out of group for a grouped tab', () => {
    expect(labels(itemMenu(closed, board, statuses, handlers()))).toContain('Reopen');
    expect(labels(itemMenu(grouped, board, statuses, handlers()))).toContain('Take out of group');
  });

  it('moves to any status but the current one', () => {
    const on = handlers();
    const move = find(itemMenu(loose, board, statuses, on), 'move-to-status');

    expect(move.submenu?.find((entry) => entry.id === 'status-todo')).toMatchObject({ disabled: true });
    find(move.submenu!, 'status-done').onSelect!();

    expect(on.moveItem).toHaveBeenCalledWith(loose, { kind: 'status', statusId: 'done' });
  });

  it('adds to a group and takes out to the group status', () => {
    const on = handlers();
    find(find(itemMenu(loose, board, statuses, on), 'add-to-group').submenu!, 'group-group-1').onSelect!();
    find(itemMenu(grouped, board, statuses, on), 'take-out').onSelect!();

    expect(on.moveItem).toHaveBeenNthCalledWith(1, loose, { kind: 'group', groupId: 'group-1' });
    expect(on.moveItem).toHaveBeenNthCalledWith(2, grouped, { kind: 'status', statusId: 'in-progress' });
  });

  it('disables Add to group when the tab is in the only group', () => {
    expect(find(itemMenu(grouped, board, statuses, handlers()), 'add-to-group').disabled).toBe(true);
  });

  it('marks Remove from Tabstage as dangerous', () => {
    const on = handlers();
    const remove = find(itemMenu(loose, board, statuses, on), 'remove');
    remove.onSelect!();

    expect(remove.danger).toBe(true);
    expect(on.removeItem).toHaveBeenCalledWith(loose);
  });
});

describe('groupMenu', () => {
  it('lists the group actions', () => {
    expect(labels(groupMenu(group, board, statuses, handlers()))).toEqual([
      'Rename',
      'Move to status',
      'Open all',
      'Clear closed links',
      'Ungroup',
      'Remove group',
    ]);
  });

  it('disables Open all and Clear closed links without closed links', () => {
    const menu = groupMenu(group, board, statuses, handlers());

    expect(find(menu, 'open-all').disabled).toBe(true);
    expect(find(menu, 'clear-closed').disabled).toBe(true);
  });

  it.each([
    ['rename', 'renameGroup'],
    ['ungroup', 'ungroup'],
    ['remove', 'removeGroup'],
  ] as const)('runs %s', (id, handler) => {
    const on = handlers();
    find(groupMenu(group, board, statuses, on), id).onSelect!();

    expect(on[handler]).toHaveBeenCalledWith(group);
  });

  it('moves the group to another status', () => {
    const on = handlers();
    find(find(groupMenu(group, board, statuses, on), 'move-to-status').submenu!, 'status-done').onSelect!();

    expect(on.moveGroup).toHaveBeenCalledWith(group, 'done');
  });
});

describe('statusMenu', () => {
  it('lists the status actions and disables Move up on the first status', () => {
    const menu = statusMenu(statuses[0]!, statuses, handlers());

    expect(labels(menu)).toEqual(['Rename', 'Color', 'Move up', 'Move down', 'Add status after', 'Delete status']);
    expect(find(menu, 'move-up').disabled).toBe(true);
    expect(find(menu, 'move-down').disabled).toBe(false);
  });

  it('offers the 10 accents with the current one disabled', () => {
    const on = handlers();
    const colors = find(statusMenu(statuses[0]!, statuses, on), 'color').submenu!;
    find(colors, 'color-red').onSelect!();

    expect(colors).toHaveLength(10);
    expect(find(colors, 'color-lavender').disabled).toBe(true);
    expect(on.recolorStatus).toHaveBeenCalledWith(statuses[0], 'red');
  });

  it('disables Delete for the only status', () => {
    expect(find(statusMenu(statuses[0]!, [statuses[0]!], handlers()), 'delete').disabled).toBe(true);
  });
});
