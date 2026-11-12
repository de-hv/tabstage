import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands, snapshotFixture } from './test/ipc';
import { PERSONAL, QA, TRABAJO, clickMenuItem, renderApp, rightClick } from './test/render';

async function openSettings() {
  const rendered = await renderApp();
  await rendered.user.click(screen.getByRole('button', { name: 'Settings' }));
  return rendered;
}

describe('settings', () => {
  it('chooses the browser of a profile, or the system browser', async () => {
    const { calls, user } = await openSettings();

    const select = screen.getByRole('combobox', { name: 'Browser for QA' });
    expect((select as HTMLSelectElement).value).toBe('');
    await user.selectOptions(select, 'com.apple.Safari');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Browser for Trabajo' }), '');

    expect(appliedCommands(calls)).toEqual([
      { type: 'bindProfile', profile: QA, browser: 'com.apple.Safari' },
      { type: 'bindProfile', profile: TRABAJO, browser: null },
    ]);
  });

  it('has no browser-profile options', async () => {
    await openSettings();

    expect(screen.queryByRole('combobox', { name: /Browser profile/ })).toBeNull();
    expect(screen.queryByText(/new window/i)).toBeNull();
  });

  it('"Choose browser…" from the sidebar focuses that profile', async () => {
    await renderApp();

    await rightClick('Personal');
    clickMenuItem('Choose browser…');

    const card = await screen.findByRole('article', { name: 'Profile Personal' });
    expect(card.getAttribute('data-focused')).toBe('true');
    expect(PERSONAL).toBeTruthy();
  });

  it('turns sidebar URLs on and off', async () => {
    const { user } = await openSettings();

    const toggle = screen.getByRole('checkbox', { name: 'Show addresses under links in the sidebar' });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    await user.click(toggle);

    expect(localStorage.getItem('tabstage.sidebarUrls')).toBe('true');
    expect((toggle as HTMLInputElement).checked).toBe(true);
  });

  it('describes the local data file and offers to move it', async () => {
    await openSettings();

    const section = screen.getByRole('region', { name: 'Where your data lives' });
    expect(section.textContent).toContain('A local file. Changes save instantly.');
    expect(within(section).getByRole('button', { name: 'Move to another folder…' })).toBeTruthy();
    expect(section.textContent).not.toContain('Synced');
  });

  it('warns when an old config still points at a cloud folder', async () => {
    const { user } = await renderApp({
      snapshot: () => ({
        ...snapshotFixture(),
        dataLocation: { kind: 'dropbox', folder: '/Users/me/Dropbox/Tabstage' },
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Settings' }));

    const section = screen.getByRole('region', { name: 'Where your data lives' });
    expect(section.textContent).toContain('Cloud folders are no longer supported');
  });

  it('shows the data file in Finder', async () => {
    const { calls, user } = await openSettings();

    await user.click(screen.getByRole('button', { name: /Show in/ }));

    expect(calls.some((call) => call.cmd === 'reveal_data_file')).toBe(true);
  });
});
