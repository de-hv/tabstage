import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ImportPreview, Snapshot } from './api/types';
import { appliedCommands, snapshotFixture } from './test/ipc';
import { DONE, IN_TEST, REVIEW, chooseOption, renderApp, renderRaw } from './test/render';

async function openSettings() {
  const rendered = await renderApp();
  await rendered.user.click(screen.getByRole('button', { name: 'Settings' }));
  return { ...rendered, statuses: screen.getByRole('list', { name: 'Statuses' }) };
}

describe('statuses in settings', () => {
  it('lists the statuses with how many tickets have each', async () => {
    const { statuses } = await openSettings();

    const names = within(statuses)
      .getAllByRole('textbox')
      .map((input) => (input as HTMLInputElement).value);
    expect(names).toEqual(['In review', 'In TEST', 'Done']);
    expect(within(statuses).getAllByText(/tickets?$/).map((cell) => cell.textContent)).toEqual([
      '1 ticket',
      '2 tickets',
      '0 tickets',
    ]);
  });

  it('adds, renames and reorders statuses', async () => {
    const { calls, statuses, user } = await openSettings();

    await user.type(screen.getByRole('textbox', { name: 'New status' }), 'Blocked{Enter}');
    const name = within(statuses).getByRole('textbox', { name: 'Name of In review' });
    await user.clear(name);
    await user.type(name, 'Review{Enter}');
    await user.click(within(statuses).getByRole('button', { name: 'Move Done up' }));

    const commands = appliedCommands(calls);
    expect(commands[0]).toMatchObject({ type: 'addStatus', name: 'Blocked' });
    expect(commands.slice(1)).toEqual([
      { type: 'renameStatus', status: REVIEW, name: 'Review' },
      { type: 'moveStatus', status: DONE, index: 1 },
    ]);
  });

  it('deletes an unused status right away and asks first for one in use', async () => {
    const { calls, statuses, user } = await openSettings();

    await user.click(within(statuses).getByRole('button', { name: 'Delete status Done' }));
    await user.click(within(statuses).getByRole('button', { name: 'Delete status In TEST' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('2 tickets have it');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete status' }));

    await waitFor(() =>
      expect(appliedCommands(calls)).toEqual([
        { type: 'removeStatus', status: DONE },
        { type: 'removeStatus', status: IN_TEST },
      ]),
    );
  });

  it('opens from "Edit statuses…" in a ticket’s status picker', async () => {
    const { user } = await renderApp();
    await user.click(within(screen.getByRole('navigation', { name: 'Library' })).getByText('Remove map'));
    await chooseOption(screen.getByRole('combobox', { name: 'Status: In review' }), 'Edit statuses…');

    expect(await screen.findByRole('list', { name: 'Statuses' })).toBeTruthy();
  });
});

const preview = (roles: Record<string, string>): ImportPreview => {
  const workspace = snapshotFixture().workspace;
  return {
    path: '/Users/me/Library/Application Support/io.github.de-hv.tabstage/workspace.v4-backup.json',
    tree: {
      version: 4,
      profiles: [
        {
          id: 'p',
          name: 'Arrive Logistics',
          color: 12,
          items: [
            {
              id: 'g-stg',
              kind: 'group',
              name: 'In STG',
              children: [{ id: 't-1', kind: 'tab', name: 'CSUI Federated', key: 'CAR-6124', url: 'https://x.dev', children: [] }],
            },
          ],
        },
      ],
    },
    summary: { roles: { 'g-stg': 'status', 't-1': 'ticket', ...roles } as never, statuses: 1, tickets: 1, notes: 0, links: 0 },
    preview: { ...workspace, profiles: [workspace.profiles[0]!] },
  };
};

describe('import assistant', () => {
  const withBackup = (): Snapshot => ({ ...snapshotFixture(), legacyBackup: '/old/workspace.v4-backup.json' });

  it('opens by itself for data set aside at startup, previews choices and imports them', async () => {
    const { calls, user } = renderRaw({
      snapshot: withBackup,
      preview_import: (args) => preview(args.roles as Record<string, string>),
      import_legacy: () => snapshotFixture(),
    });

    const dialog = await screen.findByRole('dialog', { name: 'Bring in your previous data' });
    expect(await within(dialog).findByText('CSUI Federated')).toBeTruthy();
    expect(within(dialog).getByRole('combobox', { name: 'What In STG becomes' }).textContent).toBe('Status');

    await chooseOption(within(dialog).getByRole('combobox', { name: 'What In STG becomes' }), 'Note');
    await waitFor(() =>
      expect(calls.filter((call) => call.cmd === 'preview_import').at(-1)?.args).toEqual({
        path: null,
        roles: { 'g-stg': 'note' },
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(calls).toContainEqual({ cmd: 'import_legacy', args: { path: null, roles: { 'g-stg': 'note' } } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('can wait: the banner offers it again, and "Not now" stops offering', async () => {
    const { calls, user } = renderRaw({ snapshot: withBackup, preview_import: () => preview({}) });

    const dialog = await screen.findByRole('dialog', { name: 'Bring in your previous data' });
    await user.click(within(dialog).getByRole('button', { name: 'Later' }));
    await user.click(screen.getByRole('button', { name: 'Import them' }));
    expect(await screen.findByRole('dialog', { name: 'Bring in your previous data' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Not now' }));

    expect(calls.map((call) => call.cmd)).toContain('dismiss_import');
  });
});
