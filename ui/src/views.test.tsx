import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { appliedCommands } from './test/ipc';
import {
  CARRIER,
  DONE,
  MONEY,
  ONBOARDING,
  REMOVE_MAP,
  STANDUP,
  TRABAJO,
  chooseOption,
  renderApp,
  sidebar,
} from './test/render';

async function showTicket(name: string) {
  const rendered = await renderApp();
  await rendered.user.click(within(sidebar()).getByText(name));
  const view = await screen.findByRole('main', { name });
  return { ...rendered, view };
}

describe('ticket view', () => {
  it('shows the key with its link, status, sub-tickets and note', async () => {
    const { calls, user, view } = await showTicket('Carrier Commissions');

    expect(within(view).getByRole('button', { name: 'Open ticket CAR-5899' })).toBeTruthy();
    expect(within(view).getByRole('combobox', { name: 'Status: In TEST' })).toBeTruthy();
    expect(within(view).getByRole('button', { name: 'Open ticket CAR-5899' }).getAttribute('title')).toContain(
      'https://jira.example.com/browse/CAR-5899',
    );
    expect(within(view).queryByRole('region', { name: 'Links' })).toBeNull();
    expect(within(within(view).getByRole('region', { name: 'Sub-tickets' })).getByText('Money card')).toBeTruthy();
    expect(within(view).getByText(/Run after the deploy window/)).toBeTruthy();

    await user.click(within(view).getByRole('button', { name: /^Open in/ }));
    await user.click(within(view).getByRole('button', { name: 'Open all' }));
    expect(calls).toContainEqual({ cmd: 'open_ticket', args: { ticket: CARRIER } });
    expect(calls).toContainEqual({ cmd: 'open_ticket_all', args: { ticket: CARRIER } });
  });

  it('changes the type from the picker in the header', async () => {
    const { calls, view } = await showTicket('Carrier Commissions');

    const picker = within(view).getByRole('combobox', { name: 'Ticket type' });
    expect(picker.textContent).toBe('Ticket');
    await chooseOption(picker, 'Bug');

    expect(appliedCommands(calls)).toEqual([{ type: 'setTicketKind', ticket: CARRIER, kind: 'bug' }]);
  });

  it('changes the status from the picker', async () => {
    const { calls, view } = await showTicket('Carrier Commissions');

    await chooseOption(within(view).getByRole('combobox', { name: 'Status: In TEST' }), 'Done');

    expect(appliedCommands(calls)).toEqual([{ type: 'setTicketStatus', ticket: CARRIER, status: DONE }]);
  });

  it('edits the key and the ticket’s own link in place', async () => {
    const { calls, user, view } = await showTicket('Onboarding wiki');

    await user.click(within(view).getByRole('button', { name: /^Ticket$/ }));
    await user.type(within(view).getByRole('textbox', { name: 'Ticket ID' }), 'CAR-9');
    await user.type(within(view).getByRole('textbox', { name: 'Ticket link' }), 'https://jira.example.com/CAR-9{Enter}');

    await waitFor(() =>
      expect(appliedCommands(calls)).toEqual([
        { type: 'setTicketKey', ticket: ONBOARDING, key: 'CAR-9' },
        { type: 'setTicketUrl', ticket: ONBOARDING, url: 'https://jira.example.com/CAR-9' },
      ]),
    );
  });

  it('renames the ticket with a click on its title', async () => {
    const { calls, user, view } = await showTicket('Onboarding wiki');

    await user.click(within(view).getByRole('button', { name: 'Onboarding wiki' }));
    const input = within(view).getByRole('textbox', { name: 'New name' });
    await user.clear(input);
    await user.type(input, 'Client onboarding{Enter}');

    expect(appliedCommands(calls)).toEqual([{ type: 'rename', target: { ticket: ONBOARDING }, name: 'Client onboarding' }]);
  });

  it('copies the ticket link from the key, and only the ⋯ button opens the menu', async () => {
    const { calls, user, view } = await showTicket('Carrier Commissions');
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await user.click(within(view).getByRole('button', { name: 'Copy ticket link' }));
    expect(writeText).toHaveBeenCalledWith('https://jira.example.com/browse/CAR-5899');

    fireEvent.contextMenu(within(view).getByRole('button', { name: 'Open ticket CAR-5899' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(calls).not.toContainEqual(expect.objectContaining({ cmd: 'open_ticket' }));
  });

  it('adds a sub-ticket in the parent’s status', async () => {
    const { calls, user, view } = await showTicket('Carrier Commissions');

    await user.click(within(view).getByRole('button', { name: 'Add sub-ticket' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sub-ticket' }));
    await user.type(within(view).getByRole('textbox', { name: 'Ticket title' }), 'Story{Enter}');
    expect(appliedCommands(calls)[0]).toMatchObject({ type: 'addTicket', place: { ticket: CARRIER }, title: 'Story' });
    expect(appliedCommands(calls)[0]).not.toHaveProperty('kind');
  });

  it('adds a sub-ticket of a kind, such as a bug', async () => {
    const { calls, user, view } = await showTicket('Carrier Commissions');

    await user.click(within(view).getByRole('button', { name: 'Add sub-ticket' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Bug' }));
    await user.type(within(view).getByRole('textbox', { name: 'Bug title' }), 'Crash on save{Enter}');
    expect(appliedCommands(calls)[0]).toMatchObject({ type: 'addTicket', place: { ticket: CARRIER }, title: 'Crash on save', kind: 'bug' });
  });

  it('opens a sub-ticket from its parent and goes back from its path', async () => {
    const { user, view } = await showTicket('Carrier Commissions');

    await user.click(within(view).getByText('Money card'));
    const child = await screen.findByRole('main', { name: 'Money card' });
    expect(within(child).queryByRole('region', { name: 'Sub-tickets' })).toBeNull();
    await user.click(within(child).getByRole('button', { name: 'CAR-5899 Carrier Commissions' }));
    expect(await screen.findByRole('main', { name: 'Carrier Commissions' })).toBeTruthy();
    expect(MONEY).toBeTruthy();
  });

  it('shows the notes that mention it, and keys in notes link to their tickets', async () => {
    const { user, view } = await showTicket('Remove map');

    await user.click(within(within(view).getByRole('region', { name: 'Mentioned in' })).getByRole('button', { name: 'Standup notes' }));
    const note = await screen.findByRole('main', { name: 'Standup notes' });
    await user.click(within(note).getByRole('link', { name: 'CAR-6163' }));

    expect(await screen.findByRole('main', { name: 'Remove map' })).toBeTruthy();
    expect(REMOVE_MAP).toBeTruthy();
  });

  it('saves the note as Markdown when it is edited', async () => {
    const { calls, user, view } = await showTicket('Onboarding wiki');

    await user.click(within(view).getByRole('button', { name: 'Add' }));
    await user.type(within(view).getByRole('textbox', { name: 'Note in Markdown' }), 'Hi');
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(appliedCommands(calls)).toEqual([{ type: 'setText', owner: { ticket: ONBOARDING }, text: 'Hi' }]),
    );
  });
});

describe('note view', () => {
  it('creates a ticket from a line of the note', async () => {
    const { calls, user } = await renderApp();
    await user.click(within(sidebar()).getByText('Standup notes'));
    const note = await screen.findByRole('main', { name: 'Standup notes' });

    await user.click(within(note).getByRole('button', { name: 'Edit' }));
    const editor = within(note).getByRole('textbox', { name: 'Note in Markdown' }) as HTMLTextAreaElement;
    editor.setSelectionRange(0, 0);
    fireEvent.click(within(note).getByRole('button', { name: 'Ticket from selection' }));

    await waitFor(() =>
      expect(appliedCommands(calls)[0]).toMatchObject({
        type: 'addTicket',
        place: { profile: TRABAJO },
        title: 'Yesterday: CAR-6163',
        status: null,
      }),
    );
    expect(STANDUP).toBeTruthy();
  });
});
