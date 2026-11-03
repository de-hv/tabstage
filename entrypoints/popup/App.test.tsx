import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '@/__mocks__/fake-tab-groups';
import { TabBuilder } from '@/__mocks__/tab.builder';
import { TabGroupBuilder } from '@/__mocks__/tab-group.builder';
import App from './App';

interface SidePanelApi {
  open: (options: { windowId: number }) => Promise<void>;
}

const api = fakeBrowser as unknown as { sidePanel: SidePanelApi | undefined };
const originalSidePanel = api.sidePanel;

let fake: FakeTabGroups;
let close: MockInstance<() => void>;

beforeEach(() => {
  fakeBrowser.reset();
  vi.stubEnv('BROWSER', 'chrome');
  close = vi.spyOn(window, 'close').mockImplementation(() => {});
  fake = FakeTabGroups.install().with({
    groups: [
      new TabGroupBuilder().with({ id: 1, title: 'CAR-6115 checkout · In progress', color: 'blue' }).build(),
      new TabGroupBuilder().with({ id: 2, title: 'CAR-6124 login · STG', color: 'orange' }).build(),
      new TabGroupBuilder().with({ id: 3, title: 'Research', color: 'red' }).build(),
    ],
    tabs: [
      new TabBuilder().with({ id: 10, groupId: 1, index: 0, windowId: 1, title: 'Checkout PR' }).build(),
      new TabBuilder().with({ id: 20, groupId: 2, index: 1, windowId: 1, title: 'Login bug' }).build(),
      new TabBuilder().with({ id: 30, groupId: 3, index: 2, windowId: 2, title: 'Notes' }).build(),
    ],
  });
});

afterEach(() => {
  cleanup();
  fake.uninstall();
  vi.unstubAllEnvs();
  api.sidePanel = originalSidePanel;
});

const input = () => screen.getByRole('combobox', { name: 'Command' });
const options = () => within(screen.getByRole('listbox', { name: 'Results' })).queryAllByRole('option');
const selectedText = () =>
  options().find((option) => option.getAttribute('aria-selected') === 'true')?.textContent;

async function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findAllByRole('option');
  return user;
}

describe('App', () => {
  it('focuses the input and lists every group, then "Open side panel"', async () => {
    await renderApp();

    expect(document.activeElement).toBe(input());
    expect(options().map((option) => option.textContent)).toEqual([
      expect.stringContaining('CAR-6115 checkout'),
      expect.stringContaining('CAR-6124 login'),
      expect.stringContaining('Research'),
      expect.stringContaining('Open side panel'),
    ]);
  });

  it('says "Loading groups…" before the first load', () => {
    render(<App />);

    expect(screen.getByText('Loading groups…')).toBeTruthy();
  });

  it('sets a status with "6115 dev" and Enter, then closes', async () => {
    const user = await renderApp();

    await user.type(input(), '6115 dev{Enter}');

    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(fake.group(1)).toMatchObject({ title: 'CAR-6115 checkout · Dev', color: 'cyan' });
  });

  it('moves the selection with ↑/↓ and runs the selected item', async () => {
    const user = await renderApp();
    expect(selectedText()).toContain('CAR-6115');

    await user.keyboard('{ArrowDown}');
    expect(selectedText()).toContain('CAR-6124');
    expect(input().getAttribute('aria-activedescendant')).toBe(
      options()[1]?.getAttribute('id'),
    );

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(selectedText()).toContain('Open side panel');

    await user.keyboard('{ArrowUp}{Enter}');
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(fake.tabs.find((tab) => tab.id === 30)?.active).toBe(true);
    expect(fake.focusedWindowId).toBe(2);
  });

  it('selects the first result again after typing', async () => {
    const user = await renderApp();
    await user.keyboard('{ArrowDown}{ArrowDown}');

    await user.type(input(), 'login');

    expect(selectedText()).toContain('CAR-6124 login');
  });

  it('closes the popup with Escape', async () => {
    const user = await renderApp();

    await user.keyboard('{Escape}');

    expect(close).toHaveBeenCalledOnce();
  });

  it('runs a result on click', async () => {
    const user = await renderApp();
    await user.type(input(), 'login bug');

    await user.click(screen.getByRole('option', { name: /Login bug/ }));

    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(fake.tabs.find((tab) => tab.id === 20)?.active).toBe(true);
  });

  it('opens the side panel with "panel"', async () => {
    const open = vi.fn<SidePanelApi['open']>().mockResolvedValue(undefined);
    api.sidePanel = { open };
    const current = await fakeBrowser.windows.create({ focused: true });
    const user = await renderApp();

    await user.type(input(), 'panel{Enter}');

    expect(open).toHaveBeenCalledExactlyOnceWith({ windowId: current?.id });
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it('shows an error and stays open when the panel cannot open', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.sidePanel = undefined;
    const user = await renderApp();

    await user.type(input(), 'panel{Enter}');

    expect((await screen.findByRole('alert')).textContent).toBe('Could not open the side panel.');
    expect(close).not.toHaveBeenCalled();
  });

  it('says when nothing matches', async () => {
    const user = await renderApp();

    await user.type(input(), 'zzz{Enter}');

    expect(screen.getByText('No results for “zzz”.')).toBeTruthy();
    expect(options()).toHaveLength(0);
    expect(close).not.toHaveBeenCalled();
  });

  it("changes a group's status from its chip without running the row", async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: /^Status: STG/ }));
    await user.click(screen.getByRole('option', { name: 'Done' }));

    await waitFor(() => expect(fake.group(2)?.title).toBe('CAR-6124 login · Done'));
    expect(close).not.toHaveBeenCalled();
  });
});
