import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '../__mocks__/fake-tab-groups';
import { StatusBuilder } from '../__mocks__/status.builder';
import { TabGroupBuilder } from '../__mocks__/tab-group.builder';
import { TabBuilder } from '../__mocks__/tab.builder';
import { statusBackupItem } from './backup';
import { focusTab, listGroups, setStatus, toggleCollapse } from './groups';
import { statusesItem } from './statuses';

let fake: FakeTabGroups;

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabGroups.install();
});

afterEach(() => {
  fake.uninstall();
});

describe('listGroups', () => {
  it('joins each group to its tabs and parses its status', async () => {
    fake.with({
      groups: [new TabGroupBuilder().with({ id: 1, title: 'CAR-6124 · STG' }).build()],
      tabs: [
        new TabBuilder().with({ id: 10, groupId: 1, index: 0, title: 'Ticket' }).build(),
        new TabBuilder().with({ id: 11, groupId: 1, index: 1, title: 'PR' }).build(),
        new TabBuilder().with({ id: 12, groupId: -1, index: 2 }).build(),
      ],
    });

    const [group, ...rest] = await listGroups();

    expect(rest).toEqual([]);
    expect(group).toMatchObject({
      id: 1,
      windowId: 1,
      title: 'CAR-6124 · STG',
      color: 'orange',
      collapsed: false,
      name: 'CAR-6124',
      ticketKey: 'CAR-6124',
      statusId: 'stg',
    });
    expect(group?.tabs.map((tab) => [tab.id, tab.title])).toEqual([
      [10, 'Ticket'],
      [11, 'PR'],
    ]);
  });

  it('gives a group with no status suffix a null status', async () => {
    fake.with({
      groups: [new TabGroupBuilder().with({ title: 'CAR-6100 research' }).build()],
    });

    const [group] = await listGroups();

    expect(group).toMatchObject({
      name: 'CAR-6100 research',
      ticketKey: 'CAR-6100',
      statusId: null,
      tabs: [],
    });
  });

  it('treats a missing title as empty', async () => {
    fake.with({ groups: [new TabGroupBuilder().with({ title: undefined }).build()] });

    const [group] = await listGroups();

    expect(group).toMatchObject({ title: '', name: '', statusId: null });
  });

  it('orders groups by window, then tab strip position, and tabs by index', async () => {
    fake.with({
      groups: [
        new TabGroupBuilder().with({ id: 1, windowId: 2 }).build(),
        new TabGroupBuilder().with({ id: 2, windowId: 1 }).build(),
        new TabGroupBuilder().with({ id: 3, windowId: 1 }).build(),
      ],
      tabs: [
        new TabBuilder().with({ id: 10, groupId: 1, windowId: 2, index: 0 }).build(),
        new TabBuilder().with({ id: 21, groupId: 2, windowId: 1, index: 5 }).build(),
        new TabBuilder().with({ id: 20, groupId: 2, windowId: 1, index: 4 }).build(),
        new TabBuilder().with({ id: 30, groupId: 3, windowId: 1, index: 1 }).build(),
      ],
    });

    const groups = await listGroups();

    expect(groups.map((group) => group.id)).toEqual([3, 2, 1]);
    expect(groups[1]?.tabs.map((tab) => tab.id)).toEqual([20, 21]);
  });

  it('parses titles with the statuses it is given', async () => {
    const qa = new StatusBuilder().with({ id: 'qa', label: 'QA' }).build();
    fake.with({ groups: [new TabGroupBuilder().with({ title: 'CAR-1 · QA' }).build()] });

    const [group] = await listGroups([qa]);

    expect(group?.statusId).toBe('qa');
  });
});

describe('setStatus', () => {
  beforeEach(() => {
    fake.with({
      groups: [
        new TabGroupBuilder()
          .with({ id: 1, title: 'CAR-6124 · STG', color: 'orange' })
          .build(),
      ],
    });
  });

  it('writes the title and the color in one update', async () => {
    await setStatus(1, 'done');

    expect(fake.updates).toEqual([
      { groupId: 1, properties: { title: 'CAR-6124 · Done', color: 'green' } },
    ]);
  });

  it('adds a status to a title with none', async () => {
    fake.with({ groups: [new TabGroupBuilder().with({ id: 1, title: 'CAR-6115' }).build()] });

    await setStatus(1, 'dev');

    expect(fake.group(1)).toMatchObject({ title: 'CAR-6115 · Dev', color: 'cyan' });
  });

  it('uses the stored statuses', async () => {
    const qa = new StatusBuilder().with({ id: 'qa', label: 'QA', color: 'red' }).build();
    await statusesItem.setValue([qa]);
    fake.with({ groups: [new TabGroupBuilder().with({ id: 1, title: 'CAR-1' }).build()] });

    await setStatus(1, 'qa');

    expect(fake.group(1)).toMatchObject({ title: 'CAR-1 · QA', color: 'red' });
  });

  it('removes the status suffix and keeps the color when given null', async () => {
    await setStatus(1, null);

    expect(fake.updates).toEqual([{ groupId: 1, properties: { title: 'CAR-6124' } }]);
    expect(fake.group(1)?.color).toBe('orange');
  });

  it('drops the ticket backup when given null', async () => {
    await statusBackupItem.setValue({ 'CAR-6124': 'stg', 'CAR-6100': 'dev' });

    await setStatus(1, null);

    expect(await statusBackupItem.getValue()).toEqual({ 'CAR-6100': 'dev' });
  });

  it('throws on an unknown status and leaves the group as is', async () => {
    await expect(setStatus(1, 'missing')).rejects.toThrow('Unknown status: missing');
    expect(fake.updates).toEqual([]);
  });

  it('rejects when the group does not exist', async () => {
    await expect(setStatus(99, 'done')).rejects.toThrow('No group with id: 99.');
  });
});

describe('focusTab', () => {
  it('activates the tab and focuses its window', async () => {
    fake.with({
      tabs: [
        new TabBuilder().with({ id: 1, windowId: 2, active: true }).build(),
        new TabBuilder().with({ id: 2, windowId: 2 }).build(),
      ],
    });

    await focusTab(2);

    expect(fake.tabs.map((tab) => [tab.id, tab.active])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(fake.focusedWindowId).toBe(2);
  });
});

describe('toggleCollapse', () => {
  it.each([
    [false, true],
    [true, false],
  ])('turns collapsed %s into %s', async (collapsed, expected) => {
    fake.with({ groups: [new TabGroupBuilder().with({ id: 1, collapsed }).build()] });

    await toggleCollapse(1);

    expect(fake.updates).toEqual([{ groupId: 1, properties: { collapsed: expected } }]);
  });
});
