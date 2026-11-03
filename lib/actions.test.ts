import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardMother } from '../__mocks__/board.mother';
import { FakeTabs } from '../__mocks__/fake-tabs';
import { ItemBuilder } from '../__mocks__/item.builder';
import { StatusBuilder } from '../__mocks__/status.builder';
import { StatusMother } from '../__mocks__/status.mother';
import * as actions from './actions';
import { boardItem, getBoard } from './board';
import { getStatuses, saveStatuses } from './statuses';

let fake: FakeTabs;

beforeEach(async () => {
  fakeBrowser.reset();
  fake = FakeTabs.install();
  await boardItem.setValue(BoardMother.sample());
});

afterEach(() => {
  fake.uninstall();
});

describe('createGroup', () => {
  it('creates the group with the items and resolves to its id', async () => {
    const id = await actions.createGroup({ name: 'Login', statusId: 'todo', itemIds: ['item-1'] });

    const board = await getBoard();
    expect(board.groups.find((group) => group.id === id)).toMatchObject({ name: 'Login', statusId: 'todo' });
    expect(board.items[0]?.groupId).toBe(id);
  });
});

describe('openAll', () => {
  it('reopens only the closed links of the group', async () => {
    await boardItem.setValue({
      ...BoardMother.sample(),
      items: [
        new ItemBuilder().with({ id: 'a', groupId: 'group-1', url: 'https://a.test' }).closed().build(),
        new ItemBuilder().with({ id: 'b', groupId: 'group-1', tabId: 5, order: 1 }).build(),
      ],
    });

    await actions.openAll('group-1');

    expect(fake.tabs.map((tab) => tab.url)).toEqual(['https://a.test']);
    expect((await getBoard()).items[0]?.tabId).toBe(100);
  });
});

describe('status actions', () => {
  it('renames, recolors and moves a status', async () => {
    await actions.renameStatusLabel('done', ' Shipped ');
    await actions.setStatusColor('done', 'teal');
    await actions.shiftStatus('done', -1);

    expect((await getStatuses()).slice(3)).toEqual([
      { id: 'done', label: 'Shipped', color: 'teal', order: 3 },
      { ...StatusMother.inDev(), order: 4 },
    ]);
  });

  it('refuses a duplicate label and keeps the stored list', async () => {
    const errors = await actions.renameStatusLabel('done', 'to do');

    expect(errors).toEqual([
      { statusId: 'todo', message: expect.stringContaining('more than one') },
      { statusId: 'done', message: expect.stringContaining('more than one') },
    ]);
    expect(await getStatuses()).toEqual(StatusMother.defaults());
  });

  it('adds "New status" after a status, numbering repeats', async () => {
    await actions.addNewStatus({}, 'todo');
    await actions.addNewStatus({}, 'todo');

    expect((await getStatuses()).slice(0, 3).map((status) => status.label)).toEqual([
      'To do',
      'New status 2',
      'New status',
    ]);
  });

  it('deletes a status and moves its tabs', async () => {
    await actions.deleteStatusAndItems('in-progress', { moveTo: 'done' });

    expect((await getStatuses()).map((status) => status.id)).not.toContain('in-progress');
    expect((await getBoard()).groups[0]?.statusId).toBe('done');
  });

  it('deletes a status and removes its tabs', async () => {
    await actions.deleteStatusAndItems('in-progress', { remove: true });

    expect((await getBoard()).items).toHaveLength(2);
  });

  it('keeps the last status', async () => {
    await saveStatuses([new StatusBuilder().build()]);

    expect(await actions.deleteStatusAndItems('qa', { remove: true })).toEqual([
      { statusId: null, message: 'Keep at least one status.' },
    ]);
  });

  it('restores the defaults and moves tabs of removed statuses to the first one', async () => {
    await saveStatuses([...StatusMother.defaults(), new StatusBuilder().with({ order: 9 }).build()]);
    await actions.moveItem('item-1', { kind: 'status', statusId: 'qa' });

    await actions.restoreDefaultStatuses();

    expect(await getStatuses()).toEqual(StatusMother.defaults());
    expect((await getBoard()).items.find((item) => item.id === 'item-1')?.statusId).toBe('todo');
  });
});

describe('board actions', () => {
  it('never touch native tab groups', async () => {
    await actions.addTabs([{ id: 9, url: 'https://x.test' }], { kind: 'status', statusId: 'done' });
    await actions.moveItem('item-1', { kind: 'group', groupId: 'group-1' });
    await actions.moveGroup('group-1', 'done');
    await actions.renameGroup('group-1', 'X');
    await actions.setGroupCollapsed('group-1', true);
    await actions.clearClosed();
    await actions.ungroup('group-1');
    await actions.removeItem('item-1');
    await actions.removeGroup('nope');

    expect(fake.forbidden).toEqual([]);
  });
});
