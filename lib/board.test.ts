import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardGroupBuilder } from '../__mocks__/board-group.builder';
import { BoardMother } from '../__mocks__/board.mother';
import { ItemBuilder } from '../__mocks__/item.builder';
import { TabBuilder } from '../__mocks__/tab.builder';
import {
  addItem,
  addItems,
  adoptOrphans,
  boardItem,
  clearClosed,
  countInStatus,
  createGroup,
  deleteStatus,
  getBoard,
  groupItems,
  itemStatusId,
  itemsIn,
  moveGroup,
  moveItem,
  normalizeBoard,
  removeGroup,
  removeItem,
  renameGroup,
  reorder,
  setGroupCollapsed,
  ungroup,
  updateBoard,
} from './board';
import type { Board } from './types';

const titles = (board: Board, destination: Parameters<typeof itemsIn>[1]) =>
  itemsIn(board, destination).map((item) => item.title);
const item = (board: Board, id: string) => board.items.find((entry) => entry.id === id)!;
const group = (board: Board, id: string) => board.groups.find((entry) => entry.id === id)!;
const todo = { kind: 'status', statusId: 'todo' } as const;
const done = { kind: 'status', statusId: 'done' } as const;
const inGroup = { kind: 'group', groupId: 'group-1' } as const;

describe('addItem', () => {
  it('adds a tab at the end of a status', () => {
    const tab = new TabBuilder().with({ id: 9, title: 'New', url: 'https://new.example.com', favIconUrl: 'https://new.example.com/f.ico' }).build();

    const board = addItem(BoardMother.sample(), tab, todo, 'item-9');

    expect(item(board, 'item-9')).toEqual({
      id: 'item-9',
      url: 'https://new.example.com',
      title: 'New',
      favIconUrl: 'https://new.example.com/f.ico',
      statusId: 'todo',
      groupId: null,
      tabId: 9,
      order: 2,
    });
  });

  it('adds a tab into a group, which sets its status', () => {
    const tab = new TabBuilder().with({ id: 9, title: 'New' }).build();

    const board = addItem(BoardMother.sample(), tab, inGroup, 'item-9');

    expect(item(board, 'item-9')).toMatchObject({ groupId: 'group-1', statusId: 'in-progress', order: 2 });
  });

  it('moves a tab that is already on the board instead of adding it twice', () => {
    const tab = new TabBuilder().with({ id: 1 }).build();

    const board = addItem(BoardMother.sample(), tab, done, 'item-9');

    expect(board.items).toHaveLength(4);
    expect(item(board, 'item-1')).toMatchObject({ statusId: 'done', order: 0 });
  });

  it('uses the pending URL and falls back to the URL for the title', () => {
    const tab = { id: 9, pendingUrl: 'https://pending.example.com' };

    expect(item(addItem(BoardMother.empty(), tab, todo, 'x'), 'x')).toMatchObject({
      url: 'https://pending.example.com',
      title: 'https://pending.example.com',
    });
  });

  it('leaves the board unchanged for an unknown group', () => {
    const before = BoardMother.sample();

    expect(addItem(before, { id: 9, url: 'u' }, { kind: 'group', groupId: 'nope' })).toBe(before);
  });

  it('does not mutate its input', () => {
    const input = BoardMother.sample();

    addItem(input, { id: 9, url: 'u' }, todo);

    expect(input).toEqual(BoardMother.sample());
  });
});

describe('addItems', () => {
  it('adds every tab in order', () => {
    const board = addItems(BoardMother.empty(), [{ id: 1, title: 'A', url: 'a' }, { id: 2, title: 'B', url: 'b' }], done);

    expect(titles(board, done)).toEqual(['A', 'B']);
  });
});

describe('moveItem', () => {
  it('moves a loose item to the end of another status', () => {
    const board = moveItem(BoardMother.sample(), 'item-1', { kind: 'status', statusId: 'in-progress' });

    expect(item(board, 'item-1')).toMatchObject({ statusId: 'in-progress', groupId: null, order: 0 });
    expect(item(board, 'item-2').order).toBe(0);
  });

  it('takes an item out of its group into the group status', () => {
    const board = moveItem(BoardMother.sample(), 'item-3', { kind: 'status', statusId: 'in-progress' });

    expect(item(board, 'item-3')).toMatchObject({ groupId: null, statusId: 'in-progress' });
    expect(item(board, 'item-4').order).toBe(0);
  });

  it('moves a loose item into a group, which wins over its own status', () => {
    const board = moveItem(BoardMother.sample(), 'item-1', inGroup);

    expect(item(board, 'item-1')).toMatchObject({ groupId: 'group-1', statusId: 'in-progress', order: 2 });
  });

  it('returns the same board for an unknown item', () => {
    const before = BoardMother.sample();

    expect(moveItem(before, 'nope', done)).toBe(before);
  });
});

