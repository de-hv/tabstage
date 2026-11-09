import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands, snapshotFixture } from './test/ipc';
import { renderApp, sidebar } from './test/render';

async function openSettings(handlers: Parameters<typeof renderApp>[0] = {}) {
  const rendered = await renderApp(handlers);
  await rendered.user.click(within(sidebar()).getByRole('button', { name: 'Settings' }));
  await screen.findByRole('heading', { name: 'Settings' });
  return rendered;
}

describe('settings', () => {
  it('goes back to a group from the sidebar', async () => {
    const { user } = await openSettings();

    await user.click(within(sidebar()).getByRole('button', { name: /Investigación/ }));

    expect(screen.getByRole('heading', { name: 'Investigación' })).toBeTruthy();
  });

  describe('profiles', () => {
    const WORK = '00000000-0000-0000-0000-0000000000c1';
    const PERSONAL = '00000000-0000-0000-0000-0000000000c2';
    const QA = '00000000-0000-0000-0000-0000000000c3';
    const card = (name: string) => screen.getByRole('article', { name: `Profile ${name}` });

    it('chooses the browser of a profile not configured here', async () => {
      const { calls, user } = await openSettings();

      expect(within(card('QA')).getByText('Not set up on this computer')).toBeTruthy();
      await user.selectOptions(within(card('QA')).getByRole('combobox', { name: 'Browser' }), 'Safari');

      expect(appliedCommands(calls)).toEqual([
        { type: 'bindProfile', profile: QA, browser: 'com.apple.Safari', browserProfile: null, newWindow: false },
      ]);
    });

    it('chooses a browser profile when the browser has them', async () => {
      const { calls, user } = await openSettings();

      const browserProfile = within(card('Trabajo')).getByRole('combobox', { name: 'Browser profile' });
      expect((browserProfile as HTMLSelectElement).value).toBe('Profile 1');
      await user.selectOptions(browserProfile, 'Personal');

      expect(appliedCommands(calls)).toEqual([
        { type: 'bindProfile', profile: WORK, browser: 'com.google.Chrome', browserProfile: 'Default', newWindow: true },
      ]);
    });

    it('explains when a browser shows no profiles', async () => {
      await openSettings();

      expect(within(card('Personal')).queryByRole('combobox', { name: 'Browser profile' })).toBeNull();
      expect(card('Personal').textContent).toContain('No Firefox profiles found on this computer.');
    });

    it('opens everything in a new window when asked', async () => {
      const { calls, user } = await openSettings();

      await user.click(within(card('Personal')).getByRole('checkbox', { name: 'Open all in a new window' }));

      expect(appliedCommands(calls)).toEqual([
        { type: 'bindProfile', profile: PERSONAL, browser: 'org.mozilla.firefox', browserProfile: null, newWindow: true },
      ]);
    });

    it('changes a profile color from its card', async () => {
      const { calls, user } = await openSettings();

      await user.click(within(card('QA')).getByRole('button', { name: 'Color of QA' }));
      await user.click(screen.getByRole('menuitemradio', { name: 'Lime' }));

      expect(appliedCommands(calls)).toEqual([{ type: 'setProfileColor', profile: QA, color: 6 }]);
    });

    it('renames a profile', async () => {
      const { calls, user } = await openSettings();

      const name = within(card('QA')).getByRole('textbox', { name: 'Name' });
      await user.clear(name);
      await user.type(name, 'Pruebas{Enter}');

      expect(appliedCommands(calls)).toEqual([{ type: 'renameProfile', profile: QA, name: 'Pruebas' }]);
    });

    it('asks where the groups go before removing a profile', async () => {
      const { calls, user } = await openSettings();

      await user.click(within(card('QA')).getByRole('button', { name: 'Delete profile' }));
      const dialog = screen.getByRole('alertdialog', { name: 'Delete the “QA” profile?' });
      await user.click(within(dialog).getByRole('radio', { name: 'Personal' }));
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      expect(appliedCommands(calls)).toEqual([{ type: 'removeProfile', profile: QA, moveGroupsTo: PERSONAL }]);
    });

    it('adds a profile', async () => {
      const { calls, user } = await openSettings();

      await user.type(screen.getByRole('textbox', { name: 'New profile' }), 'Cliente X{Enter}');

      expect(appliedCommands(calls)).toEqual([{ type: 'addProfile', name: 'Cliente X' }]);
    });
  });

  describe('data file', () => {
    it('says in plain words where the data lives', async () => {
      await openSettings();

      const card = screen.getByRole('region', { name: 'Where your data lives' });
      expect(card.textContent).toMatch(/On this (Mac|computer) only/);
      expect(card.textContent).toContain('Not shared with other computers.');
      expect(within(card).getByTitle('/Users/me/Library/Application Support/io.github.de-hv.tabstage/workspace.json')).toBeTruthy();
    });

    it('names the cloud service when the file is in one', async () => {
      await openSettings({
        snapshot: () => {
          const next = snapshotFixture();
          next.dataLocation = { kind: 'iCloudDrive', folder: '/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Tabstage' };
          return next;
        },
      });

      expect(screen.getByRole('region', { name: 'Where your data lives' }).textContent).toContain(
        'Synced through iCloud Drive',
      );
    });

    it('shows the data file in the file manager', async () => {
      const { calls, user } = await openSettings();

      await user.click(screen.getByRole('button', { name: /Show in (Finder|folder)/ }));

      expect(calls.map((call) => call.cmd)).toContain('reveal_data_file');
    });

    it('moves the data to an empty folder', async () => {
      const { calls, user } = await openSettings({ 'plugin:dialog|open': () => '/Users/me/Dropbox/Tabstage' });

      await user.click(screen.getByRole('button', { name: 'Move to a synced folder…' }));

      expect(calls.map((call) => call.cmd)).toEqual(
        expect.arrayContaining(['inspect_data_folder', 'relocate']),
      );
      expect(calls.find((call) => call.cmd === 'relocate')?.args).toEqual({
        folder: '/Users/me/Dropbox/Tabstage',
        mode: 'useExisting',
      });
    });

    it('does nothing when the folder picker is cancelled', async () => {
      const { calls, user } = await openSettings();

      await user.click(screen.getByRole('button', { name: 'Move to a synced folder…' }));

      expect(calls.map((call) => call.cmd)).not.toContain('inspect_data_folder');
    });

    it('asks what to do when the folder already has Tabstage data', async () => {
      const { calls, user } = await openSettings({
        'plugin:dialog|open': () => '/Users/me/Dropbox/Tabstage',
        inspect_data_folder: () => ({
          path: '/Users/me/Dropbox/Tabstage/workspace.json',
          exists: true,
          groups: 3,
          tabs: 20,
        }),
      });

      await user.click(screen.getByRole('button', { name: 'Move to a synced folder…' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'That folder already has Tabstage data' });
      expect(dialog.textContent).toContain('3 groups and 20 tabs');
      await user.click(within(dialog).getByRole('button', { name: "Replace with this computer's data" }));

      expect(calls.find((call) => call.cmd === 'relocate')?.args).toEqual({
        folder: '/Users/me/Dropbox/Tabstage',
        mode: 'replaceWithMine',
      });
    });
  });

  describe('statuses', () => {
    it('renames a status', async () => {
      const { calls, user } = await openSettings();

      const input = screen.getByRole('textbox', { name: 'Name of To do' });
      await user.clear(input);
      await user.type(input, 'Pendiente{Enter}');

      expect(appliedCommands(calls)).toEqual([{ type: 'renameStatus', status: 'todo', label: 'Pendiente' }]);
    });

    it('changes a status color', async () => {
      const { calls, user } = await openSettings();

      await user.click(screen.getByRole('button', { name: 'Color of To do' }));
      await user.click(screen.getByRole('menuitemradio', { name: 'Red' }));

      expect(appliedCommands(calls)).toEqual([{ type: 'setStatusColor', status: 'todo', color: 'red' }]);
    });

    it('moves statuses up and down', async () => {
      const { calls, user } = await openSettings();

      await user.click(screen.getByRole('button', { name: 'Move up In progress' }));
      await user.click(screen.getByRole('button', { name: 'Move down To do' }));

      expect(appliedCommands(calls)).toEqual([
        { type: 'moveStatus', status: 'in-progress', index: 0 },
        { type: 'moveStatus', status: 'todo', index: 1 },
      ]);
      expect((screen.getByRole('button', { name: 'Move up To do' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('adds a status', async () => {
      const { calls, user } = await openSettings();

      await user.type(screen.getByRole('textbox', { name: 'New status' }), 'Blocked{Enter}');

      expect(appliedCommands(calls)).toEqual([expect.objectContaining({ type: 'addStatus', label: 'Blocked' })]);
    });

    it('removes a status and moves its tabs to another one', async () => {
      const { calls, user } = await openSettings();

      await user.click(screen.getByRole('button', { name: 'Delete In dev' }));
      const dialog = screen.getByRole('alertdialog', { name: 'Delete the “In dev” status?' });
      await user.click(within(dialog).getByRole('radio', { name: 'Done' }));
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      expect(appliedCommands(calls)).toEqual([{ type: 'removeStatus', status: 'in-dev', replacement: 'done' }]);
    });
  });
});
