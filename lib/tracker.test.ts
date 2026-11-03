import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardMother } from '../__mocks__/board.mother';
import { FakeTabs } from '../__mocks__/fake-tabs';
import { ItemBuilder } from '../__mocks__/item.builder';
import { TabBuilder } from '../__mocks__/tab.builder';
import { boardItem, getBoard } from './board';
import {
  applyTabRemoved,
  applyTabUpdate,
  linkByUrl,
  openItem,
  registerTracker,
  relink,
  reopenItem,
  sessionLinkedItem,
} from './tracker';

const tabIds = (board: { items: { id: string; tabId: number | null }[] }) =>
  Object.fromEntries(board.items.map((item) => [item.id, item.tabId]));

describe('linkByUrl', () => {
  it('links a closed item to an open tab with the same URL and refreshes it', () => {
    const tab = new TabBuilder().with({ id: 7, url: 'https://docs.example.com/guide', title: 'Guide v2' }).build();

    const board = linkByUrl(BoardMother.sample(), [tab]);

    expect(board.items[1]).toMatchObject({ tabId: 7, title: 'Guide v2' });
  });

  it('links two tabs with the same URL to two closed items', () => {
    const start = {
      groups: [],
      items: [
        new ItemBuilder().with({ id: 'a', url: 'https://x.test' }).closed().build(),
        new ItemBuilder().with({ id: 'b', url: 'https://x.test', order: 1 }).closed().build(),
      ],
    };
    const tabs = [7, 8].map((id) => new TabBuilder().with({ id, url: 'https://x.test' }).build());

    expect(tabIds(linkByUrl(start, tabs))).toEqual({ a: 7, b: 8 });
  });

  it('skips tabs already linked to another item', () => {
    const tab = new TabBuilder().with({ id: 1, url: 'https://docs.example.com/guide' }).build();

    expect(linkByUrl(BoardMother.sample(), [tab]).items[1]?.tabId).toBeNull();
  });

  it('returns the same board when nothing links', () => {
    const before = BoardMother.sample();

    expect(linkByUrl(before, [new TabBuilder().with({ id: 9, url: 'https://other.test' }).build()])).toBe(before);
  });
});

describe('relink', () => {
  it('keeps links whose tab is still open during the session', () => {
    const tabs = [1, 2, 3].map((id) => new TabBuilder().with({ id, url: `https://t${id}.test` }).build());

    expect(tabIds(relink(BoardMother.sample(), tabs, false))).toEqual({
      'item-1': 1,
      'item-2': null,
      'item-3': 2,
      'item-4': 3,
    });
  });

  it('closes links whose tab is gone', () => {
    expect(tabIds(relink(BoardMother.sample(), [], false))).toEqual({
      'item-1': null,
      'item-2': null,
      'item-3': null,
      'item-4': null,
    });
  });

  it('drops stale tab ids after a browser start and relinks by URL', () => {
    const tabs = [
      // Same id as item-1's old tab, but another page: must not link.
      new TabBuilder().with({ id: 1, url: 'https://unrelated.test' }).build(),
      new TabBuilder().with({ id: 50, url: 'https://jira.example.com/browse/CAR-6124' }).build(),
      new TabBuilder().with({ id: 51, url: 'https://github.com/de-hv/tabstage/pull/42' }).build(),
    ];

    expect(tabIds(relink(BoardMother.sample(), tabs, true))).toEqual({
      'item-1': 50,
      'item-2': null,
      'item-3': 51,
      'item-4': null,
    });
  });
});

describe('applyTabUpdate', () => {
  it('refreshes url, title and favicon of the linked item', () => {
    const board = applyTabUpdate(BoardMother.sample(), 2, {
      url: 'https://github.com/de-hv/tabstage/pull/42/files',
      title: 'Files',
      favIconUrl: 'https://github.com/favicon.ico',
    });

    expect(board.items[2]).toMatchObject({
      url: 'https://github.com/de-hv/tabstage/pull/42/files',
      title: 'Files',
      favIconUrl: 'https://github.com/favicon.ico',
    });
  });

  it('returns the same board when nothing changed or no item is linked', () => {
    const before = BoardMother.sample();

    expect(applyTabUpdate(before, 1, { url: before.items[0]!.url })).toBe(before);
    expect(applyTabUpdate(before, 99, { title: 'X' })).toBe(before);
  });
});

