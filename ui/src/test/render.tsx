import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '../App';
import { installIpc } from './ipc';

export const WORK = '00000000-0000-0000-0000-0000000000a1';
export const SPRINT = '00000000-0000-0000-0000-0000000000f1';
export const INCIDENTS = '00000000-0000-0000-0000-0000000000f2';
export const LOGIN_TAB = '00000000-0000-0000-0000-000000000b01';
export const GRAFANA_TAB = '00000000-0000-0000-0000-000000000b04';

/** Renders the app against the fixture and waits for the first group. */
export async function renderApp(handlers: Parameters<typeof installIpc>[0] = {}) {
  const calls = installIpc(handlers);
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: 'Trabajo · Jira' });
  return { calls, user };
}

export function sidebar() {
  return screen.getByRole('navigation', { name: 'Groups' });
}
