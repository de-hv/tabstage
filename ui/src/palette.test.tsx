import { emit } from '@tauri-apps/api/event';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SPRINT, renderApp } from './test/render';

const CACHE_TAB = '00000000-0000-0000-0000-000000000b02';

async function openWithEvent() {
  const rendered = await renderApp();
  await act(async () => {
    await emit('open-palette');
  });
  return { ...rendered, input: await screen.findByRole('combobox', { name: 'Buscar tabs' }) };
}

describe('quick search', () => {
  it('opens from the global shortcut event with the search focused', async () => {
    const { input } = await openWithEvent();

    expect(document.activeElement).toBe(input);
  });

  it('opens with Ctrl+K inside the window', async () => {
    const { user } = await renderApp();

    await user.keyboard('{Control>}k{/Control}');

    expect(await screen.findByRole('combobox', { name: 'Buscar tabs' })).toBeTruthy();
  });

  it('finds tabs from every group and opens the chosen one', async () => {
    const { calls, input, user } = await openWithEvent();

    await user.type(input, 'cache');
    expect(screen.getByRole('option', { name: /PROJ-1190 · Cache de sesiones/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /HTTP caching · MDN/ })).toBeTruthy();
    await user.click(screen.getByRole('option', { name: /PROJ-1190/ }));

    expect(calls).toContainEqual({ cmd: 'open_tab', args: { tab: CACHE_TAB } });
    expect(screen.queryByRole('combobox', { name: 'Buscar tabs' })).toBeNull();
  });

  it('shows the group and the browser each result opens in', async () => {
    const { input, user } = await openWithEvent();

    await user.type(input, 'MDN');

    const option = screen.getByRole('option', { name: /HTTP caching/ });
    expect(option.textContent).toContain('Investigación');
    expect(option.textContent).toContain('Firefox');
  });

  it('opens a whole folder', async () => {
    const { calls, input, user } = await openWithEvent();

    await user.type(input, 'Sprint');
    await user.click(screen.getByRole('option', { name: /Carpeta Sprint 42/ }));

    expect(calls).toContainEqual({ cmd: 'open_folder', args: { folder: SPRINT } });
  });

  it('closes with Escape', async () => {
    const { user } = await openWithEvent();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('combobox', { name: 'Buscar tabs' })).toBeNull();
  });
});
