import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands } from './test/ipc';
import { renderApp, sidebar } from './test/render';

async function openSettings(handlers: Parameters<typeof renderApp>[0] = {}) {
  const rendered = await renderApp(handlers);
  await rendered.user.click(within(sidebar()).getByRole('button', { name: 'Ajustes' }));
  await screen.findByRole('heading', { name: 'Ajustes' });
  return rendered;
}

describe('settings', () => {
  it('goes back to a group from the sidebar', async () => {
    const { user } = await openSettings();

    await user.click(within(sidebar()).getByRole('button', { name: /Investigación/ }));

    expect(screen.getByRole('heading', { name: 'Investigación' })).toBeTruthy();
  });

  describe('default browser', () => {
    it('marks the current default and changes it', async () => {
      const { calls, user } = await openSettings();

      const group = screen.getByRole('radiogroup', { name: 'Navegador por defecto' });
      expect((within(group).getByRole('radio', { name: 'Firefox' }) as HTMLInputElement).checked).toBe(true);
      await user.click(within(group).getByRole('radio', { name: 'Safari' }));

      expect(appliedCommands(calls)).toEqual([{ type: 'setDefaultBrowser', browser: 'com.apple.Safari' }]);
    });
  });

  describe('data file', () => {
    it('shows where the data lives', async () => {
      await openSettings();

      expect(
        screen.getByText('/Users/me/Library/Application Support/io.github.de-hv.tabstage/workspace.json'),
      ).toBeTruthy();
    });

    it('moves the data to an empty folder', async () => {
      const { calls, user } = await openSettings({ 'plugin:dialog|open': () => '/Users/me/Dropbox/Tabstage' });

      await user.click(screen.getByRole('button', { name: 'Cambiar ubicación…' }));

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

      await user.click(screen.getByRole('button', { name: 'Cambiar ubicación…' }));

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

      await user.click(screen.getByRole('button', { name: 'Cambiar ubicación…' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Ya hay datos de Tabstage en esa carpeta' });
      expect(dialog.textContent).toContain('3 grupos y 20 tabs');
      await user.click(within(dialog).getByRole('button', { name: 'Reemplazar con los de este equipo' }));

      expect(calls.find((call) => call.cmd === 'relocate')?.args).toEqual({
        folder: '/Users/me/Dropbox/Tabstage',
        mode: 'replaceWithMine',
      });
    });
  });

  describe('statuses', () => {
    it('renames a status', async () => {
      const { calls, user } = await openSettings();

      const input = screen.getByRole('textbox', { name: 'Nombre de To do' });
      await user.clear(input);
      await user.type(input, 'Pendiente{Enter}');

      expect(appliedCommands(calls)).toEqual([{ type: 'renameStatus', status: 'todo', label: 'Pendiente' }]);
    });

    it('changes a status color', async () => {
      const { calls, user } = await openSettings();

      await user.click(screen.getByRole('button', { name: 'Color de To do' }));
      await user.click(screen.getByRole('menuitemradio', { name: 'Rojo' }));

      expect(appliedCommands(calls)).toEqual([{ type: 'setStatusColor', status: 'todo', color: 'red' }]);
    });

    it('moves statuses up and down', async () => {
      const { calls, user } = await openSettings();

      await user.click(screen.getByRole('button', { name: 'Subir In progress' }));
      await user.click(screen.getByRole('button', { name: 'Bajar To do' }));

      expect(appliedCommands(calls)).toEqual([
        { type: 'moveStatus', status: 'in-progress', index: 0 },
        { type: 'moveStatus', status: 'todo', index: 1 },
      ]);
      expect((screen.getByRole('button', { name: 'Subir To do' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('adds a status', async () => {
      const { calls, user } = await openSettings();

      await user.type(screen.getByRole('textbox', { name: 'Nuevo estado' }), 'Blocked{Enter}');

      expect(appliedCommands(calls)).toEqual([expect.objectContaining({ type: 'addStatus', label: 'Blocked' })]);
    });

    it('removes a status and moves its tabs to another one', async () => {
      const { calls, user } = await openSettings();

      await user.click(screen.getByRole('button', { name: 'Eliminar In dev' }));
      const dialog = screen.getByRole('alertdialog', { name: '¿Eliminar el estado «In dev»?' });
      await user.click(within(dialog).getByRole('radio', { name: 'Done' }));
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

      expect(appliedCommands(calls)).toEqual([{ type: 'removeStatus', status: 'in-dev', replacement: 'done' }]);
    });
  });
});