describe('applyTabRemoved', () => {
  it('turns the linked item into a closed link', () => {
    expect(applyTabRemoved(BoardMother.sample(), 2).items[2]?.tabId).toBeNull();
  });

  it('returns the same board for an untracked tab', () => {
    const before = BoardMother.sample();

    expect(applyTabRemoved(before, 99)).toBe(before);
  });
});

describe('in the browser', () => {
  let fake: FakeTabs;

  beforeEach(async () => {
    fakeBrowser.reset();
    fake = FakeTabs.install().with({
      tabs: [
        new TabBuilder().with({ id: 1, url: 'https://jira.example.com/browse/CAR-6124' }).build(),
        new TabBuilder().with({ id: 2, url: 'https://github.com/de-hv/tabstage/pull/42' }).build(),
      ],
    });
    await boardItem.setValue(BoardMother.sample());
  });

  afterEach(() => {
    fake.uninstall();
  });

  describe('registerTracker', () => {
    it('relinks by URL at the start of a browser session and marks the session', async () => {
      await registerTracker();

      expect(tabIds(await getBoard())).toEqual({ 'item-1': 1, 'item-2': null, 'item-3': 2, 'item-4': null });
      expect(await sessionLinkedItem.getValue()).toBe(true);
    });

    it('keeps tab ids within a session (service worker restart)', async () => {
      await sessionLinkedItem.setValue(true);
      fake.tabs[0]!.url = 'https://navigated.test';

      await registerTracker();

      expect((await getBoard()).items[0]?.tabId).toBe(1);
    });

    it('links a created tab to a closed item with its URL', async () => {
      await registerTracker();

      await fakeBrowser.tabs.create({ url: 'https://docs.example.com/guide' });

      expect((await getBoard()).items[1]?.tabId).toBe(100);
    });

    it('links a restored tab when its URL arrives in onUpdated', async () => {
      await registerTracker();
      const tab = await fakeBrowser.tabs.create({});

      await fake.changeTab(tab.id!, { url: 'https://docs.example.com/guide' });

      expect((await getBoard()).items[1]?.tabId).toBe(tab.id);
    });

    it('refreshes the item when its tab navigates', async () => {
      await registerTracker();

      await fake.changeTab(2, { url: 'https://github.com/de-hv/tabstage/pull/43', title: 'PR #43' });

      expect((await getBoard()).items[2]).toMatchObject({ url: 'https://github.com/de-hv/tabstage/pull/43', title: 'PR #43' });
    });

    it('leaves a closed link when the tab is closed', async () => {
      await registerTracker();

      await fake.closeTab(2);

      const board = await getBoard();
      expect(board.items[2]).toMatchObject({ id: 'item-3', tabId: null });
      expect(board.items).toHaveLength(4);
    });

    it('never touches native tab groups', async () => {
      await registerTracker();
      await fakeBrowser.tabs.create({ url: 'https://docs.example.com/guide' });
      await fake.changeTab(1, { title: 'x' });
      await fake.closeTab(2);

      expect(fake.forbidden).toEqual([]);
    });
  });

  describe('reopenItem', () => {
    it('opens the URL in a new tab and links it', async () => {
      const closed = (await getBoard()).items[1]!;

      await reopenItem(closed);

      expect(fake.tab(100)).toMatchObject({ url: 'https://docs.example.com/guide', active: true });
      expect((await getBoard()).items[1]?.tabId).toBe(100);
    });

    it('links the right item when the background linked another one first', async () => {
      await registerTracker();
      await boardItem.setValue({
        groups: [],
        items: [
          new ItemBuilder().with({ id: 'a', url: 'https://x.test' }).closed().build(),
          new ItemBuilder().with({ id: 'b', url: 'https://x.test', order: 1 }).closed().build(),
        ],
      });

      await reopenItem((await getBoard()).items[1]!);

      expect(tabIds(await getBoard())).toEqual({ a: null, b: 100 });
    });
  });

  describe('openItem', () => {
    it('focuses the tab and its window', async () => {
      await openItem((await getBoard()).items[2]!);

      expect(fake.tab(2)?.active).toBe(true);
      expect(fake.focusedWindowId).toBe(1);
    });

    it('reopens a closed link', async () => {
      await openItem((await getBoard()).items[1]!);

      expect(fake.tab(100)?.url).toBe('https://docs.example.com/guide');
    });

    it('reopens when the linked tab no longer exists', async () => {
      await openItem({ ...(await getBoard()).items[3]!, tabId: 3 });

      expect(fake.tab(100)?.url).toBe('https://jira.example.com/browse/CAR-6115');
    });
  });
});
