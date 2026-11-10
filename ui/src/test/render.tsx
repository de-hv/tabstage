import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '../App';
import { installIpc } from './ipc';

export const TRABAJO = '00000000-0000-0000-0000-0000000000c1';
export const PERSONAL = '00000000-0000-0000-0000-0000000000c2';
export const QA = '00000000-0000-0000-0000-0000000000c3';
export const WORK = '00000000-0000-0000-0000-0000000000a1';
export const IN_TEST = '00000000-0000-0000-0000-0000000000a4';
export const SPRINT = '00000000-0000-0000-0000-0000000000f1';
export const INCIDENTS = '00000000-0000-0000-0000-0000000000f2';
export const ONBOARDING = '00000000-0000-0000-0000-0000000000f3';
export const LOGIN_TAB = '00000000-0000-0000-0000-000000000b01';
export const GRAFANA_TAB = '00000000-0000-0000-0000-000000000b04';
export const STAGING_TAB = '00000000-0000-0000-0000-000000000b07';
export const STATUS_TAB = '00000000-0000-0000-0000-000000000b09';

/** Renders the app against the fixture and waits for the first profile's board. */
export async function renderApp(handlers: Parameters<typeof installIpc>[0] = {}) {
  const rendered = renderRaw(handlers);
  await screen.findByRole('heading', { name: 'Trabajo' });
  return rendered;
}

/** Renders without waiting, for screens where a modal hides the board. */
export function renderRaw(handlers: Parameters<typeof installIpc>[0] = {}) {
  const calls = installIpc(handlers);
  const user = userEvent.setup();
  render(<App />);
  return { calls, user };
}

export function sidebar() {
  return screen.getByRole('navigation', { name: 'Library' });
}

/** The sidebar row (draggable container) of a profile, group, folder or tab. */
export function treeRow(name: string): HTMLElement {
  const button = within(sidebar()).getByRole('button', { name: `Options for ${name}` });
  const row = button.closest<HTMLElement>('.tree-row');
  if (!row) throw new Error(`no tree row for ${name}`);
  return row;
}

/** Opens a sidebar row's menu with a right-click and returns the menu. */
export async function rightClick(name: string) {
  fireEvent.contextMenu(treeRow(name));
  return screen.findByRole('menu');
}

export function dataTransfer() {
  return { setData: () => undefined, getData: () => '', effectAllowed: 'all', dropEffect: 'none', types: [] };
}

export function drag(source: HTMLElement, target: HTMLElement) {
  const transfer = dataTransfer();
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.dragEnter(target, { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer });
  fireEvent.drop(target, { dataTransfer: transfer });
  fireEvent.dragEnd(source, { dataTransfer: transfer });
}

/**
 * happy-dom gives every element an empty box, so Radix's submenu "pointer
 * grace" closes the submenu as soon as the simulated pointer leaves its
 * trigger. Clicking the item directly skips that pointer path.
 */
export function clickMenuItem(name: string | RegExp) {
  fireEvent.click(screen.getByRole('menuitem', { name }));
}
