import { emit } from '@tauri-apps/api/event';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Snapshot } from './api/types';
import { appliedCommands, snapshotFixture } from './test/ipc';
import {
  INCIDENTS,
  IN_TEST,
  STATUS_TAB,
  WORK,
  clickMenuItem,
  drag,
  renderApp,
  rightClick,
  sidebar,
  treeRow,
} from './test/render';

async function expandWork(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await user.click(within(sidebar()).getByRole('button', { name: 'Expand Trabajo · Jira' }));
}

describe('colors', () => {
  it('shows no color by default: only chosen colors tint the rows inside', async () => {
    const { user } = await renderApp();
    await expandWork(user);
    await user.click(within(sidebar()).getByRole('button', { name: 'Expand In TEST' }));

    // A profile's color is its dot; it does not tint its rows.
    expect(treeRow('Trabajo · Jira').hasAttribute('data-tinted')).toBe(false);
    expect(treeRow('Trabajo · Jira').hasAttribute('data-own')).toBe(false);
    expect(treeRow('Runbook de despliegue').hasAttribute('data-tinted')).toBe(false);
    expect(treeRow('Incidentes').style.getPropertyValue('--own')).toBe('var(--profile-15)');
    expect(treeRow('In TEST').style.getPropertyValue('--own')).toBe('var(--profile-3)');
    expect(treeRow('Staging dashboard').style.getPropertyValue('--parent')).toBe('var(--profile-3)');
  });

  it('uses the parent color when a group asks for it', async () => {
    const { user } = await renderApp();
    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Investigación' }));

    expect(treeRow('Investigación').style.getPropertyValue('--own')).toBe('var(--profile-1)');
    expect(treeRow('HTTP caching · MDN').style.getPropertyValue('--parent')).toBe('var(--profile-1)');
  });

  it('picks a color, the parent one, or none from the menu', async () => {
    const { calls } = await renderApp();

    await rightClick('In TEST');
    clickMenuItem('Change color…');
    const picker = await screen.findByRole('menu', { name: 'Color of In TEST' });
    fireEvent.click(within(picker).getByRole('menuitemradio', { name: 'Teal' }));
    await rightClick('In TEST');
    clickMenuItem('Change color…');
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Use parent color (Trabajo)' }));
    await rightClick('In TEST');
    clickMenuItem('Change color…');
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'No color' }));
    await rightClick('Trabajo · Jira');
    clickMenuItem('Change color…');
    expect(
      (await screen.findByRole('menuitemradio', { name: 'No color' })).getAttribute('aria-checked'),
    ).toBe('true');

    expect(appliedCommands(calls)).toEqual([
      { type: 'setColor', target: { group: IN_TEST }, color: 10 },
      { type: 'setColor', target: { group: IN_TEST }, color: 'parent' },
      { type: 'setColor', target: { group: IN_TEST }, color: 'none' },
    ]);
  });

  it('offers no color for tabs', async () => {
    await renderApp();
    await rightClick('Status page');
    expect(screen.queryByRole('menuitem', { name: 'Change color…' })).toBeNull();
  });
});

