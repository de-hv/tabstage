import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands } from './test/ipc';
import { IN_TEST, ONBOARDING, STATUS_TAB, clickMenuItem, renderApp, rightClick, sidebar } from './test/render';

async function openPicker(name: string) {
  fireEvent.click(within(sidebar()).getByRole('button', { name: `Icon of ${name}` }));
  return screen.findByRole('dialog', { name: `Icon of ${name}` });
}

describe('custom icons', () => {
  it('shows custom icons and the default of each kind', async () => {
    await renderApp();

    const inTest = within(sidebar()).getByRole('button', { name: 'Icon of In TEST' });
    expect(inTest.textContent).toBe('🧪');
    const onboarding = within(sidebar()).getByRole('button', { name: 'Icon of Onboarding' });
    expect(onboarding.querySelector('svg')).toBeTruthy();
  });

  it('picks an emoji by searching', async () => {
    const { calls, user } = await renderApp();

    const picker = await openPicker('Onboarding');
    await user.type(within(picker).getByRole('textbox', { name: 'Search emoji' }), 'rocket');
    await user.click(await within(picker).findByRole('button', { name: 'rocket' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'setIcon', target: { folder: ONBOARDING }, icon: { kind: 'emoji', value: '🚀' } },
    ]);
  });

  it('picks an icon from the set', async () => {
    const { calls, user } = await renderApp();

    const picker = await openPicker('Status page');
    await user.click(within(picker).getByRole('tab', { name: 'Icons' }));
    await user.type(within(picker).getByRole('textbox', { name: 'Search icons' }), 'pull-request');
    await user.click(within(picker).getByRole('button', { name: 'git-pull-request' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'setIcon', target: { tab: STATUS_TAB }, icon: { kind: 'symbol', value: 'git-pull-request' } },
    ]);
  });

  it('uses up to three characters as text, and says when there are more', async () => {
    const { calls, user } = await renderApp();

    const picker = await openPicker('Onboarding');
    await user.click(within(picker).getByRole('tab', { name: 'Text' }));
    const input = within(picker).getByRole('textbox', { name: 'Text icon' });
    await user.type(input, '1234{Enter}');
    expect(within(picker).getByRole('alert').textContent).toBe('Use 1 to 3 characters');
    expect(appliedCommands(calls)).toEqual([]);

    await user.clear(input);
    await user.type(input, 'HR{Enter}');
    expect(appliedCommands(calls)).toEqual([
      { type: 'setIcon', target: { folder: ONBOARDING }, icon: { kind: 'text', value: 'HR' } },
    ]);
  });

  it('a symbol becomes a text icon', async () => {
    const { calls, user } = await renderApp();

    const picker = await openPicker('Onboarding');
    await user.click(within(picker).getByRole('tab', { name: 'Text' }));
    await user.click(within(picker).getByRole('button', { name: 'Symbol ★' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'setIcon', target: { folder: ONBOARDING }, icon: { kind: 'text', value: '★' } },
    ]);
  });

  it('reset goes back to the default icon', async () => {
    const { calls, user } = await renderApp();

    const picker = await openPicker('In TEST');
    await user.click(within(picker).getByRole('button', { name: 'Reset' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'setIcon', target: { group: IN_TEST }, icon: null }]);
  });

  it('opens from "Change icon…" in the menu', async () => {
    await renderApp();

    await rightClick('In TEST');
    clickMenuItem('Change icon…');

    expect(await screen.findByRole('dialog', { name: 'Icon of In TEST' })).toBeTruthy();
  });
});
