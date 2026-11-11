import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands } from './test/ipc';
import { INCIDENTS, IN_TEST, STATUS_TAB, clickMenuItem, renderApp, rightClick, sidebar, treeRow } from './test/render';

const RUNBOOK = '00000000-0000-0000-0000-000000000b05';

async function expandWork(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await user.click(within(sidebar()).getByRole('button', { name: 'Expand Trabajo · Jira' }));
}

describe('ticket id and note', () => {
  it('shows the ticket before the name and the note as a tooltip in the sidebar', async () => {
    const { user } = await renderApp();
    await expandWork(user);

    const row = treeRow('Runbook de despliegue');
    expect(within(row).getByText('OPS-31').className).toBe('ticket');
    expect(within(row).getByRole('button', { name: 'OPS-31 Runbook de despliegue' })).toBeTruthy();
    const note = within(row).getByRole('img', { name: /^Note: Run after the deploy window/ });
    expect(note.getAttribute('title')).toBe('Run after the deploy window\nPing #ops when done');

    expect(within(treeRow('Incidentes')).getByText('INC-77')).toBeTruthy();
    expect(within(treeRow('Incidentes')).queryByRole('img', { name: /^Note/ })).toBeNull();
  });

  it('edits the ticket id and a multi-line note of a tab from its menu', async () => {
    const { calls, user } = await renderApp();

    await rightClick('Status page');
    clickMenuItem('Edit details…');
    const dialog = await screen.findByRole('dialog', { name: 'Tab details' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Ticket ID (optional)' }), 'OPS-1');
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Line 1{Enter}Line 2');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(appliedCommands(calls)).toEqual([
      { type: 'setDetails', target: { tab: STATUS_TAB }, ticketId: 'OPS-1', note: 'Line 1\nLine 2' },
    ]);
  });

  it('renames too when the name changed, and clears emptied fields', async () => {
    const { calls, user } = await renderApp();
    await expandWork(user);

    await rightClick('Incidentes');
    clickMenuItem('Edit details…');
    const dialog = await screen.findByRole('dialog', { name: 'Folder details' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Incidents');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Ticket ID (optional)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(appliedCommands(calls)).toEqual([
        { type: 'renameFolder', folder: INCIDENTS, name: 'Incidents' },
        { type: 'setDetails', target: { folder: INCIDENTS }, ticketId: '', note: '' },
      ]),
    );
  });

  it('asks for a name instead of saving an empty group name', async () => {
    const { calls, user } = await renderApp();

    await rightClick('In TEST');
    clickMenuItem('Edit details…');
    const dialog = await screen.findByRole('dialog', { name: 'Group details' });
    await user.clear(within(dialog).getByRole('textbox', { name: 'Name' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(within(dialog).getByRole('alert').textContent).toBe('Enter a name');
    expect(appliedCommands(calls)).toEqual([]);
    expect(IN_TEST).toBeTruthy();
  });

  it('shows the ticket and note on the tab detail and edits them from there', async () => {
    const { user } = await renderApp();
    await expandWork(user);

    await user.click(within(sidebar()).getByRole('button', { name: 'OPS-31 Runbook de despliegue' }));
    const detail = await screen.findByRole('main', { name: 'Runbook de despliegue' });
    const summary = within(detail).getByRole('region', { name: 'Details' });
    expect(within(summary).getByText('OPS-31')).toBeTruthy();
    expect(within(summary).getByText(/Ping #ops when done/)).toBeTruthy();

    await user.click(within(summary).getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tab details' });
    expect((within(dialog).getByRole('textbox', { name: 'Ticket ID (optional)' }) as HTMLInputElement).value).toBe(
      'OPS-31',
    );
    expect(RUNBOOK).toBeTruthy();
  });
});

describe('sidebar look', () => {
  it('shows indent guides by default and turns them off in settings', async () => {
    const { user } = await renderApp();
    expect(sidebar().getAttribute('data-guides')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const toggle = screen.getByRole('checkbox', { name: 'Show indent guides' });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    await user.click(toggle);

    expect(sidebar().hasAttribute('data-guides')).toBe(false);
    expect(localStorage.getItem('tabstage.indentGuides')).toBe('false');
  });

  it('switches compact mode from a profile menu and from settings', async () => {
    const { user } = await renderApp();
    expect(sidebar().hasAttribute('data-compact')).toBe(false);

    await rightClick('Trabajo');
    clickMenuItem('Compact sidebar');
    expect(sidebar().getAttribute('data-compact')).toBe('true');
    expect(localStorage.getItem('tabstage.sidebarCompact')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const toggle = screen.getByRole('checkbox', { name: 'Compact sidebar' });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    await user.click(toggle);
    expect(sidebar().hasAttribute('data-compact')).toBe(false);
  });
});
