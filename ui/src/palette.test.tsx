import { emit } from '@tauri-apps/api/event';
import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WIKI_LINK, renderApp } from './test/render';

async function openPalette() {
  const rendered = await renderApp();
  await act(async () => {
    await emit('open-palette');
  });
  return { ...rendered, input: await screen.findByRole('combobox', { name: 'Search' }) };
}

describe('quick search', () => {
  it('opens from the global shortcut event and with Ctrl+K', async () => {
    const { input, user } = await openPalette();
    expect(document.activeElement).toBe(input);
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('combobox', { name: 'Search' })).toBeTruthy();
  });

  it('finds a ticket by key and shows it, with its status', async () => {
    const { input, user } = await openPalette();

    await user.type(input, 'CAR-6163');
    const option = await screen.findByRole('option', { name: /Remove map/ });
    expect(within(option).getByText('In review')).toBeTruthy();
    await user.click(option);

    expect(await screen.findByRole('main', { name: 'Remove map' })).toBeTruthy();
  });

  it('finds notes and opens links', async () => {
    const { calls, input, user } = await openPalette();

    await user.type(input, 'client wiki');
    await user.click(await screen.findByRole('option', { name: /Client wiki/ }));

    expect(calls).toContainEqual({ cmd: 'open_link', args: { link: WIKI_LINK } });
  });
});
