import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardMother } from '@/__mocks__/board.mother';
import { FakeTabs } from '@/__mocks__/fake-tabs';
import { TabBuilder } from '@/__mocks__/tab.builder';
import { boardItem, getBoard } from '@/lib/board';
import { paletteRequestItem } from '@/lib/panel';
import { getStatuses } from '@/lib/statuses';
import App from './App';

let fake: FakeTabs;

beforeEach(async () => {
  fakeBrowser.reset();
  fake = FakeTabs.install().with({
    tabs: [
      new TabBuilder().with({ id: 1, title: 'Login fix', url: 'https://jira.example.com/browse/CAR-6124' }).build(),
      new TabBuilder().with({ id: 2, title: 'PR #42' }).build(),
      new TabBuilder().with({ id: 3, title: 'Spec' }).build(),
      new TabBuilder().with({ id: 7, title: 'Search results', url: 'https://search.test', active: true }).build(),
    ],
  });
  await boardItem.setValue(BoardMother.sample());
  // The menu is positioned in a layout effect; happy-dom has no layout.
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 0;
  });
});

afterEach(() => {
  cleanup();
  fake.uninstall();
});

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('region', { name: 'To do' });
  return { user };
}

const tile = (label: string) => screen.getByRole('region', { name: label });
const rowTitles = (label: string) =>
  within(tile(label))
    .queryAllByRole('button')
    .filter((button) => button.className === 'item__main')
    .map((button) => button.querySelector('.item__title')?.textContent);

async function openItemMenu(user: ReturnType<typeof userEvent.setup>, title: RegExp | string) {
  fireEvent.contextMenu(screen.getByRole('button', { name: title }), { clientX: 10, clientY: 10 });
  await screen.findByRole('menu');
  return user;
}

