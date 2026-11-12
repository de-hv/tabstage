import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Snapshot } from './api/types';
import { appError, snapshotFixture } from './test/ipc';
import { renderApp, renderRaw } from './test/render';

describe('sidebar width', () => {
  it('resizes with the keyboard, within limits, and is remembered', async () => {
    await renderApp();
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(handle.getAttribute('aria-valuenow')).toBe('248');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle.getAttribute('aria-valuenow')).toBe('264');
    expect(localStorage.getItem('tabstage.sidebarWidth')).toBe('264');

    fireEvent.keyDown(handle, { key: 'End' });
    expect(handle.getAttribute('aria-valuenow')).toBe('480');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle.getAttribute('aria-valuenow')).toBe('480');
  });

  it('double-click goes back to the default width', async () => {
    localStorage.setItem('tabstage.sidebarWidth', '400');
    await renderApp();
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(handle.getAttribute('aria-valuenow')).toBe('400');

    fireEvent.doubleClick(handle);

    expect(handle.getAttribute('aria-valuenow')).toBe('248');
  });
});

describe('first run', () => {
  const firstRun = (): Snapshot => ({ ...snapshotFixture(), needsDataFile: true });

  it('asks where to save, with the default location chosen', async () => {
    const { calls, user } = renderRaw({ snapshot: firstRun, choose_data_file: () => snapshotFixture() });

    const dialog = await screen.findByRole('dialog', { name: 'Where should Tabstage save your data?' });
    expect(within(dialog).getByRole('radio', { name: /Default location/ })).toHaveProperty('checked', true);
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));

    expect(calls).toContainEqual({ cmd: 'choose_data_file', args: { folder: null } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('refuses a cloud folder and explains why', async () => {
    const { user } = renderRaw({
      snapshot: firstRun,
      'plugin:dialog|open': () => '/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Tabstage',
      choose_data_file: () => {
        throw appError('cloudFolder');
      },
    });

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Choose…' }));
    expect(await within(dialog).findByText(/CloudDocs\/Tabstage/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain('Pick a local folder');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
