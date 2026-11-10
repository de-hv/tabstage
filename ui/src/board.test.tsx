import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands } from './test/ipc';
import {
  GRAFANA_TAB,
  IN_TEST,
  ONBOARDING,
  QA,
  STAGING_TAB,
  STATUS_TAB,
  TRABAJO,
  WORK,
  drag,
  renderApp,
  treeRow,
} from './test/render';

const board = () => screen.getByRole('list', { name: 'Board of Trabajo' });
const column = (name: string) => within(board()).getByRole('listitem', { name });
const card = (name: RegExp) => {
  const button = within(board()).getByRole('button', { name });
  return button;
};

describe('profile board', () => {
  it('has a column for loose items and one per group, like statuses', async () => {
    await renderApp();

    const names = Array.from(board().children, (column) => column.getAttribute('aria-label'));
    expect(names).toEqual(['Loose in Trabajo', 'Trabajo · Jira', 'In TEST']);
    expect(within(column('Loose in Trabajo')).getByRole('button', { name: /Onboarding/ })).toBeTruthy();
    expect(within(column('In TEST')).getByRole('button', { name: /Staging dashboard/ })).toBeTruthy();
  });

  it('moving a card to another column moves it to that group', async () => {
    const { calls } = await renderApp();

    drag(card(/Grafana/), column('In TEST'));

    expect(appliedCommands(calls)).toEqual([{ type: 'moveTab', tab: GRAFANA_TAB, place: { group: IN_TEST }, index: 1 }]);
  });

  it('a card can leave its group for the loose column', async () => {
    const { calls } = await renderApp();

    drag(card(/Staging dashboard/), column('Loose in Trabajo'));

    expect(appliedCommands(calls)).toEqual([{ type: 'moveTab', tab: STAGING_TAB, place: { profile: TRABAJO }, index: 4 }]);
  });

  it('folders move between columns too', async () => {
    const { calls } = await renderApp();

    drag(card(/Onboarding/), column('Trabajo · Jira'));

    expect(appliedCommands(calls)).toEqual([{ type: 'moveFolder', folder: ONBOARDING, place: { group: WORK }, index: 4 }]);
  });

  it('clicking a tab card opens it; a folder card shows the folder', async () => {
    const { calls, user } = await renderApp();

    await user.click(card(/Status page/));
    expect(calls).toContainEqual({ cmd: 'open_tab', args: { tab: STATUS_TAB } });

    await user.click(card(/Onboarding/));
    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeTruthy();
  });

  it('opens every tab of the profile', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Open all' }));

    expect(calls).toContainEqual({ cmd: 'open_profile', args: { profile: TRABAJO } });
  });
});

describe('dragging in the sidebar', () => {
  it('drops a tab on a profile to take it out of every group', async () => {
    const { calls } = await renderApp();

    drag(treeRow('Status page'), treeRow('QA'));

    expect(appliedCommands(calls)).toEqual([{ type: 'moveTab', tab: STATUS_TAB, place: { profile: QA }, index: 1 }]);
  });

  it('drops a folder on a group to put it inside', async () => {
    const { calls } = await renderApp();

    drag(treeRow('Onboarding'), treeRow('In TEST'));

    expect(appliedCommands(calls)).toEqual([{ type: 'moveFolder', folder: ONBOARDING, place: { group: IN_TEST }, index: 1 }]);
  });

  it('reorders groups by dropping one on another', async () => {
    const { calls } = await renderApp();

    drag(treeRow('In TEST'), treeRow('Trabajo · Jira'));

    expect(appliedCommands(calls)).toEqual([{ type: 'moveGroup', group: IN_TEST, profile: TRABAJO, index: 0 }]);
  });
});
