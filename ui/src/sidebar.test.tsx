import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands } from './test/ipc';
import {
  CARRIER,
  DONE,
  IN_TEST,
  MONEY,
  ONBOARDING,
  PR_LINK,
  REMOVE_MAP,
  REVIEW,
  STANDUP,
  TRABAJO,
  clickMenuItem,
  drag,
  renderApp,
  rightClick,
  sidebar,
  treeRow,
} from './test/render';

const lane = (name: string) => within(sidebar()).getByRole('listitem', { name: `Trabajo: ${name}` });

describe('sidebar lanes', () => {
  it('shows each profile’s tickets by status, in workflow order, then its notes', async () => {
    await renderApp();

    const lanes = within(sidebar())
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('aria-label'))
      .filter((label): label is string => label?.startsWith('Trabajo: ') ?? false);
    expect(lanes).toEqual(['Trabajo: In review', 'Trabajo: In TEST', 'Trabajo: No status', 'Trabajo: Notes']);
    expect(within(lane('In TEST')).getByRole('button', { name: 'CAR-5899 Carrier Commissions' })).toBeTruthy();
    expect(within(lane('Notes')).getByRole('button', { name: 'Standup notes' })).toBeTruthy();
  });

  it('paints a ticket with its status color and the status in its tooltip', async () => {
    await renderApp();

    const row = treeRow('Carrier Commissions');
    expect(row.getAttribute('data-lane')).toBe('true');
    expect(row.style.getPropertyValue('--lane')).toBe('var(--profile-0)');
    expect(within(row).getByRole('button', { name: 'CAR-5899 Carrier Commissions' }).getAttribute('title')).toContain(
      'Status: In TEST',
    );
    expect(treeRow('Onboarding wiki').hasAttribute('data-lane')).toBe(false);
  });

  it('expands a ticket to its links and sub-tickets; a link opens with a click', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Carrier Commissions' }));
    expect(treeRow('Money card')).toBeTruthy();
    await user.click(within(sidebar()).getByRole('button', { name: 'PR #2214' }));

    expect(calls).toContainEqual({ cmd: 'open_link', args: { link: PR_LINK } });
  });

  it('adds a ticket in a lane, taking a leading key as its key, and shows it', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'New ticket in In review' }));
    await user.type(screen.getByRole('textbox', { name: 'Ticket title' }), 'CAR-7000 Fix the map{Enter}');

    const [command] = appliedCommands(calls);
    expect(command).toMatchObject({
      type: 'addTicket',
      place: { profile: TRABAJO },
      title: 'Fix the map',
      key: 'CAR-7000',
      status: REVIEW,
    });
    expect(command && 'id' in command && command.id).toBeTruthy();
  });

  it('adds a note from the profile menu', async () => {
    const { calls, user } = await renderApp();

    await rightClick('Trabajo');
    clickMenuItem('New note');
    await user.type(await screen.findByRole('textbox', { name: 'Note title' }), 'Retro{Enter}');

    expect(appliedCommands(calls)[0]).toMatchObject({ type: 'addNote', profile: TRABAJO, title: 'Retro' });
  });

  it('changes a ticket’s status by dragging it to another lane', async () => {
    const { calls } = await renderApp();

    drag(treeRow('Onboarding wiki'), lane('In review').querySelector('.lane__head')!);

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTicket', ticket: ONBOARDING, place: { profile: TRABAJO }, index: 2, lane: { status: REVIEW } },
    ]);
  });

  it('sets a ticket’s status from its menu', async () => {
    const { calls } = await renderApp();

    await rightClick('Onboarding wiki');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Done' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'setTicketStatus', ticket: ONBOARDING, status: DONE }]);
  });

  it('makes a ticket a sub-ticket of another from its menu', async () => {
    const { calls } = await renderApp();

    await rightClick('Remove map');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make sub-ticket of' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'CAR-5899 Carrier Commissions' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTicket', ticket: REMOVE_MAP, place: { ticket: CARRIER }, index: 1 },
    ]);
  });

  it('asks before deleting a ticket with sub-tickets or links', async () => {
    const { calls } = await renderApp();

    await rightClick('Carrier Commissions');
    clickMenuItem('Delete…');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('its 1 sub-ticket and 1 link');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(appliedCommands(calls)).toEqual([{ type: 'removeTicket', ticket: CARRIER }]));
    expect(IN_TEST && MONEY && STANDUP).toBeTruthy();
  });
});
