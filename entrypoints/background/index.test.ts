import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardMother } from '../../__mocks__/board.mother';
import { FakeTabs } from '../../__mocks__/fake-tabs';
import { TabBuilder } from '../../__mocks__/tab.builder';
import { boardItem, getBoard } from '../../lib/board';
import { paletteRequestItem } from '../../lib/panel';
import { renameStatus, saveStatuses, getStatuses } from '../../lib/statuses';
import background from './index';

let fake: FakeTabs;

/** Lets storage watchers and queued menu rebuilds finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  fakeBrowser.reset();
  vi.stubEnv('BROWSER', 'chrome');
  fake = FakeTabs.install().with({
    tabs: [new TabBuilder().with({ id: 1, url: 'https://jira.example.com/browse/CAR-6124' }).build()],
  });
  await boardItem.setValue(BoardMother.sample());
  background.main();
  await settle();
});

afterEach(() => {
  fake.uninstall();
  vi.unstubAllEnvs();
});

describe('background', () => {
  it('relinks the board to the open tabs on start', async () => {
    expect((await getBoard()).items.map((item) => item.tabId)).toEqual([1, null, null, null]);
  });

  it('builds the page menu and rebuilds it when a status changes', async () => {
    expect(fake.menus.map((entry) => entry.title)).toContain('In progress');

    await saveStatuses(renameStatus(await getStatuses(), 'in-progress', 'Doing'));
    await settle();

    expect(fake.menus.map((entry) => entry.title)).toContain('Doing');
  });

  it('rebuilds the page menu when a group is renamed', async () => {
    await boardItem.setValue({
      ...BoardMother.sample(),
      groups: [{ ...BoardMother.sample().groups[0]!, name: 'CAR-7000' }],
    });
    await settle();

    expect(fake.menus.map((entry) => entry.title)).toContain('CAR-7000 (In progress)');
  });

  it('adds the page tab from the menu', async () => {
    await fake.onMenuClicked.trigger(
      { menuItemId: 'tabstage-status:done' },
      new TabBuilder().with({ id: 5, url: 'https://new.test' }).build(),
    );
    await settle();

    expect((await getBoard()).items.at(-1)).toMatchObject({ tabId: 5, statusId: 'done' });
  });

  it('makes the toolbar icon toggle the side panel on Chrome', () => {
    expect(fake.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });

  it('opens the side panel on toggle-panel', async () => {
    await fake.onCommand.trigger('toggle-panel', new TabBuilder().with({ windowId: 4 }).build());

    expect(fake.sidePanel.open).toHaveBeenCalledWith({ windowId: 4 });
  });

  it('opens the panel and requests the palette on open-palette', async () => {
    await fake.onCommand.trigger('open-palette', new TabBuilder().with({ windowId: 4 }).build());
    await settle();

    expect(fake.sidePanel.open).toHaveBeenCalledWith({ windowId: 4 });
    expect(await paletteRequestItem.getValue()).toEqual(expect.any(Number));
  });

  it('ignores other commands', async () => {
    await fake.onCommand.trigger('other', new TabBuilder().build());

    expect(fake.sidePanel.open).not.toHaveBeenCalled();
  });

  it('never calls tabGroups.*, tabs.group or tabs.ungroup', async () => {
    await fakeBrowser.tabs.create({ url: 'https://docs.example.com/guide' });
    await fake.changeTab(1, { title: 'Renamed' });
    await fake.onMenuClicked.trigger({ menuItemId: 'tabstage-group:group-1' }, fake.tab(1));
    await fake.closeTab(1);
    await fake.onCommand.trigger('toggle-panel', undefined);
    await settle();

    expect(fake.forbidden).toEqual([]);
  });
});

describe('background on Firefox', () => {
  it('toggles the sidebar from the toolbar icon', async () => {
    vi.stubEnv('BROWSER', 'firefox');
    background.main();

    await fake.onActionClicked.trigger(new TabBuilder().build());

    expect(fake.sidebarAction.toggle).toHaveBeenCalledOnce();
  });
});
