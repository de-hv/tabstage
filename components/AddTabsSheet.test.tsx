import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardMother } from '@/__mocks__/board.mother';
import { FakeTabs } from '@/__mocks__/fake-tabs';
import { StatusMother } from '@/__mocks__/status.mother';
import { TabBuilder } from '@/__mocks__/tab.builder';
import { AddTabsSheet } from './AddTabsSheet';

let fake: FakeTabs;

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabs.install().with({
    tabs: [
      // Tab 1 is already on the board (item-1).
      new TabBuilder().with({ id: 1, title: 'Login fix' }).build(),
      new TabBuilder().with({ id: 7, title: 'Search results' }).build(),
      new TabBuilder().with({ id: 8, title: 'Calendar' }).build(),
      new TabBuilder().with({ id: 9, title: 'Other window', windowId: 2 }).build(),
    ],
  });
});

afterEach(() => {
  cleanup();
  fake.uninstall();
});

function setup() {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(
    <AddTabsSheet
      board={BoardMother.sample()}
      statuses={StatusMother.defaults()}
      initial={{ kind: 'status', statusId: 'in-review' }}
      onAdd={onAdd}
      onClose={onClose}
    />,
  );
  return { user, onAdd, onClose };
}

describe('AddTabsSheet', () => {
  it('lists only the open tabs of this window that are not in Tabstage', async () => {
    setup();

    await screen.findByRole('list', { name: 'Open tabs' });
    expect(screen.getAllByRole('checkbox').map((box) => box.parentElement?.textContent)).toEqual([
      'Search results',
      'Calendar',
    ]);
  });

  it('adds the selected tabs to the chosen status', async () => {
    const { user, onAdd } = setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Search results' }));
    await user.click(screen.getByRole('checkbox', { name: 'Calendar' }));

    await user.click(screen.getByRole('button', { name: 'Add 2 tabs' }));

    expect(onAdd).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 7 }), expect.objectContaining({ id: 8 })],
      { kind: 'status', statusId: 'in-review' },
    );
  });

  it('adds to a group picked as the destination', async () => {
    const { user, onAdd } = setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Calendar' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Add to' }), 'CAR-6115 · In progress');

    await user.click(screen.getByRole('button', { name: 'Add 1 tab' }));

    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ id: 8 })], { kind: 'group', groupId: 'group-1' });
  });

  it('selects all and none', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Select all' }));

    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Select none' }));
    expect(screen.getAllByRole('checkbox').some((box) => (box as HTMLInputElement).checked)).toBe(false);
  });

  it('disables Add until a tab is selected', async () => {
    setup();
    await screen.findByRole('list', { name: 'Open tabs' });

    expect((screen.getByRole('button', { name: 'Add 0 tabs' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when every tab is already added', async () => {
    fake.with({ tabs: [new TabBuilder().with({ id: 1 }).build()] });
    setup();

    expect(await screen.findByText('Every open tab is already in Tabstage.')).toBeTruthy();
  });

  it('closes on Escape and on Cancel', async () => {
    const { user, onClose } = setup();

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
