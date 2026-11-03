import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardMother } from '@/__mocks__/board.mother';
import { FakeTabs } from '@/__mocks__/fake-tabs';
import { StatusBuilder } from '@/__mocks__/status.builder';
import { StatusMother } from '@/__mocks__/status.mother';
import { TabBuilder } from '@/__mocks__/tab.builder';
import { boardItem, getBoard } from '@/lib/board';
import { exportBackup } from '@/lib/board-io';
import { getStatuses, statusesItem } from '@/lib/statuses';
import App from './App';

let fake: FakeTabs;

beforeEach(async () => {
  fakeBrowser.reset();
  fake = FakeTabs.install();
  await boardItem.setValue(BoardMother.sample());
});

afterEach(() => {
  cleanup();
  fake.uninstall();
  vi.restoreAllMocks();
});

const rowLabels = () =>
  screen.getAllByRole('textbox', { name: /^Label of / }).map((input) => (input as HTMLInputElement).value);

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('region', { name: 'Statuses' });
  return { user };
}

describe('App', () => {
  it('says "Loading statuses…" before the first read', () => {
    render(<App />);

    expect(screen.getByText('Loading statuses…')).toBeTruthy();
  });

  it('shows the statuses, backup and cleanup sections', async () => {
    await setup();

    expect(screen.getByRole('heading', { name: 'Statuses' })).toBeTruthy();
    expect(rowLabels()).toEqual(StatusMother.defaults().map((status) => status.label));
    expect(screen.getByRole('region', { name: 'Backup' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Clean up v1 titles' })).toBeTruthy();
  });

  it('follows changes saved elsewhere', async () => {
    await setup();

    await statusesItem.setValue([new StatusBuilder().build()]);

    expect(await screen.findByDisplayValue('QA')).toBeTruthy();
  });

  describe('backup', () => {
    it('exports the board and statuses as a JSON download', async () => {
      const { user } = await setup();
      const createObjectURL = vi.fn(() => 'blob:backup');
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      await user.click(screen.getByRole('button', { name: 'Export board' }));

      expect(click).toHaveBeenCalledOnce();
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(screen.getByRole('status').textContent).toBe('Exported 4 tabs and 5 statuses.');
    });

    it('imports a backup, replacing the board and relinking open tabs', async () => {
      fake.with({ tabs: [new TabBuilder().with({ id: 30, url: 'https://docs.example.com/guide' }).build()] });
      const { user } = await setup();
      const statuses = [StatusMother.todo(), StatusMother.done()];
      const board = { groups: [], items: [BoardMother.sample().items[1]!] };
      const file = new File([exportBackup(board, statuses)], 'backup.json', { type: 'application/json' });

      await user.upload(screen.getByLabelText('Backup file'), file);

      expect((await screen.findByRole('status')).textContent).toBe('Imported 1 tabs and 2 statuses.');
      expect(await getStatuses()).toEqual([StatusMother.todo(), { ...StatusMother.done(), order: 1 }]);
      expect((await getBoard()).items).toEqual([
        expect.objectContaining({ id: 'item-2', url: 'https://docs.example.com/guide', tabId: 30 }),
      ]);
    });

    it('rejects an invalid file and keeps the board', async () => {
      const { user } = await setup();
      const file = new File(['{"app":"other"}'], 'x.json', { type: 'application/json' });

      await user.upload(screen.getByLabelText('Backup file'), file);

      expect((await screen.findByRole('alert')).textContent).toBe('The file is not a Tabstage backup.');
      expect(await getBoard()).toEqual(BoardMother.sample());
    });
  });

  describe('cleanup', () => {
    it('strips the v1 suffix only when the button is pressed', async () => {
      fake.allowNativeGroups([{ id: 1, title: 'CAR-6124 · STG', color: 'orange' }]);
      const { user } = await setup();
      expect(fake.permissionsRequest).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Remove Tabstage suffix from native group titles' }));

      await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Cleaned 1 group title.'));
      expect(fake.nativeGroups[0]).toEqual({ id: 1, title: 'CAR-6124', color: 'orange' });
    });

    it('explains when the permission is denied', async () => {
      fake.permissionsRequest.mockResolvedValue(false);
      const { user } = await setup();

      await user.click(screen.getByRole('button', { name: 'Remove Tabstage suffix from native group titles' }));

      expect((await screen.findByRole('status')).textContent).toBe('Nothing changed: the permission was not granted.');
    });
  });
});
