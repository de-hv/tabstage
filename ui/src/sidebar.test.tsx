import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { appliedCommands, snapshotFixture } from './test/ipc';
import {
  CARRIER,
  DONE,
  IN_TEST,
  MONEY,
  ONBOARDING,
  REMOVE_MAP,
  REVIEW,
  STANDUP,
  TRABAJO,
  clickMenuItem,
  drag,
  dragAt,
  renderApp,
  openRowMenu,
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

  it('leaves rows uncolored, with the status in the tooltip', async () => {
    await renderApp();

    const row = treeRow('Carrier Commissions');
    expect(row.hasAttribute('data-lane')).toBe(false);
    expect(within(row).getByRole('button', { name: 'CAR-5899 Carrier Commissions' }).getAttribute('title')).toContain(
      'Status: In TEST',
    );
  });

  it('shows a sub-ticket’s status only when it differs from its parent’s', async () => {
    const withChildren = () => {
      const snapshot = snapshotFixture();
      const carrier = snapshot.workspace.profiles[0]!.tickets.find((ticket) => ticket.id === CARRIER)!;
      carrier.children = [
        ...(carrier.children ?? []),
        { id: '00000000-0000-0000-0000-00000000a003', title: 'Reviewed child', status: REVIEW },
        { id: '00000000-0000-0000-0000-00000000a004', title: 'Unsorted child' },
      ];
      return snapshot;
    };
    const { user } = await renderApp({ snapshot: withChildren });
    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Carrier Commissions' }));

    expect(treeRow('Carrier Commissions').querySelector('.tree-row__status')).toBeNull();
    expect(treeRow('Money card').querySelector('.tree-row__status')).toBeNull();
    expect(treeRow('Reviewed child').querySelector('.tree-row__status')?.textContent).toBe('In review');
    expect(treeRow('Unsorted child').querySelector('.tree-row__status')?.textContent).toBe('No status');
  });

  it('expands a ticket to its sub-tickets', async () => {
    const { user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Carrier Commissions' }));
    expect(treeRow('Money card')).toBeTruthy();
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

    await openRowMenu('Trabajo');
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

    await openRowMenu('Onboarding wiki');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Done' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'setTicketStatus', ticket: ONBOARDING, status: DONE }]);
  });

  it('makes a ticket a sub-ticket of another from its menu', async () => {
    const { calls } = await renderApp();

    await openRowMenu('Remove map');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make sub-ticket of' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'CAR-5899 Carrier Commissions' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTicket', ticket: REMOVE_MAP, place: { ticket: CARRIER }, index: 1, lane: { status: IN_TEST } },
    ]);
  });

  it('asks before deleting a ticket with sub-tickets', async () => {
    const { calls } = await renderApp();

    await openRowMenu('Carrier Commissions');
    clickMenuItem('Delete…');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('its 1 sub-ticket');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(appliedCommands(calls)).toEqual([{ type: 'removeTicket', ticket: CARRIER }]));
    expect(IN_TEST && MONEY && STANDUP).toBeTruthy();
  });
});

describe('lanes: collapsing and reordering statuses', () => {
  it('collapses and expands a lane with a click on its status pill', async () => {
    const { user } = await renderApp();
    const toggle = within(lane('In TEST')).getByRole('button', { name: 'Collapse In TEST' });

    await user.click(toggle);
    expect(within(lane('In TEST')).queryByRole('button', { name: 'CAR-5899 Carrier Commissions' })).toBeNull();
    expect(within(lane('In TEST')).getByRole('button', { name: 'Expand In TEST' }).getAttribute('aria-expanded')).toBe('false');
    expect(lane('In TEST').querySelector('.status-pill')?.hasAttribute('data-collapsed')).toBe(true);

    await user.click(within(lane('In TEST')).getByRole('button', { name: 'Expand In TEST' }));
    expect(within(lane('In TEST')).getByRole('button', { name: 'CAR-5899 Carrier Commissions' })).toBeTruthy();
  });

  it('reorders statuses by dragging a lane head before or after another', async () => {
    const { calls } = await renderApp();
    const head = (name: string) => lane(name).querySelector<HTMLElement>('.lane__head')!;

    dragAt(head('In TEST'), head('In review'), 4, 24);
    dragAt(head('In review'), head('No status'), 4, 24);

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveStatus', status: IN_TEST, index: 0 },
      { type: 'moveStatus', status: REVIEW, index: 2 },
    ]);
  });
});