describe('pinned', () => {
  const withPinned = (): Snapshot => {
    const snapshot = snapshotFixture();
    snapshot.workspace.pinned = [{ tab: STATUS_TAB }, { group: IN_TEST }];
    return snapshot;
  };

  it('pins and unpins from the menu', async () => {
    const { calls } = await renderApp();
    expect(within(sidebar()).queryByRole('region', { name: 'Pinned' })).toBeNull();

    await rightClick('Status page');
    clickMenuItem('Pin to top');

    expect(appliedCommands(calls)).toEqual([{ type: 'pin', target: { tab: STATUS_TAB } }]);
  });

  it('lists pinned items: a tab opens with a click, a group is shown, and each can be unpinned', async () => {
    const { calls, user } = await renderApp({ snapshot: withPinned, apply: withPinned });
    const pinned = within(sidebar()).getByRole('region', { name: 'Pinned' });

    await user.click(within(pinned).getByRole('button', { name: 'Status page' }));
    expect(calls).toContainEqual({ cmd: 'open_tab', args: { tab: STATUS_TAB } });

    await user.click(within(pinned).getByRole('button', { name: 'In TEST' }));
    expect(await screen.findByRole('main', { name: 'In TEST' })).toBeTruthy();

    await user.click(within(pinned).getByRole('button', { name: 'Unpin In TEST' }));
    expect(appliedCommands(calls)).toContainEqual({ type: 'unpin', target: { group: IN_TEST } });

    await rightClick('Status page');
    expect(screen.getByRole('menuitem', { name: 'Unpin' })).toBeTruthy();
  });

  it('pins by dragging onto the section and reorders by dragging within it', async () => {
    const { calls } = await renderApp({ snapshot: withPinned, apply: withPinned });
    const pinned = within(within(sidebar()).getByRole('region', { name: 'Pinned' }));
    const rows = pinned
      .getAllByRole('listitem').map((item) => item.querySelector<HTMLElement>('.tree-row')!);

    drag(rows[1]!, rows[0]!);
    drag(treeRow('Trabajo · Jira'), pinned.getByRole('button', { name: 'Pinned' }).parentElement!);

    expect(appliedCommands(calls)).toEqual([
      { type: 'movePinned', target: { group: IN_TEST }, index: 0 },
      { type: 'pin', target: { group: WORK } },
    ]);
  });

  it('toggles the pin of the shown item with Cmd+P', async () => {
    const { calls, user } = await renderApp();
    await user.click(within(sidebar()).getByRole('button', { name: 'Status page' }));
    await screen.findByRole('main', { name: 'Status page' });

    await user.keyboard('{Meta>}p{/Meta}');

    expect(appliedCommands(calls)).toEqual([{ type: 'pin', target: { tab: STATUS_TAB } }]);
  });

  it('shows pinned items in the collapsed rail', async () => {
    const { calls, user } = await renderApp({ snapshot: withPinned });
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    await user.click(within(sidebar()).getByRole('button', { name: 'Pinned: Status page' }));
    expect(calls).toContainEqual({ cmd: 'open_tab', args: { tab: STATUS_TAB } });
  });
});

describe('ticket links', () => {
  it('saves a profile ticket URL in settings and explains a wrong one', async () => {
    const { calls, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const card = screen.getByRole('article', { name: 'Profile Personal' });
    const field = within(card).getByRole('textbox', { name: 'Ticket URL for Personal' });

    await user.type(field, 'linear.app/x/issue{Enter}');
    expect(within(card).getByRole('alert').textContent).toBe('Start with https:// or http://');

    await user.clear(field);
    await user.click(within(card).getByRole('button', { name: 'Linear' }));
    expect((field as HTMLInputElement).value).toBe('https://linear.app/your-team/issue/{ticket}');
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() =>
      expect(appliedCommands(calls)).toEqual([
        {
          type: 'setTicketUrl',
          profile: '00000000-0000-0000-0000-0000000000c2',
          url: 'https://linear.app/your-team/issue/{ticket}',
        },
      ]),
    );
  });

  it('opens a ticket from the menu and from the quick search', async () => {
    const { calls, user } = await renderApp();
    await expandWork(user);

    await rightClick('Incidentes');
    clickMenuItem('Open ticket');
    expect(calls).toContainEqual({ cmd: 'open_ticket', args: { target: { folder: INCIDENTS } } });

    await act(async () => {
      await emit('open-palette');
    });
    await user.type(await screen.findByRole('combobox', { name: 'Search tabs' }), 'ticket:INC');
    await user.click(await screen.findByRole('option', { name: /Open ticket INC-77/ }));
    expect(calls.filter((call) => call.cmd === 'open_ticket')).toHaveLength(2);
  });
});
