import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Snapshot } from './api/types';
import { appliedCommands, snapshotFixture } from './test/ipc';
import {
  CARRIER,
  ONBOARDING,
  STANDUP,
  clickMenuItem,
  drag,
  renderApp,
  openRowMenu,
  sidebar,
  treeRow,
} from './test/render';

describe('collapsible sidebar', () => {
  it('collapses to a rail and expands again, from the header and with ⌘\\', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(localStorage.getItem('tabstage.sidebarCollapsed')).toBe('true');
    expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).toBeNull();
    expect(within(sidebar()).getByRole('button', { name: 'Trabajo' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('separator', { name: 'Resize sidebar' })).toBeTruthy();

    await user.keyboard('{Meta>}\\{/Meta}');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  });
});

describe('pinned', () => {
  const withPinned = (): Snapshot => ({ ...snapshotFixture(), workspace: { ...snapshotFixture().workspace, pinned: [{ ticket: CARRIER }, { note: STANDUP }] } });

  it('pins from the menu and with ⌘P on the shown ticket', async () => {
    const { calls, user } = await renderApp();

    await openRowMenu('Onboarding wiki');
    clickMenuItem('Pin to top');
    await user.click(within(sidebar()).getByText('Carrier Commissions'));
    await screen.findByRole('main', { name: 'Carrier Commissions' });
    await user.keyboard('{Meta>}p{/Meta}');

    expect(appliedCommands(calls)).toEqual([
      { type: 'pin', target: { ticket: ONBOARDING } },
      { type: 'pin', target: { ticket: CARRIER } },
    ]);
  });

  it('lists pinned items: each is shown, and can be unpinned', async () => {
    const { calls, user } = await renderApp({ snapshot: withPinned, apply: withPinned });
    const pinned = within(within(sidebar()).getByRole('region', { name: 'Pinned' }));

    await user.click(pinned.getByRole('button', { name: 'CAR-5899 Carrier Commissions' }));
    expect(await screen.findByRole('main', { name: 'Carrier Commissions' })).toBeTruthy();
    await user.click(pinned.getByRole('button', { name: 'Standup notes' }));
    expect(await screen.findByRole('main', { name: 'Standup notes' })).toBeTruthy();
    await user.click(pinned.getByRole('button', { name: 'Unpin Standup notes' }));
    expect(appliedCommands(calls)).toContainEqual({ type: 'unpin', target: { note: STANDUP } });
  });

  it('pins by dragging onto the section', async () => {
    const { calls } = await renderApp({ snapshot: withPinned, apply: withPinned });
    const head = within(sidebar()).getByRole('button', { name: 'Pinned' }).parentElement!;

    drag(treeRow('Onboarding wiki'), head);

    expect(appliedCommands(calls)).toEqual([{ type: 'pin', target: { ticket: ONBOARDING } }]);
  });

  it('shows pinned items in the collapsed rail', async () => {
    const { user } = await renderApp({ snapshot: withPinned });
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    await user.click(within(sidebar()).getByRole('button', { name: 'Pinned: Carrier Commissions' }));
    expect(await screen.findByRole('main', { name: 'Carrier Commissions' })).toBeTruthy();
  });
});

describe('note text size', () => {
  it('grows and shrinks within limits, resets, and is remembered', async () => {
    const { user } = await renderApp();
    await user.click(within(sidebar()).getByText('Onboarding wiki'));
    const note = within(await screen.findByRole('main', { name: 'Onboarding wiki' })).getByRole('region', { name: 'Note' });
    const scale = () => note.style.getPropertyValue('--note-scale');
    expect(scale()).toBe('1');

    await user.click(within(note).getByRole('button', { name: 'Larger text' }));
    await user.click(within(note).getByRole('button', { name: 'Larger text' }));
    expect(scale()).toBe('1.2');
    expect(localStorage.getItem('tabstage.noteTextSize')).toBe('120');
    await user.click(within(note).getByRole('button', { name: 'Text size 120%, reset' }));
    expect(scale()).toBe('1');
  });
});

describe('drag sources', () => {
  // WebKit (the macOS app) does not start a drag on a <button>.
  it('are not buttons, yet work as buttons from the keyboard', async () => {
    const { user } = await renderApp();

    for (const element of document.querySelectorAll('[draggable="true"]')) {
      expect(element.tagName).not.toBe('BUTTON');
      expect(element.querySelector(':scope > button.card, :scope > button.tree-row__name')).toBeNull();
    }
    const name = within(treeRow('Onboarding wiki')).getByRole('button', { name: 'Onboarding wiki' });
    expect(name.tagName).not.toBe('BUTTON');
    name.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('main', { name: 'Onboarding wiki' })).toBeTruthy();
  });
});

describe('custom icons', () => {
  it('picks an emoji for a ticket', async () => {
    const { calls, user } = await renderApp();

    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Icon of Onboarding wiki' }));
    const picker = await screen.findByRole('dialog', { name: 'Icon of Onboarding wiki' });
    await user.type(within(picker).getByRole('textbox', { name: 'Search emoji' }), 'rocket');
    await user.click(await within(picker).findByRole('button', { name: 'rocket' }));

    await waitFor(() =>
      expect(appliedCommands(calls)).toEqual([
        { type: 'setIcon', target: { ticket: ONBOARDING }, icon: { kind: 'emoji', value: '🚀' } },
      ]),
    );
  });

  it('shows a ticket’s custom icon', async () => {
    await renderApp();
    expect(within(sidebar()).getByRole('button', { name: 'Icon of Carrier Commissions' }).textContent).toBe('🧪');
  });
});
