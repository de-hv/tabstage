import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands } from './test/ipc';
import { DONE, ONBOARDING, REMOVE_MAP, TRABAJO, drag, renderApp } from './test/render';

const board = () => screen.getByRole('list', { name: 'Status board' });
const column = (name: string) => within(board()).getByRole('listitem', { name });

describe('status board', () => {
  it('has a column per status in workflow order, then "No status", with the tickets in them', async () => {
    await renderApp();

    const names = within(board())
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('aria-label'))
      .filter(Boolean);
    expect(names).toEqual(['In review', 'In TEST', 'Done', 'No status']);
    expect(within(column('In TEST')).getByText('Carrier Commissions')).toBeTruthy();
    expect(within(column('In TEST')).getByTitle('1 sub-tickets, 1 in this status')).toBeTruthy();
    expect(within(column('Done')).getByText('Drop tickets here')).toBeTruthy();
  });

  it('changes a ticket’s status by dragging its card to another column', async () => {
    const { calls } = await renderApp();

    drag(within(column('No status')).getByText('Onboarding wiki').closest('.card')!, column('Done'));

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTicket', ticket: ONBOARDING, place: { profile: TRABAJO }, index: 2, lane: { status: DONE } },
    ]);
  });

  it('adds a ticket in a column and lists the notes below', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(column('Done')).getByRole('button', { name: 'New ticket in Done' }));
    await user.type(screen.getByRole('textbox', { name: 'Ticket title' }), 'Ship it{Enter}');

    expect(appliedCommands(calls)[0]).toMatchObject({ type: 'addTicket', title: 'Ship it', status: DONE });
    expect(within(screen.getByRole('region', { name: 'Notes' })).getByText('Standup notes')).toBeTruthy();
  });

  it('shows a ticket when its card is clicked', async () => {
    const { user } = await renderApp();

    await user.click(within(column('In review')).getByText('Remove map'));

    expect(await screen.findByRole('main', { name: 'Remove map' })).toBeTruthy();
    expect(REMOVE_MAP).toBeTruthy();
  });
});
