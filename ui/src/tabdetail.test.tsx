import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appError, appliedCommands } from './test/ipc';
import { GRAFANA_TAB, STATUS_TAB, clickMenuItem, renderApp, sidebar } from './test/render';

async function showTab(name: string, handlers: Parameters<typeof renderApp>[0] = {}) {
  const rendered = await renderApp(handlers);
  await rendered.user.click(within(sidebar()).getByRole('button', { name: `Expand ${'Trabajo · Jira'}` }));
  await rendered.user.click(within(sidebar()).getByRole('button', { name }));
  const detail = await screen.findByRole('main', { name });
  return { ...rendered, detail };
}

afterEach(() => vi.restoreAllMocks());

describe('tab detail', () => {
  it('shows the path, the full address and where it opens', async () => {
    const { detail } = await showTab('Grafana · latencia API');

    expect(within(detail).getByRole('navigation', { name: 'Path' }).textContent).toContain('Trabajo · Jira');
    expect(within(detail).getByText('https://grafana.example.com/d/api')).toBeTruthy();
    expect(within(detail).getByRole('button', { name: 'Open in Google Chrome' })).toBeTruthy();
  });

  it('opens the tab from its button', async () => {
    const { calls, detail, user } = await showTab('Grafana · latencia API');

    await user.click(within(detail).getByRole('button', { name: 'Open in Google Chrome' }));

    expect(calls).toContainEqual({ cmd: 'open_tab', args: { tab: GRAFANA_TAB } });
  });

  it('edits the address', async () => {
    const { calls, detail, user } = await showTab('Grafana · latencia API');

    await user.click(within(detail).getByRole('button', { name: 'Edit address' }));
    const field = within(detail).getByRole('textbox', { name: 'Address' });
    await user.clear(field);
    await user.type(field, 'https://grafana.example.com/d/db{Enter}');

    expect(appliedCommands(calls)).toEqual([
      { type: 'setTabUrl', tab: GRAFANA_TAB, url: 'https://grafana.example.com/d/db' },
    ]);
    await waitFor(() => expect(within(detail).queryByRole('textbox', { name: 'Address' })).toBeNull());
  });

  it('keeps the field open and explains an invalid address', async () => {
    const { detail, user } = await showTab('Grafana · latencia API', {
      apply: () => {
        throw appError('invalidUrl');
      },
    });

    await user.click(within(detail).getByRole('button', { name: 'Edit address' }));
    const field = within(detail).getByRole('textbox', { name: 'Address' });
    await user.clear(field);
    await user.type(field, 'grafana{Enter}');

    expect((await within(detail).findByRole('alert')).textContent).toContain('http:// or https://');
    expect((field as HTMLInputElement).value).toBe('grafana');
  });

  it('cancels editing the address with Escape without saving', async () => {
    const { calls, detail, user } = await showTab('Grafana · latencia API');

    await user.click(within(detail).getByRole('button', { name: 'Edit address' }));
    await user.keyboard('x{Escape}');

    expect(within(detail).queryByRole('textbox', { name: 'Address' })).toBeNull();
    expect(appliedCommands(calls)).toEqual([]);
  });

  it('copies the address', async () => {
    const { detail, user } = await showTab('Grafana · latencia API');
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await user.click(within(detail).getByRole('button', { name: 'Copy address' }));

    expect(writeText).toHaveBeenCalledWith('https://grafana.example.com/d/api');
    expect(await screen.findByText('Address copied')).toBeTruthy();
  });

  it('renames and deletes from its menu', async () => {
    const { calls, detail, user } = await showTab('Status page');

    await user.click(within(detail).getByRole('button', { name: 'Options for Status page' }));
    clickMenuItem('Rename');
    const input = await screen.findByRole('textbox', { name: 'New name' });
    await user.clear(input);
    await user.type(input, 'Status{Enter}');

    await user.click(within(detail).getByRole('button', { name: 'Options for Status page' }));
    clickMenuItem('Delete');

    expect(appliedCommands(calls)).toEqual([
      { type: 'renameTab', tab: STATUS_TAB, title: 'Status' },
      { type: 'removeTab', tab: STATUS_TAB },
    ]);
  });

  it('the path leads back to the group', async () => {
    const { detail, user } = await showTab('Grafana · latencia API');

    await user.click(within(within(detail).getByRole('navigation', { name: 'Path' })).getByRole('button', { name: 'Trabajo · Jira' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Trabajo · Jira' })).toBeTruthy());
  });

  it('a list row shows the detail on click and opens on double-click', async () => {
    const { calls, user } = await renderApp();
    await user.click(within(sidebar()).getByRole('button', { name: 'In TEST' }));
    const list = await screen.findByRole('main', { name: 'In TEST' });

    await user.click(within(list).getByRole('button', { name: /^Staging dashboard/ }));
    expect(await screen.findByRole('main', { name: 'Staging dashboard' })).toBeTruthy();

    await user.click(within(sidebar()).getByRole('button', { name: 'In TEST' }));
    await user.dblClick(within(await screen.findByRole('main', { name: 'In TEST' })).getByRole('button', { name: /^Staging dashboard/ }));
    expect(calls.some((call) => call.cmd === 'open_tab')).toBe(true);
  });
});
