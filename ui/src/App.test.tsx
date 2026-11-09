import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appError, appliedCommands, snapshotFixture } from './test/ipc';
import { LOGIN_TAB, SPRINT, WORK, renderApp, sidebar } from './test/render';

describe('App', () => {
  describe('group list', () => {
    it('lists every group and opens the first one', async () => {
      await renderApp();

      const groups = within(sidebar()).getAllByRole('button', { name: /^(Trabajo|Investigación|Docs)/ });
      expect(groups.map((group) => group.textContent)).toEqual([
        expect.stringContaining('Trabajo · Jira'),
        expect.stringContaining('Investigación'),
        expect.stringContaining('Docs Rust'),
      ]);
      expect(screen.getByText('Sprint 42')).toBeTruthy();
      expect(screen.getByText('PROJ-1182 · Refactor del login')).toBeTruthy();
    });

    it('hides the tabs of a collapsed folder', async () => {
      await renderApp();

      expect(screen.getByText('Incidentes')).toBeTruthy();
      expect(screen.queryByText('Incidente 77')).toBeNull();
    });

    it('shows the folder status for the folder and the own status for loose tabs', async () => {
      await renderApp();

      const sprint = screen.getByRole('button', { name: 'Contraer Sprint 42' }).closest('li');
      expect(within(sprint as HTMLElement).getAllByText('In progress')).toHaveLength(1);
      const grafana = screen.getByRole('button', { name: /^Grafana/ });
      expect(within(grafana).getByText('To do')).toBeTruthy();
    });

    it('switches group from the sidebar', async () => {
      const { user } = await renderApp();

      await user.click(within(sidebar()).getByRole('button', { name: /Investigación/ }));

      expect(screen.getByRole('heading', { name: 'Investigación' })).toBeTruthy();
      expect(screen.getByText('HTTP caching · MDN')).toBeTruthy();
    });
  });

  describe('browser per group', () => {
    it('shows the assigned browser or the default one', async () => {
      const { user } = await renderApp();

      expect(screen.getByRole('button', { name: 'Navegador del grupo: Google Chrome' })).toBeTruthy();
      await user.click(within(sidebar()).getByRole('button', { name: /Investigación/ }));
      expect(
        screen.getByRole('button', { name: 'Navegador del grupo: Por defecto (Firefox)' }),
      ).toBeTruthy();
    });

    it('warns when the group browser is not installed here', async () => {
      const { user } = await renderApp();

      await user.click(within(sidebar()).getByRole('button', { name: /Docs Rust/ }));

      expect(screen.getByRole('note').textContent).toContain(
        'El navegador de este grupo no está instalado en este equipo. Se usa Firefox.',
      );
    });

    it('assigns a specific browser or goes back to the default', async () => {
      const { calls, user } = await renderApp();

      await user.click(screen.getByRole('button', { name: /Navegador del grupo/ }));
      await user.click(screen.getByRole('menuitemradio', { name: 'Safari' }));
      await user.click(screen.getByRole('button', { name: /Navegador del grupo/ }));
      await user.click(screen.getByRole('menuitemradio', { name: 'Por defecto (Firefox)' }));

      expect(appliedCommands(calls)).toEqual([
        { type: 'setGroupBrowser', group: WORK, browser: { kind: 'specific', browser: 'com.apple.Safari' } },
        { type: 'setGroupBrowser', group: WORK, browser: { kind: 'default' } },
      ]);
    });

    it('marks the current choice in the picker', async () => {
      const { user } = await renderApp();

      await user.click(screen.getByRole('button', { name: /Navegador del grupo/ }));

      expect(
        screen.getByRole('menuitemradio', { name: 'Google Chrome' }).getAttribute('aria-checked'),
      ).toBe('true');
    });
  });

  describe('opening tabs', () => {
    it('opens a tab in its group browser', async () => {
      const { calls, user } = await renderApp();

      await user.click(screen.getByRole('button', { name: /^PROJ-1182/ }));

      expect(calls).toContainEqual({ cmd: 'open_tab', args: { tab: LOGIN_TAB } });
    });

    it('says when an open tab was focused instead of opened again', async () => {
      const { user } = await renderApp({ open_tab: () => 'focusedExisting' });

      await user.click(screen.getByRole('button', { name: /^PROJ-1182/ }));

      expect(
        await within(screen.getByRole('status')).findByText('Ya estaba abierto en Google Chrome'),
      ).toBeTruthy();
    });

    it('opens the whole group', async () => {
      const { calls, user } = await renderApp();

      await user.click(screen.getByRole('button', { name: 'Abrir todo' }));

      expect(calls).toContainEqual({ cmd: 'open_group', args: { group: WORK } });
    });
  });

  describe('editing', () => {
    it('adds a group from the sidebar', async () => {
      const { calls, user } = await renderApp();

      await user.click(screen.getByRole('button', { name: 'Nuevo grupo' }));
      await user.type(screen.getByRole('textbox', { name: 'Nombre del grupo' }), 'Personal{Enter}');

      expect(appliedCommands(calls)).toEqual([
        expect.objectContaining({ type: 'addGroup', name: 'Personal' }),
      ]);
    });

    it('opens the new group after adding it', async () => {
      const { user } = await renderApp({
        apply: () => {
          const next = snapshotFixture();
          next.workspace.groups.push({
            id: '00000000-0000-0000-0000-0000000000a9',
            name: 'Personal',
            color: 'green',
            browser: { kind: 'default' },
            children: [],
          });
          return next;
        },
      });

      await user.click(screen.getByRole('button', { name: 'Nuevo grupo' }));
      await user.type(screen.getByRole('textbox', { name: 'Nombre del grupo' }), 'Personal{Enter}');

      expect(await screen.findByRole('heading', { name: 'Personal' })).toBeTruthy();
    });

    it('adds a tab to the open group', async () => {
      const { calls, user } = await renderApp();

      await user.click(screen.getByRole('button', { name: 'Agregar tab' }));
      await user.type(screen.getByRole('textbox', { name: 'URL' }), 'https://a.dev{Enter}');

      expect(appliedCommands(calls)).toEqual([
        { type: 'addTab', place: { group: WORK }, url: 'https://a.dev', title: '' },
      ]);
    });

    it('explains an invalid URL and keeps the form open', async () => {
      const { user } = await renderApp({
        apply: () => {
          throw appError('invalidUrl', 'invalid url: relative URL without a base');
        },
      });

      await user.click(screen.getByRole('button', { name: 'Agregar tab' }));
      await user.type(screen.getByRole('textbox', { name: 'URL' }), 'a.dev{Enter}');

      expect((await screen.findByRole('alert')).textContent).toBe(
        'Escribe una dirección web que empiece por http:// o https://',
      );
      expect(screen.getByRole('textbox', { name: 'URL' })).toBeTruthy();
    });

    it('collapses a folder', async () => {
      const { calls, user } = await renderApp();

      const toggle = screen.getByRole('button', { name: 'Contraer Sprint 42' });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      await user.click(toggle);

      expect(appliedCommands(calls)).toEqual([
        { type: 'setFolderCollapsed', folder: SPRINT, collapsed: true },
      ]);
    });
  });

  describe('sync with other devices', () => {
    it('offers to reload or keep local data on a conflict', async () => {
      const { calls, user } = await renderApp({
        apply: () => {
          throw appError('conflict');
        },
      });

      await user.click(screen.getByRole('button', { name: 'Contraer Sprint 42' }));
      const banner = await screen.findByRole('alert');
      expect(banner.textContent).toContain('Los datos cambiaron en otro equipo');

      await user.click(within(banner).getByRole('button', { name: 'Cargar cambios' }));
      expect(calls.map((call) => call.cmd)).toContain('reload');
    });

    it('keeps local data when asked', async () => {
      const { calls, user } = await renderApp({
        apply: () => {
          throw appError('conflict');
        },
      });

      await user.click(screen.getByRole('button', { name: 'Contraer Sprint 42' }));
      await user.click(await screen.findByRole('button', { name: 'Mantener los míos' }));

      expect(calls.map((call) => call.cmd)).toContain('force_save');
    });

    it('reloads on focus when the file changed elsewhere', async () => {
      const { calls } = await renderApp({ has_external_change: () => true });

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      expect(calls.map((call) => call.cmd)).toEqual(
        expect.arrayContaining(['has_external_change', 'reload']),
      );
    });
  });
});
