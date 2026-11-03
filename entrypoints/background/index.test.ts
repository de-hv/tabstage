import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '../../__mocks__/fake-tab-groups';
import { TabGroupBuilder } from '../../__mocks__/tab-group.builder';
import { TabBuilder } from '../../__mocks__/tab.builder';
import { statusBackupItem } from '../../lib/backup';
import { setStatus } from '../../lib/groups';
import {
  getStatuses,
  removeStatus,
  renameStatus,
  saveStatuses,
} from '../../lib/statuses';
import background from './index';

type SidePanel = { open: (options: { windowId: number }) => Promise<void> };

const api = fakeBrowser as unknown as { sidePanel: SidePanel | undefined };
const originalSidePanel = api.sidePanel;
let fake: FakeTabGroups;

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabGroups.install().with({
    groups: [
      new TabGroupBuilder().with({ id: 1, title: 'CAR-6124 · STG', color: 'orange' }).build(),
      new TabGroupBuilder().with({ id: 2, title: 'CAR-6100 · Dev', color: 'cyan' }).build(),
    ],
  });
  background.main();
});

afterEach(() => {
  fake.uninstall();
  api.sidePanel = originalSidePanel;
});

describe('background', () => {
  describe('tab group events', () => {
    it.each(['onCreated', 'onUpdated'] as const)(
      'saves the status of a group on %s',
      async (event) => {
        await fake[event].trigger(fake.group(1)!);

        expect(await statusBackupItem.getValue()).toEqual({ 'CAR-6124': 'stg' });
      },
    );

    it('adds the saved status back to a hand-edited title, once', async () => {
      await statusBackupItem.setValue({ 'CAR-6124': 'stg' });
      const group = fake.group(1)!;
      group.title = 'CAR-6124 hotfix';
      group.color = 'grey';

      await fake.onUpdated.trigger({ ...group });

      expect(fake.group(1)).toMatchObject({
        title: 'CAR-6124 hotfix · STG',
        color: 'orange',
      });
      expect(fake.updates).toHaveLength(1);
    });

    it('restores the status of a re-created ticket group', async () => {
      await statusBackupItem.setValue({ 'CAR-6115': 'review' });
      fake.with({ tabs: [new TabBuilder().with({ id: 5 }).build()] });

      const groupId = await fakeBrowser.tabs.group({ tabIds: 5 });
      await fakeBrowser.tabGroups.update(groupId, { title: 'CAR-6115' });

      expect(fake.group(groupId)).toMatchObject({
        title: 'CAR-6115 · Review',
        color: 'purple',
      });
    });

    it('ignores a manual color change', async () => {
      await fakeBrowser.tabGroups.update(1, { color: 'red' });

      expect(fake.group(1)).toMatchObject({ title: 'CAR-6124 · STG', color: 'red' });
      expect(fake.updates).toHaveLength(1);
    });

    it('does not loop on its own status updates', async () => {
      await setStatus(1, 'done');

      expect(fake.updates).toHaveLength(1);
      expect(await statusBackupItem.getValue()).toEqual({ 'CAR-6124': 'done' });
    });

    it('does not add back a status cleared with setStatus', async () => {
      await statusBackupItem.setValue({ 'CAR-6124': 'stg' });

      await setStatus(1, null);

      expect(fake.group(1)?.title).toBe('CAR-6124');
      expect(fake.updates).toHaveLength(1);
    });

    it('logs and swallows errors', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(fakeBrowser.tabGroups, 'update').mockRejectedValue(new Error('gone'));
      await statusBackupItem.setValue({ 'CAR-6124': 'stg' });

      await fake.onUpdated.trigger({ ...fake.group(1)!, title: 'CAR-6124' });

      expect(warn).toHaveBeenCalledWith(
        'Tabstage: could not sync group',
        1,
        expect.any(Error),
      );
    });
  });

  describe('status list changes', () => {
    it('rewrites the titles of a renamed status and keeps its color', async () => {
      await saveStatuses(renameStatus(await getStatuses(), 'stg', 'Staging'));

      await vi.waitFor(() => {
        expect(fake.group(1)).toMatchObject({
          title: 'CAR-6124 · Staging',
          color: 'orange',
        });
      });
      expect(fake.group(2)?.title).toBe('CAR-6100 · Dev');
    });

    it('moves the groups of a deleted status to "No status" for good', async () => {
      await fake.onUpdated.trigger(fake.group(1)!);

      await saveStatuses(removeStatus(await getStatuses(), 'stg'));

      await vi.waitFor(() => {
        expect(fake.group(1)?.title).toBe('CAR-6124');
      });
      expect(fake.updates).toHaveLength(1);
      expect(await statusBackupItem.getValue()).toEqual({});
    });
  });

  describe('toggle-panel command', () => {
    it('does nothing, without throwing, when browser.sidePanel is undefined', async () => {
      api.sidePanel = undefined;
      const tab = new TabBuilder().with({ windowId: 3 }).build();

      await expect(fake.onCommand.trigger('toggle-panel', tab)).resolves.toBeUndefined();
    });

    it("opens the side panel in the tab's window", async () => {
      const open = vi.fn<SidePanel['open']>().mockResolvedValue(undefined);
      api.sidePanel = { open };

      await fake.onCommand.trigger(
        'toggle-panel',
        new TabBuilder().with({ windowId: 3 }).build(),
      );

      await vi.waitFor(() => {
        expect(open).toHaveBeenCalledWith({ windowId: 3 });
      });
    });

    it('falls back to the current window when there is no tab', async () => {
      const open = vi.fn<SidePanel['open']>().mockResolvedValue(undefined);
      api.sidePanel = { open };
      const current = await fakeBrowser.windows.create({ focused: true });

      await fake.onCommand.trigger('toggle-panel', undefined);

      await vi.waitFor(() => {
        expect(open).toHaveBeenCalledWith({ windowId: current?.id });
      });
    });

    it('ignores other commands', async () => {
      const open = vi.fn<SidePanel['open']>();
      api.sidePanel = { open };

      await fake.onCommand.trigger('something-else', new TabBuilder().build());

      expect(open).not.toHaveBeenCalled();
    });
  });
});
