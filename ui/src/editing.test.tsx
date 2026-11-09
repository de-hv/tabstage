import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands } from './test/ipc';
import { GRAFANA_TAB, SPRINT, WORK, renderApp } from './test/render';

describe('row menus', () => {
  it('sets the status of a tab', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de Grafana · latencia API' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Done' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'setStatus', target: { tab: GRAFANA_TAB }, status: 'done' },
    ]);
  });

  it('marks the current status and can clear a folder status', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de la carpeta Sprint 42' }));
    expect(
      screen.getByRole('menuitemradio', { name: 'In progress' }).getAttribute('aria-checked'),
    ).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Sin estado' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'setStatus', target: { folder: SPRINT }, status: null },
    ]);
  });

  it('renames a tab in place', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de Grafana · latencia API' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renombrar' }));
    const input = screen.getByRole('textbox', { name: 'Nuevo nombre' });
    expect((input as HTMLInputElement).value).toBe('Grafana · latencia API');
    await user.clear(input);
    await user.type(input, 'Grafana{Enter}');

    expect(appliedCommands(calls)).toEqual([{ type: 'renameTab', tab: GRAFANA_TAB, title: 'Grafana' }]);
  });

  it('renames a folder', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de la carpeta Sprint 42' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renombrar' }));
    const input = screen.getByRole('textbox', { name: 'Nuevo nombre' });
    await user.clear(input);
    await user.type(input, 'Sprint 43{Enter}');

    expect(appliedCommands(calls)).toEqual([{ type: 'renameFolder', folder: SPRINT, name: 'Sprint 43' }]);
  });

  it('cancels a rename with Escape', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de la carpeta Sprint 42' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renombrar' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox', { name: 'Nuevo nombre' })).toBeNull();
    expect(appliedCommands(calls)).toEqual([]);
  });

  it('deletes a tab right away', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de Grafana · latencia API' }));
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'removeTab', tab: GRAFANA_TAB }]);
  });

  it('asks before deleting a folder with tabs', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de la carpeta Sprint 42' }));
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    const dialog = screen.getByRole('alertdialog', { name: '¿Eliminar «Sprint 42»?' });
    expect(dialog.textContent).toContain('Se eliminarán sus 2 tabs.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(appliedCommands(calls)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Opciones de la carpeta Sprint 42' }));
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'removeFolder', folder: SPRINT }]);
  });
});

describe('group menu', () => {
  it('renames the group', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones del grupo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renombrar' }));
    const input = screen.getByRole('textbox', { name: 'Nuevo nombre' });
    await user.clear(input);
    await user.type(input, 'Trabajo{Enter}');

    expect(appliedCommands(calls)).toEqual([{ type: 'renameGroup', group: WORK, name: 'Trabajo' }]);
  });

  it('asks before deleting the group and counts all its tabs', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones del grupo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar grupo' }));
    const dialog = screen.getByRole('alertdialog', { name: '¿Eliminar «Trabajo · Jira»?' });
    expect(dialog.textContent).toContain('Se eliminarán sus 5 tabs.');
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'removeGroup', group: WORK }]);
  });
});

describe('board view', () => {
  it('shows one tile per status with folders and tabs', async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Por estado' }));

    const tile = (name: string) => screen.getByRole('region', { name });
    expect(within(tile('In progress')).getByText('Sprint 42')).toBeTruthy();
    expect(within(tile('In review')).getByText('Incidentes')).toBeTruthy();
    expect(within(tile('To do')).getByText(/Grafana/)).toBeTruthy();
    expect(within(tile('Done')).getByText(/Runbook/)).toBeTruthy();
    expect(within(tile('Sin estado')).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Por estado' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('changes status from a tile', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Por estado' }));
    await user.click(screen.getByRole('button', { name: 'Opciones de Grafana · latencia API' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'In dev' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'setStatus', target: { tab: GRAFANA_TAB }, status: 'in-dev' },
    ]);
  });
});