describe('moveGroup', () => {
  it('moves the group to the end of a status, with its items', () => {
    const board = moveGroup(BoardMother.sample(), 'group-1', 'done');

    expect(group(board, 'group-1')).toMatchObject({ statusId: 'done', order: 0 });
    expect(countInStatus(board, 'done')).toBe(2);
    expect(item(board, 'item-3').statusId).toBe('done');
  });

  it('returns the same board for the same status or an unknown group', () => {
    const before = BoardMother.sample();

    expect(moveGroup(before, 'group-1', 'in-progress')).toBe(before);
    expect(moveGroup(before, 'nope', 'done')).toBe(before);
  });
});

describe('createGroup', () => {
  it('creates a group at the end of a status with the given items', () => {
    const board = createGroup(BoardMother.sample(), { id: 'g2', name: ' Login ', statusId: 'todo', itemIds: ['item-1'] });

    expect(group(board, 'g2')).toEqual({ id: 'g2', name: 'Login', statusId: 'todo', collapsed: false, order: 0 });
    expect(item(board, 'item-1')).toMatchObject({ groupId: 'g2', order: 0 });
    expect(item(board, 'item-2').order).toBe(0);
  });

  it('names an unnamed group "New group"', () => {
    expect(group(createGroup(BoardMother.empty(), { id: 'g', name: ' ', statusId: 'todo' }), 'g').name).toBe('New group');
  });

  it('places a second group after the first one', () => {
    const board = createGroup(BoardMother.sample(), { id: 'g2', name: 'B', statusId: 'in-progress' });

    expect(group(board, 'g2').order).toBe(1);
  });
});

describe('groupItems', () => {
  it('moves several items into a group, in order', () => {
    const board = groupItems(BoardMother.sample(), ['item-2', 'item-1'], 'group-1');

    expect(titles(board, inGroup)).toEqual(['PR #42', 'CAR-6115 spec', 'Docs guide', 'CAR-6124 · Login fix']);
  });
});

describe('ungroup', () => {
  it('removes the group and leaves its items loose in its status', () => {
    const board = ungroup(BoardMother.sample(), 'group-1');

    expect(board.groups).toEqual([]);
    expect(titles(board, { kind: 'status', statusId: 'in-progress' })).toEqual(['PR #42', 'CAR-6115 spec']);
  });

  it('puts the items after the loose items already there', () => {
    const start = moveItem(BoardMother.sample(), 'item-1', { kind: 'status', statusId: 'in-progress' });

    const board = ungroup(start, 'group-1');

    expect(titles(board, { kind: 'status', statusId: 'in-progress' })).toEqual([
      'CAR-6124 · Login fix',
      'PR #42',
      'CAR-6115 spec',
    ]);
  });

  it('returns the same board for an unknown group', () => {
    const before = BoardMother.sample();

    expect(ungroup(before, 'nope')).toBe(before);
  });
});

describe('renameGroup', () => {
  it('renames with the trimmed name', () => {
    expect(group(renameGroup(BoardMother.sample(), 'group-1', ' CAR-7000 '), 'group-1').name).toBe('CAR-7000');
  });

  it('ignores an empty name', () => {
    const before = BoardMother.sample();

    expect(renameGroup(before, 'group-1', '  ')).toBe(before);
  });
});

describe('setGroupCollapsed', () => {
  it('collapses and expands a group', () => {
    const collapsed = setGroupCollapsed(BoardMother.sample(), 'group-1', true);

    expect(group(collapsed, 'group-1').collapsed).toBe(true);
    expect(group(setGroupCollapsed(collapsed, 'group-1', false), 'group-1').collapsed).toBe(false);
  });
});

describe('removeItem', () => {
  it('removes the item and closes the order gap', () => {
    const board = removeItem(BoardMother.sample(), 'item-3');

    expect(board.items.map((entry) => entry.id)).toEqual(['item-1', 'item-2', 'item-4']);
    expect(item(board, 'item-4').order).toBe(0);
  });
});

describe('removeGroup', () => {
  it('removes the group and its items', () => {
    const board = removeGroup(BoardMother.sample(), 'group-1');

    expect(board.groups).toEqual([]);
    expect(board.items.map((entry) => entry.id)).toEqual(['item-1', 'item-2']);
  });
});

describe('clearClosed', () => {
  const withClosedInGroup = () =>
    reorder({
      ...BoardMother.sample(),
      items: BoardMother.sample().items.map((entry) => (entry.id === 'item-3' ? { ...entry, tabId: null } : entry)),
    });

  it('removes every closed link', () => {
    expect(clearClosed(withClosedInGroup()).items.map((entry) => entry.id)).toEqual(['item-1', 'item-4']);
  });

  it('removes only the closed links of a group', () => {
    expect(clearClosed(withClosedInGroup(), { groupId: 'group-1' }).items.map((entry) => entry.id)).toEqual([
      'item-1',
      'item-2',
      'item-4',
    ]);
  });
});