describe('tickets: menu, nesting by drag, type and link', () => {
  it('opens a row’s menu only from its ⋯ button, not with a right-click', async () => {
    await renderApp();

    fireEvent.contextMenu(treeRow('Carrier Commissions'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(await openRowMenu('Carrier Commissions')).toBeTruthy();
  });

  it('makes a ticket a sub-ticket when dropped on another ticket’s body', async () => {
    const { calls } = await renderApp();

    dragAt(treeRow('Remove map'), treeRow('Carrier Commissions'), 14);

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTicket', ticket: REMOVE_MAP, place: { ticket: CARRIER }, index: 1, lane: { status: IN_TEST } },
    ]);
  });

  it('reorders sub-tickets within their parent by their top and bottom edges', async () => {
    const third = '00000000-0000-0000-0000-00000000a002';
    const withChildren = () => {
      const snapshot = snapshotFixture();
      const carrier = snapshot.workspace.profiles[0]!.tickets.find((ticket) => ticket.id === CARRIER)!;
      carrier.children = [...(carrier.children ?? []), { id: third, title: 'Third child', kind: 'bug' }];
      return snapshot;
    };
    const { calls, user } = await renderApp({ snapshot: withChildren, apply: withChildren });
    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Carrier Commissions' }));

    dragAt(treeRow('Third child'), treeRow('Money card'), 3);
    dragAt(treeRow('Third child'), treeRow('Money card'), 14);
    dragAt(treeRow('Money card'), treeRow('Third child'), 25);

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTicket', ticket: third, place: { ticket: CARRIER }, index: 0 },
      { type: 'moveTicket', ticket: third, place: { ticket: CARRIER }, index: 0 },
      { type: 'moveTicket', ticket: MONEY, place: { ticket: CARRIER }, index: 1 },
    ]);
    expect(treeRow('Money card').querySelector('.tree-row__grip')).toBeTruthy();
  });

  it('places a ticket next to another when dropped on its top or bottom edge', async () => {
    const { calls } = await renderApp();

    dragAt(treeRow('Remove map'), treeRow('Carrier Commissions'), 7);

    expect(appliedCommands(calls)).toEqual([
      expect.objectContaining({ type: 'moveTicket', ticket: REMOVE_MAP, place: { profile: TRABAJO }, lane: { status: IN_TEST } }),
    ]);
  });

  it('changes a ticket’s type from its menu', async () => {
    const { calls } = await renderApp();
    const user = (await import('@testing-library/user-event')).default.setup();

    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Carrier Commissions' }));
    await openRowMenu('Money card');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Type' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Task' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'setTicketKind', ticket: MONEY, kind: 'task' }]);
  });

  it('copies a ticket’s link from its menu', async () => {
    await renderApp();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await openRowMenu('Carrier Commissions');
    clickMenuItem('Copy link');

    expect(writeText).toHaveBeenCalledWith('https://jira.example.com/browse/CAR-5899');
  });
});

describe('colors', () => {
  it('sets a custom color from its hex code', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Color of Trabajo' }));
    await user.type(await screen.findByRole('textbox', { name: 'Custom color as hex' }), 'FF6A3D{Enter}');

    expect(appliedCommands(calls)).toEqual([{ type: 'setProfileColor', profile: TRABAJO, color: '#ff6a3d' }]);
  });
});
