import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardMother } from '../__mocks__/board.mother';
import { FakeTabs } from '../__mocks__/fake-tabs';
import { StatusMother } from '../__mocks__/status.mother';
import { TabBuilder } from '../__mocks__/tab.builder';
import { boardItem, getBoard } from './board';
import { buildMenuEntries, destinationOf, handleMenuClick, rebuildMenus } from './menus';

const statuses = StatusMother.defaults();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildMenuEntries', () => {
  it('builds Tabstage → Add to → statuses, then groups after a separator', () => {
    vi.stubEnv('BROWSER', 'chrome');

    const entries = buildMenuEntries(BoardMother.sample(), statuses);

    expect(entries.map((entry) => [entry.id, entry.parentId, entry.title])).toEqual([
      ['tabstage', undefined, 'Tabstage'],
      ['tabstage-add-to', 'tabstage', 'Add to'],
      ['tabstage-status:todo', 'tabstage-add-to', 'To do'],
      ['tabstage-status:in-progress', 'tabstage-add-to', 'In progress'],
      ['tabstage-status:in-review', 'tabstage-add-to', 'In review'],
      ['tabstage-status:in-dev', 'tabstage-add-to', 'In dev'],
      ['tabstage-status:done', 'tabstage-add-to', 'Done'],
      ['tabstage-separator', 'tabstage-add-to', ''],
      ['tabstage-group:group-1', 'tabstage-add-to', 'CAR-6115 (In progress)'],
    ]);
    expect(entries.every((entry) => entry.contexts?.join() === 'page')).toBe(true);
  });

  it('has no separator without groups', () => {
    expect(buildMenuEntries(BoardMother.empty(), statuses).some((entry) => entry.type === 'separator')).toBe(false);
  });

  it('adds the tab context on Firefox', () => {
    vi.stubEnv('BROWSER', 'firefox');

    expect(buildMenuEntries(BoardMother.empty(), statuses)[0]?.contexts).toEqual(['page', 'tab']);
  });
});

describe('destinationOf', () => {
  it.each([
    ['tabstage-status:done', { kind: 'status', statusId: 'done' }],
    ['tabstage-group:group-1', { kind: 'group', groupId: 'group-1' }],
    ['tabstage', undefined],
    [42, undefined],
  ])('reads %j', (id, expected) => {
    expect(destinationOf(id)).toEqual(expected);
  });
});

describe('in the browser', () => {
  let fake: FakeTabs;

  beforeEach(async () => {
    fakeBrowser.reset();
    fake = FakeTabs.install();
    await boardItem.setValue(BoardMother.sample());
  });

  afterEach(() => {
    fake.uninstall();
  });

  describe('rebuildMenus', () => {
    it('replaces the menu with the current statuses and groups', async () => {
      await rebuildMenus();
      await boardItem.setValue(BoardMother.empty());

      await rebuildMenus();

      expect(fake.menus.map((entry) => entry.id)).not.toContain('tabstage-group:group-1');
      expect(fake.menus).toHaveLength(7);
    });

    it('runs rebuilds one after the other, with no duplicate ids', async () => {
      await Promise.all([rebuildMenus(), rebuildMenus(), rebuildMenus()]);

      expect(fake.menus).toHaveLength(9);
    });
  });

  describe('handleMenuClick', () => {
    it('adds the tab to a status', async () => {
      const tab = new TabBuilder().with({ id: 9, title: 'New page', url: 'https://new.test' }).build();

      await handleMenuClick('tabstage-status:done', tab);

      expect((await getBoard()).items.at(-1)).toMatchObject({ tabId: 9, statusId: 'done', title: 'New page' });
    });

    it('adds the tab to a group', async () => {
      await handleMenuClick('tabstage-group:group-1', new TabBuilder().with({ id: 9 }).build());

      expect((await getBoard()).items.at(-1)).toMatchObject({ tabId: 9, groupId: 'group-1' });
    });

    it('does not add a tab twice', async () => {
      await handleMenuClick('tabstage-status:done', new TabBuilder().with({ id: 1 }).build());

      const board = await getBoard();
      expect(board.items).toHaveLength(4);
      expect(board.items[0]?.statusId).toBe('done');
    });

    it('ignores other ids and a missing tab', async () => {
      await handleMenuClick('tabstage', new TabBuilder().build());
      await handleMenuClick('tabstage-status:done', undefined);

      expect(await getBoard()).toEqual(BoardMother.sample());
    });
  });
});