describe('deleteStatus', () => {
  it('moves the groups and loose items to another status', () => {
    const start = moveItem(BoardMother.sample(), 'item-1', { kind: 'status', statusId: 'in-progress' });

    const board = deleteStatus(start, 'in-progress', { moveTo: 'todo' });

    expect(group(board, 'group-1').statusId).toBe('todo');
    expect(titles(board, todo)).toEqual(['Docs guide', 'CAR-6124 · Login fix']);
    expect(countInStatus(board, 'in-progress')).toBe(0);
    expect(countInStatus(board, 'todo')).toBe(4);
  });

  it('removes the groups and items of the status', () => {
    const board = deleteStatus(BoardMother.sample(), 'in-progress', { remove: true });

    expect(board.groups).toEqual([]);
    expect(board.items.map((entry) => entry.id)).toEqual(['item-1', 'item-2']);
  });

  it('keeps a grouped item whose own status is the deleted one, when its group is elsewhere', () => {
    const start = reorder({
      groups: [new BoardGroupBuilder().with({ statusId: 'done' }).build()],
      items: [new ItemBuilder().with({ groupId: 'group-1', statusId: 'todo' }).build()],
    });

    expect(deleteStatus(start, 'todo', { remove: true }).items).toHaveLength(1);
  });

  it('returns the same board when moving to the same status', () => {
    const before = BoardMother.sample();

    expect(deleteStatus(before, 'todo', { moveTo: 'todo' })).toBe(before);
  });
});

describe('reorder', () => {
  it('renumbers each container from 0 with no gaps', () => {
    const board = reorder({
      groups: [
        new BoardGroupBuilder().with({ id: 'a', order: 7 }).build(),
        new BoardGroupBuilder().with({ id: 'b', order: 3 }).build(),
      ],
      items: [
        new ItemBuilder().with({ id: 'x', order: 10 }).build(),
        new ItemBuilder().with({ id: 'y', order: 4 }).build(),
        new ItemBuilder().with({ id: 'z', groupId: 'a', order: 9 }).build(),
      ],
    });

    expect(board.groups.map((entry) => [entry.id, entry.order])).toEqual([['a', 1], ['b', 0]]);
    expect(board.items.map((entry) => [entry.id, entry.order])).toEqual([['x', 1], ['y', 0], ['z', 0]]);
  });

  it('gives grouped items their group status', () => {
    const board = reorder({
      groups: [new BoardGroupBuilder().build()],
      items: [new ItemBuilder().with({ groupId: 'group-1', statusId: 'todo' }).build()],
    });

    expect(board.items[0]?.statusId).toBe('in-progress');
  });

  it('makes items of a missing group loose', () => {
    const board = reorder({ groups: [], items: [new ItemBuilder().with({ groupId: 'gone' }).build()] });

    expect(board.items[0]?.groupId).toBeNull();
  });
});

describe('itemStatusId', () => {
  it('returns the group status for a grouped item and the own status for a loose one', () => {
    const board = {
      groups: [new BoardGroupBuilder().build()],
      items: [new ItemBuilder().with({ groupId: 'group-1', statusId: 'todo' }).build()],
    };

    expect(itemStatusId(board, board.items[0]!)).toBe('in-progress');
    expect(itemStatusId(board, new ItemBuilder().build())).toBe('todo');
  });
});

describe('adoptOrphans', () => {
  it('moves groups and items of unknown statuses to the fallback', () => {
    const board = adoptOrphans(BoardMother.sample(), ['todo', 'done'], 'done');

    expect(group(board, 'group-1').statusId).toBe('done');
    expect(countInStatus(board, 'todo')).toBe(2);
  });
});

describe('normalizeBoard', () => {
  it.each([null, undefined, {}, { groups: 'x', items: 3 }])('returns an empty board for %j', (value) => {
    expect(normalizeBoard(value as Partial<Board>)).toEqual(BoardMother.empty());
  });
});

describe('storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('falls back to an empty board in local:board', async () => {
    expect(await getBoard()).toEqual(BoardMother.empty());
  });

  it('saves the change in local:board', async () => {
    await updateBoard(() => BoardMother.sample());

    expect(await fakeBrowser.storage.local.get('board')).toEqual({ board: BoardMother.sample() });
  });

  it('runs updates one after the other', async () => {
    await Promise.all([
      updateBoard((board) => addItem(board, { id: 1, url: 'a', title: 'A' }, todo)),
      updateBoard((board) => addItem(board, { id: 2, url: 'b', title: 'B' }, todo)),
    ]);

    expect(titles(await getBoard(), todo)).toEqual(['A', 'B']);
  });

  it('does not write when the change returns the same board', async () => {
    let writes = 0;
    const unwatch = boardItem.watch(() => writes++);

    await updateBoard((board) => board);
    unwatch();

    expect(writes).toBe(0);
  });
});
