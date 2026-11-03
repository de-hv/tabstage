import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '../__mocks__/fake-tab-groups';
import { GroupTabBuilder } from '../__mocks__/group-tab.builder';
import { GroupBuilder } from '../__mocks__/group.builder';
import { StatusMother } from '../__mocks__/status.mother';
import { TabBuilder } from '../__mocks__/tab.builder';
import { TabGroupBuilder } from '../__mocks__/tab-group.builder';
import { GroupCard } from './GroupCard';

let fake: FakeTabGroups;
const statuses = StatusMother.defaults();

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabGroups.install().with({
    groups: [new TabGroupBuilder().with({ id: 1, windowId: 2 }).build()],
    tabs: [
      new TabBuilder().with({ id: 10, groupId: 1, windowId: 2, active: true }).build(),
      new TabBuilder().with({ id: 11, groupId: 1, windowId: 2, index: 1 }).build(),
    ],
  });
});

afterEach(() => {
  cleanup();
  fake.uninstall();
});

const group = new GroupBuilder()
  .with({
    id: 1,
    windowId: 2,
    tabs: [
      new GroupTabBuilder().with({ id: 10, windowId: 2, title: 'CAR-6124 · Jira', active: true }).build(),
      new GroupTabBuilder()
        .with({ id: 11, windowId: 2, index: 1, title: '', url: 'https://github.com/pr/1', favIconUrl: undefined })
        .build(),
    ],
  })
  .build();

function renderCard(value = group) {
  render(
    <ul>
      <GroupCard group={value} statuses={statuses} />
    </ul>,
  );
  // The first button is the row toggle; the second is the status chip.
  const [toggle] = screen.getAllByRole('button');
  if (!toggle) throw new Error('No toggle rendered');
  return toggle;
}

describe('GroupCard', () => {
  it('shows the ticket key, the rest of the name, the tab count and the status chip', () => {
    const toggle = renderCard();

    expect(within(toggle).getByText('CAR-6124')).toBeTruthy();
    expect(within(toggle).getByText('login fix')).toBeTruthy();
    expect(within(toggle).getByLabelText('2 tabs')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Status: STG/ }).textContent).toBe('STG');
  });

  it('shows "No status" on the chip of a group with no status', () => {
    renderCard(new GroupBuilder().with({ statusId: null, title: 'CAR-6124 login fix' }).build());

    expect(screen.getByRole('button', { name: /^Status: No status/ })).toBeTruthy();
  });

  it('shows the whole name when there is no ticket key', () => {
    renderCard(new GroupBuilder().with({ name: 'Research', ticketKey: 'Research' }).build());

    expect(screen.getByText('Research')).toBeTruthy();
  });

  it('hides the tabs until it is expanded', async () => {
    const user = userEvent.setup();
    const toggle = renderCard();
    expect(screen.queryByRole('list', { name: 'Tabs in CAR-6124' })).toBeNull();

    await user.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const tabs = screen.getByRole('list', { name: 'Tabs in CAR-6124' });
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'CAR-6124 · Jira',
      'https://github.com/pr/1',
    ]);
  });

  it('collapses again on a second click', async () => {
    const user = userEvent.setup();
    const toggle = renderCard();

    await user.click(toggle);
    await user.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Tabs in CAR-6124' })).toBeNull();
  });

  it('does not collapse the native group when expanded', async () => {
    const user = userEvent.setup();
    await user.click(renderCard());

    expect(fake.updates).toEqual([]);
  });

  it('says so when the group has no tabs', async () => {
    const user = userEvent.setup();
    await user.click(renderCard(new GroupBuilder().with({ tabs: [] }).build()));

    expect(screen.getByText('No tabs')).toBeTruthy();
  });

  it('focuses the tab and its window when a tab is clicked', async () => {
    const user = userEvent.setup();
    await user.click(renderCard());

    await user.click(screen.getByRole('button', { name: 'https://github.com/pr/1' }));

    await waitFor(() => expect(fake.tabs.find((t) => t.id === 11)?.active).toBe(true));
    expect(fake.tabs.find((t) => t.id === 10)?.active).toBe(false);
    expect(fake.focusedWindowId).toBe(2);
  });

  it('opens the status picker from the chip', async () => {
    const user = userEvent.setup();
    renderCard();
    const chip = screen.getByRole('button', { name: /^Status: STG/ });

    await user.click(chip);

    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox', { name: 'Status' })).toBeTruthy();
  });

  it('closes the picker when the chip is clicked again', async () => {
    const user = userEvent.setup();
    renderCard();
    const chip = screen.getByRole('button', { name: /^Status: STG/ });

    await user.click(chip);
    await user.click(chip);

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('returns focus to the chip when the picker closes with Escape', async () => {
    const user = userEvent.setup();
    renderCard();
    const chip = screen.getByRole('button', { name: /^Status: STG/ });

    await user.click(chip);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(chip);
  });
});
