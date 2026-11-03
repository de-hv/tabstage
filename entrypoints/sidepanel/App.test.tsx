import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '@/__mocks__/fake-tab-groups';
import { StatusBuilder } from '@/__mocks__/status.builder';
import { StatusMother } from '@/__mocks__/status.mother';
import { TabBuilder } from '@/__mocks__/tab.builder';
import { TabGroupBuilder } from '@/__mocks__/tab-group.builder';
import { statusesItem } from '@/lib/statuses';
import App from './App';

let fake: FakeTabGroups;

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabGroups.install().with({
    groups: [
      new TabGroupBuilder().with({ id: 1, title: 'CAR-6124 login · STG', color: 'orange' }).build(),
      new TabGroupBuilder().with({ id: 2, title: 'CAR-7000 · To do', color: 'grey' }).build(),
      new TabGroupBuilder().with({ id: 3, title: 'Research', color: 'red' }).build(),
    ],
    tabs: [
      new TabBuilder().with({ id: 10, groupId: 1, index: 0, title: 'Login bug' }).build(),
      new TabBuilder().with({ id: 20, groupId: 2, index: 1, title: 'Payments' }).build(),
      new TabBuilder().with({ id: 30, groupId: 3, index: 2, title: 'Notes' }).build(),
    ],
  });
});

afterEach(() => {
  cleanup();
  fake.uninstall();
});

const lane = (label: string) => screen.getByRole('region', { name: new RegExp(`^${label}`) });
const keysIn = (label: string) =>
  within(lane(label))
    .queryAllByRole('listitem')
    .map((item) => item.querySelector('.group-card__key')?.textContent)
    .filter(Boolean);

async function renderApp() {
  render(<App />);
  await screen.findByRole('region', { name: /^STG/ });
}

describe('App', () => {
  it('shows "No status" and every status lane with its groups and counts', async () => {
    await renderApp();

    const labels = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.querySelector('.lane__label')?.textContent);
    expect(labels).toEqual(['No status', ...StatusMother.defaults().map((s) => s.label)]);
    expect(keysIn('No status')).toEqual(['Research']);
    expect(keysIn('STG')).toEqual(['CAR-6124']);
    expect(keysIn('To do')).toEqual(['CAR-7000']);
    expect(within(lane('STG')).getByLabelText('1 groups')).toBeTruthy();
    expect(within(lane('Done')).getByLabelText('0 groups')).toBeTruthy();
  });

  it('moves a group to its new lane when its status is picked', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(within(lane('STG')).getByRole('button', { name: /^Status: STG/ }));
    await user.click(screen.getByRole('option', { name: 'Done' }));

    await waitFor(() => expect(keysIn('Done')).toEqual(['CAR-6124']));
    expect(keysIn('STG')).toEqual([]);
    expect(fake.group(1)).toMatchObject({ title: 'CAR-6124 login · Done', color: 'green' });
  });

  it('shows groups created or renamed in the tab strip', async () => {
    await renderApp();

    const created = new TabGroupBuilder().with({ id: 4, title: 'CAR-8000 · Review' }).build();
    fake.groups.push(created);
    await fake.onCreated.trigger(created);
    const renamed = Object.assign(fake.group(3)!, { title: 'Research · Test' });
    await fake.onUpdated.trigger({ ...renamed });

    await waitFor(() => expect(keysIn('Review')).toEqual(['CAR-8000']));
    expect(keysIn('Test')).toEqual(['Research']);
    expect(keysIn('No status')).toEqual([]);
  });

  it('renames lanes when the statuses change', async () => {
    await renderApp();

    await statusesItem.setValue([
      new StatusBuilder().with({ id: 'stg', label: 'Staging', color: 'orange', order: 0 }).build(),
    ]);

    // Titles still say "STG", so every group drops to "No status" (the
    // background's title migration is not running here).
    await waitFor(() =>
      expect(keysIn('No status')).toEqual(['CAR-6124', 'CAR-7000', 'Research']),
    );
    expect(keysIn('Staging')).toEqual([]);
  });

  it('filters groups by name, ticket key or tab title', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByRole('searchbox', { name: 'Filter groups' }), 'payments');

    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(keysIn('To do')).toEqual(['CAR-7000']);
  });

  it('clears the filter with Escape', async () => {
    const user = userEvent.setup();
    await renderApp();
    const filter = screen.getByRole('searchbox', { name: 'Filter groups' });

    await user.type(filter, 'payments{Escape}');

    expect((filter as HTMLInputElement).value).toBe('');
    expect(screen.getAllByRole('region')).toHaveLength(9);
  });

  it('says when nothing matches the filter', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.type(screen.getByRole('searchbox', { name: 'Filter groups' }), 'zzz');

    expect(screen.getByText('No groups match “zzz”.')).toBeTruthy();
  });

  it('says when there are no tab groups', async () => {
    fake.with({ groups: [], tabs: [] });
    render(<App />);

    expect(await screen.findByText(/^No tab groups yet/)).toBeTruthy();
  });
});
