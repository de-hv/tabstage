import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '../__mocks__/fake-tab-groups';
import { StatusMother } from '../__mocks__/status.mother';
import { TabGroupBuilder } from '../__mocks__/tab-group.builder';
import { StatusPicker } from './StatusPicker';

let fake: FakeTabGroups;
const statuses = [StatusMother.todo(), StatusMother.inProgress(), StatusMother.stg()];

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabGroups.install().with({
    groups: [
      new TabGroupBuilder().with({ id: 1, title: 'CAR-6124 · STG', color: 'orange' }).build(),
    ],
  });
});

afterEach(() => {
  cleanup();
  fake.uninstall();
});

function renderPicker(current: string | null = 'stg') {
  const onClose = vi.fn();
  render(<StatusPicker groupId={1} current={current} statuses={statuses} onClose={onClose} />);
  return { onClose, listbox: screen.getByRole('listbox', { name: 'Status' }) };
}

const activeOption = (listbox: HTMLElement) =>
  document.getElementById(listbox.getAttribute('aria-activedescendant') ?? '');

describe('StatusPicker', () => {
  it('lists the statuses in order, then "No status", marking the current one', () => {
    renderPicker('stg');

    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'To do',
      'In progress',
      'STG',
      'No status',
    ]);
    expect(screen.getByRole('option', { selected: true }).textContent).toBe('STG');
  });

  it('focuses the list with the current status active', () => {
    const { listbox } = renderPicker('in-progress');

    expect(document.activeElement).toBe(listbox);
    expect(activeOption(listbox)?.textContent).toBe('In progress');
  });

  it('calls setStatus with the clicked status and closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPicker('stg');

    await user.click(screen.getByRole('option', { name: 'In progress' }));

    await waitFor(() => expect(fake.group(1)?.title).toBe('CAR-6124 · In progress'));
    expect(fake.group(1)?.color).toBe('blue');
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('removes the status when "No status" is picked', async () => {
    const user = userEvent.setup();
    renderPicker('stg');

    await user.click(screen.getByRole('option', { name: 'No status' }));

    await waitFor(() => expect(fake.group(1)?.title).toBe('CAR-6124'));
    expect(fake.group(1)?.color).toBe('orange');
  });

  it('only closes when the current status is picked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPicker('stg');

    await user.click(screen.getByRole('option', { name: 'STG' }));

    expect(onClose).toHaveBeenCalledWith(true);
    expect(fake.updates).toEqual([]);
  });

  describe('keyboard', () => {
    it.each([
      ['{ArrowDown}', 'No status'],
      ['{ArrowDown}{ArrowDown}', 'To do'],
      ['{ArrowUp}', 'In progress'],
      ['{Home}', 'To do'],
      ['{End}', 'No status'],
    ])('%s moves the active option to %s, wrapping around', async (keys, expected) => {
      const user = userEvent.setup();
      const { listbox } = renderPicker('stg');

      await user.keyboard(keys);

      expect(activeOption(listbox)?.textContent).toBe(expected);
    });

    it.each(['{Enter}', ' '])('%s picks the active option', async (key) => {
      const user = userEvent.setup();
      renderPicker('stg');

      await user.keyboard(`{Home}${key}`);

      await waitFor(() => expect(fake.group(1)?.title).toBe('CAR-6124 · To do'));
      expect(fake.group(1)?.color).toBe('grey');
    });

    it.each(['{Escape}', '{Tab}'])('%s closes without a change', async (key) => {
      const user = userEvent.setup();
      const { onClose } = renderPicker('stg');

      await user.keyboard(key);

      expect(onClose).toHaveBeenCalledWith(true);
      expect(fake.updates).toEqual([]);
    });
  });

  it('closes without restoring focus when focus leaves the list', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPicker('stg');

    await user.click(document.body);

    expect(onClose).toHaveBeenCalledWith(false);
  });
});