describe('App', () => {
  it('says "Loading…" before the first read', () => {
    render(<App />);

    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows one tile per status with only the added tabs', async () => {
    await setup();

    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-labelledby'))).toHaveLength(5);
    expect(rowTitles('To do')).toEqual(['CAR-6124 · Login fix', 'Docs guide']);
    expect(rowTitles('In progress')).toEqual(['PR #42', 'CAR-6115 spec']);
    expect(screen.queryByText('Search results')).toBeNull();
    expect(tile('Done').getAttribute('data-empty')).toBe('true');
  });

  it('draws the first tile focused, then the one the user works in', async () => {
    const { user } = await setup();
    expect(tile('To do').getAttribute('data-focused')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Actions for Done' }));

    expect(tile('Done').getAttribute('data-focused')).toBe('true');
    expect(tile('To do').getAttribute('data-focused')).toBeNull();
  });

  it('explains how to add tabs and where the panel side is set when the board is empty', async () => {
    await boardItem.setValue(BoardMother.empty());
    await setup();

    expect(screen.getByText(/Only the tabs you add show here/)).toBeTruthy();
    expect(screen.getByText(/That is a browser setting/)).toBeTruthy();
  });

  it('filters tabs and groups', async () => {
    const { user } = await setup();

    await user.type(screen.getByRole('searchbox', { name: 'Filter tabs' }), 'docs');

    expect(rowTitles('To do')).toEqual(['Docs guide']);
    expect(tile('In progress').getAttribute('data-empty')).toBe('true');
  });

  it('follows board changes saved elsewhere', async () => {
    await setup();

    await boardItem.setValue(BoardMother.empty());

    await waitFor(() => expect(rowTitles('To do')).toEqual([]));
  });

  describe('tabs', () => {
    it('focuses an open tab on click', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'PR #42' }));

      expect(fake.tab(2)?.active).toBe(true);
    });

    it('reopens a closed link on click', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: /Docs guide \(closed/ }));

      await waitFor(() => expect(fake.tab(100)?.url).toBe('https://docs.example.com/guide'));
    });

    it('removes a closed link with ✕', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'Remove Docs guide' }));

      await waitFor(() => expect(rowTitles('To do')).toEqual(['CAR-6124 · Login fix']));
    });

    it('moves a tab to any status from its menu, with the keyboard', async () => {
      const { user } = await setup();
      screen.getByRole('button', { name: 'CAR-6124 · Login fix' }).focus();

      await user.keyboard('{Shift>}{F10}{/Shift}');
      await screen.findByRole('menu', { name: 'Actions for CAR-6124 · Login fix' });
      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
      expect(screen.getByRole('menu', { name: 'Move to status' })).toBeTruthy();
      await user.keyboard('{End}{Enter}');

      await waitFor(() => expect(rowTitles('Done')).toEqual(['CAR-6124 · Login fix']));
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('creates a group with the tab and renames it inline', async () => {
      const { user } = await setup();
      await openItemMenu(user, 'CAR-6124 · Login fix');

      await user.click(screen.getByRole('menuitem', { name: 'New group with tab' }));
      const field = await screen.findByRole('textbox', { name: 'Rename group New group' });
      await user.clear(field);
      await user.type(field, 'Login{Enter}');

      await waitFor(() => expect(screen.getByRole('button', { name: /Login/, expanded: true })).toBeTruthy());
      expect((await getBoard()).groups.find((group) => group.name === 'Login')?.statusId).toBe('todo');
    });

    it('removes a tab from Tabstage', async () => {
      const { user } = await setup();
      await openItemMenu(user, 'PR #42');

      await user.click(screen.getByRole('menuitem', { name: 'Remove from Tabstage' }));

      await waitFor(() => expect(rowTitles('In progress')).toEqual(['CAR-6115 spec']));
      expect(fake.tab(2)).toBeDefined();
    });

    it('takes a tab out of its group', async () => {
      const { user } = await setup();
      await openItemMenu(user, 'PR #42');

      await user.click(screen.getByRole('menuitem', { name: 'Take out of group' }));

      await waitFor(async () => expect((await getBoard()).items[2]).toMatchObject({ groupId: null, statusId: 'in-progress' }));
    });
  });

  describe('groups', () => {
    it('collapses and expands a group', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: /CAR-6115/, expanded: true }));

      await waitFor(() => expect(screen.queryByRole('button', { name: 'PR #42' })).toBeNull());
    });

    it('moves a group to another status from its menu', async () => {
      const { user } = await setup();
      fireEvent.contextMenu(screen.getByRole('button', { name: /CAR-6115/, expanded: true }), { clientX: 5, clientY: 5 });

      await user.click(await screen.findByRole('menuitem', { name: /Move to status/ }));
      await user.click(screen.getByRole('menuitem', { name: 'In review' }));

      await waitFor(() => expect(rowTitles('In review')).toEqual(['PR #42', 'CAR-6115 spec']));
    });

    it('ungroups', async () => {
      const { user } = await setup();
      fireEvent.contextMenu(screen.getByRole('button', { name: /CAR-6115/, expanded: true }), { clientX: 5, clientY: 5 });

      await user.click(await screen.findByRole('menuitem', { name: 'Ungroup' }));

      await waitFor(() => expect(screen.queryByRole('button', { name: /CAR-6115/, expanded: true })).toBeNull());
      expect(rowTitles('In progress')).toEqual(['PR #42', 'CAR-6115 spec']);
    });
  });

  describe('statuses', () => {
    it('renames a status with a double click', async () => {
      const { user } = await setup();

      await user.dblClick(screen.getByRole('heading', { name: 'Done' }));
      const field = screen.getByRole('textbox', { name: 'Rename Done' });
      await user.clear(field);
      await user.type(field, 'Shipped{Enter}');

      await waitFor(() => expect(screen.getByRole('region', { name: 'Shipped' })).toBeTruthy());
    });

    it('shows why a rename was refused', async () => {
      const { user } = await setup();

      await user.dblClick(screen.getByRole('heading', { name: 'Done' }));
      const field = screen.getByRole('textbox', { name: 'Rename Done' });
      await user.clear(field);
      await user.type(field, 'to do{Enter}');

      expect((await within(tile('Done')).findByRole('alert')).textContent).toContain('more than one status');
    });

    it('recolors, moves and adds statuses from "⋯"', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'Actions for Done' }));
      await user.click(screen.getByRole('menuitem', { name: /Color/ }));
      await user.click(screen.getByRole('menuitem', { name: 'teal' }));
      await waitFor(async () => expect((await getStatuses()).at(-1)?.color).toBe('teal'));

      await user.click(screen.getByRole('button', { name: 'Actions for Done' }));
      await user.click(screen.getByRole('menuitem', { name: 'Move up' }));
      await waitFor(async () => expect((await getStatuses())[3]?.id).toBe('done'));

      await user.click(screen.getByRole('button', { name: 'Actions for To do' }));
      await user.click(screen.getByRole('menuitem', { name: 'Add status after' }));
      await waitFor(async () => expect((await getStatuses())[1]?.label).toBe('New status'));
    });

    it('deletes an empty status without asking', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'Actions for Done' }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete status' }));

      await waitFor(() => expect(screen.queryByRole('region', { name: 'Done' })).toBeNull());
    });

    it('asks where the tabs go when deleting a status with tabs', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'Actions for In progress' }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete status' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Delete In progress?' });
      await user.click(within(dialog).getByRole('button', { name: 'Remove them' }));

      await waitFor(() => expect(screen.queryByRole('region', { name: 'In progress' })).toBeNull());
      expect((await getBoard()).items).toHaveLength(2);
    });
  });

  describe('"+" picker', () => {
    it('adds open tabs to the focused status', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'Add tabs' }));
      await user.click(await screen.findByRole('checkbox', { name: 'Search results' }));
      await user.click(screen.getByRole('button', { name: 'Add 1 tab' }));

      await waitFor(() => expect(rowTitles('To do')).toContain('Search results'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('palette', () => {
    it('opens from the palette button and moves an item with "<item> <status>"', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'Open command palette' }));
      await user.keyboard('docs done{Enter}');

      await waitFor(() => expect(rowTitles('Done')).toEqual(['Docs guide']));
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    });

    it('opens when the background requests it (Alt+Shift+K)', async () => {
      await setup();

      await paletteRequestItem.setValue(Date.now());

      expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy();
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Command' })));
    });

    it('adds the active tab with "add"', async () => {
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'Open command palette' }));
      await user.keyboard('add done{Enter}');

      await waitFor(() => expect(rowTitles('Done')).toEqual(['Search results']));
    });

    it('shows a group: expands it and focuses its header', async () => {
      await boardItem.setValue({
        ...BoardMother.sample(),
        groups: [{ ...BoardMother.sample().groups[0]!, collapsed: true }],
      });
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'Open command palette' }));
      await user.keyboard('car-6115{Enter}');

      await waitFor(() => expect(document.activeElement?.id).toBe('group-group-1'));
      expect(screen.getByRole('button', { name: 'PR #42' })).toBeTruthy();
    });
  });

  it('never touches native tab groups', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'PR #42' }));
    await openItemMenu(user, 'CAR-6124 · Login fix');
    await user.click(screen.getByRole('menuitem', { name: 'New group with tab' }));
    await user.keyboard('{Enter}');

    expect(fake.forbidden).toEqual([]);
  });
});
