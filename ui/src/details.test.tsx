import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands, snapshotFixture } from './test/ipc';
import { INCIDENTS, STATUS_TAB, TRABAJO, clickMenuItem, renderApp, rightClick, sidebar, treeRow } from './test/render';

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

  it('edits the note of a tab from its menu, in place, as Markdown', async () => {
    const { calls, user } = await renderApp();

    await rightClick('Status page');
    clickMenuItem('Edit note');
    const detail = await screen.findByRole('main', { name: 'Status page' });
    const editor = within(detail).getByRole('textbox', { name: 'Note in Markdown' });
    await waitFor(() => expect(document.activeElement).toBe(editor));
    await user.type(editor, 'Line 1{Enter}- [[ ] Step');
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(appliedCommands(calls)).toEqual([
        { type: 'setDetails', target: { tab: STATUS_TAB }, ticketId: '', note: 'Line 1\n- [ ] Step' },
      ]),
    );
    expect(within(detail).queryByRole('textbox', { name: 'Note in Markdown' })).toBeNull();
  });

  it('formats the selection from the toolbar', async () => {
    const { user } = await renderApp();
    await user.click(within(sidebar()).getByRole('button', { name: 'Status page' }));
    const detail = await screen.findByRole('main', { name: 'Status page' });

    await user.click(within(detail).getByRole('button', { name: 'Add' }));
    const editor = within(detail).getByRole('textbox', { name: 'Note in Markdown' }) as HTMLTextAreaElement;
    await user.type(editor, 'ship it');
    editor.setSelectionRange(0, 4);
    await user.click(within(detail).getByRole('button', { name: 'Bold' }));

    expect(editor.value).toBe('**ship** it');
  });

  it('renders the note and ticks a task box from the rendered view', async () => {
    const withTasks = () => {
      const snapshot = snapshotFixture();
      const work = snapshot.workspace.profiles[0]!.items[0]!;
      if (work.type !== 'group') throw new Error('fixture changed');
      const runbook = work.children.find((node) => node.id === RUNBOOK)!;
      runbook.note = '## Steps\n- [x] Deploy\n- [ ] Ping **#ops**\n\nSee [status](https://status.example.com)';
      return snapshot;
    };
    const { calls, user } = await renderApp({ snapshot: withTasks });
    await expandWork(user);
    await user.click(within(sidebar()).getByRole('button', { name: 'OPS-31 Runbook de despliegue' }));
    const detail = await screen.findByRole('main', { name: 'Runbook de despliegue' });

    expect(within(detail).getByRole('heading', { name: 'Steps' })).toBeTruthy();
    expect(within(detail).getByText('#ops').tagName).toBe('STRONG');
    await user.click(within(detail).getByRole('link', { name: 'status' }));
    expect(calls).toContainEqual({ cmd: 'open_url', args: { profile: TRABAJO, url: 'https://status.example.com' } });

    await user.click(within(detail).getByRole('checkbox', { name: 'Mark as done' }));
    expect(appliedCommands(calls)).toContainEqual({
      type: 'setDetails',
      target: { tab: RUNBOOK },
      ticketId: 'OPS-31',
      note: '## Steps\n- [x] Deploy\n- [x] Ping **#ops**\n\nSee [status](https://status.example.com)',
    });
    expect(within(detail).queryByRole('textbox', { name: 'Note in Markdown' })).toBeNull();
  });

  it('opens the ticket with the profile link and edits it in place from the pencil', async () => {
    const { calls, user } = await renderApp();
    await expandWork(user);
    await user.click(within(sidebar()).getByRole('button', { name: 'INC-77 Incidentes' }));
    const view = await screen.findByRole('main', { name: 'Incidentes' });

    const chip = within(view).getByRole('button', { name: 'Open ticket INC-77' });
    expect(chip.getAttribute('title')).toBe('https://jira.example.com/browse/INC-77');
    await user.click(chip);
    expect(calls).toContainEqual({ cmd: 'open_ticket', args: { target: { folder: INCIDENTS } } });

    await user.click(within(view).getByRole('button', { name: 'Edit ticket ID' }));
    const input = within(view).getByRole('textbox', { name: 'Ticket ID' });
    await user.clear(input);
    await user.type(input, ' INC-80 {Enter}');

    expect(appliedCommands(calls)).toEqual([
      { type: 'setDetails', target: { folder: INCIDENTS }, ticketId: 'INC-80', note: '' },
    ]);
  });

  it('adds a ticket with the T key and cancels with Escape', async () => {
    const { calls, user } = await renderApp();
    await user.click(within(sidebar()).getByRole('button', { name: 'Status page' }));
    const detail = await screen.findByRole('main', { name: 'Status page' });
    expect(within(detail).getByRole('button', { name: /Ticket/ })).toBeTruthy();

    await user.keyboard('t');
    await user.type(within(detail).getByRole('textbox', { name: 'Ticket ID' }), 'OPS-1{Escape}');
    expect(appliedCommands(calls)).toEqual([]);

    await user.keyboard('t');
    await user.type(within(detail).getByRole('textbox', { name: 'Ticket ID' }), 'OPS-1{Enter}');
    expect(appliedCommands(calls)).toEqual([
      { type: 'setDetails', target: { tab: STATUS_TAB }, ticketId: 'OPS-1', note: '' },
    ]);
  });
});

describe('note text size', () => {
  it('grows and shrinks within limits, resets, and is remembered', async () => {
    const { user } = await renderApp();
    await user.click(within(sidebar()).getByRole('button', { name: 'Status page' }));
    const note = within(await screen.findByRole('main', { name: 'Status page' })).getByRole('region', { name: 'Note' });
    const scale = () => note.style.getPropertyValue('--note-scale');
    expect(scale()).toBe('1');

    await user.click(within(note).getByRole('button', { name: 'Larger text' }));
    await user.click(within(note).getByRole('button', { name: 'Larger text' }));
    expect(scale()).toBe('1.2');
    expect(localStorage.getItem('tabstage.noteTextSize')).toBe('120');

    await user.click(within(note).getByRole('button', { name: 'Text size 120%, reset' }));
    expect(scale()).toBe('1');
    await user.click(within(note).getByRole('button', { name: 'Smaller text' }));
    expect(scale()).toBe('0.9');
    expect((within(note).getByRole('button', { name: 'Smaller text' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('changes with Cmd+= and Cmd+0 while editing', async () => {
    localStorage.setItem('tabstage.noteTextSize', '150');
    const { user } = await renderApp();
    await user.click(within(sidebar()).getByRole('button', { name: 'Status page' }));
    const note = within(await screen.findByRole('main', { name: 'Status page' })).getByRole('region', { name: 'Note' });
    expect(note.style.getPropertyValue('--note-scale')).toBe('1.5');

    await user.click(within(note).getByRole('button', { name: 'Add' }));
    await user.keyboard('{Meta>}={/Meta}');
    expect(note.style.getPropertyValue('--note-scale')).toBe('1.6');
    await user.keyboard('{Meta>}0{/Meta}');
    expect(note.style.getPropertyValue('--note-scale')).toBe('1');
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

  it('collapses to a rail and expands again, from the header and with the shortcut', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(localStorage.getItem('tabstage.sidebarCollapsed')).toBe('true');
    expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).toBeNull();
    expect(within(sidebar()).getByRole('button', { name: 'Trabajo · Jira' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('separator', { name: 'Resize sidebar' })).toBeTruthy();

    await user.keyboard('{Meta>}\\{/Meta}');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  });
});
