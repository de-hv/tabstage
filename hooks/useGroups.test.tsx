import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '../__mocks__/fake-tab-groups';
import { StatusMother } from '../__mocks__/status.mother';
import { TabGroupBuilder } from '../__mocks__/tab-group.builder';
import { TabBuilder } from '../__mocks__/tab.builder';
import { REFRESH_DELAY_MS, useGroups } from './useGroups';

let fake: FakeTabGroups;

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabGroups.install().with({
    groups: [new TabGroupBuilder().with({ id: 1, title: 'CAR-6124 · STG' }).build()],
    tabs: [new TabBuilder().with({ id: 10, groupId: 1 }).build()],
  });
});

afterEach(() => {
  cleanup();
  fake.uninstall();
});

const statuses = StatusMother.defaults();

describe('useGroups', () => {
  it('is undefined until statuses are loaded', () => {
    const { result } = renderHook(() => useGroups(undefined));

    expect(result.current).toBeUndefined();
    expect(fake.onUpdated.hasListeners()).toBe(false);
  });

  it('loads the groups with their parsed status and tabs', async () => {
    const { result } = renderHook(() => useGroups(statuses));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current?.[0]).toMatchObject({ id: 1, statusId: 'stg' });
    expect(result.current?.[0]?.tabs.map((tab) => tab.id)).toEqual([10]);
  });

  it('refreshes when a group event fires', async () => {
    const { result } = renderHook(() => useGroups(statuses));
    await waitFor(() => expect(result.current).toHaveLength(1));

    const created = new TabGroupBuilder().with({ id: 2, title: 'CAR-7000 · Done' }).build();
    fake.groups.push(created);
    await fake.onCreated.trigger(created);

    await waitFor(() => expect(result.current?.map((g) => g.id)).toEqual([1, 2]));
    expect(result.current?.[1]?.statusId).toBe('done');
  });

  it('refreshes when a tab event fires', async () => {
    const { result } = renderHook(() => useGroups(statuses));
    await waitFor(() => expect(result.current).toHaveLength(1));

    fake.tabs.push(new TabBuilder().with({ id: 11, groupId: 1, index: 1 }).build());
    await fake.onTabAttached.trigger(11, { newWindowId: 1, newPosition: 1 });

    await waitFor(() =>
      expect(result.current?.[0]?.tabs.map((tab) => tab.id)).toEqual([10, 11]),
    );
  });

  it('debounces a burst of events into one reload', async () => {
    const { result } = renderHook(() => useGroups(statuses));
    await waitFor(() => expect(result.current).toHaveLength(1));
    const query = vi.spyOn(fakeBrowser.tabGroups, 'query');

    const group = new TabGroupBuilder().with({ id: 1 }).build();
    await fake.onUpdated.trigger(group);
    await fake.onMoved.trigger(group);
    await fake.onUpdated.trigger(group);

    await new Promise((resolve) => setTimeout(resolve, REFRESH_DELAY_MS * 3));

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners on unmount', async () => {
    const { result, unmount } = renderHook(() => useGroups(statuses));
    await waitFor(() => expect(result.current).toHaveLength(1));

    unmount();

    for (const event of [
      fake.onCreated,
      fake.onUpdated,
      fake.onRemoved,
      fake.onMoved,
      fake.onTabMoved,
      fake.onTabAttached,
      fake.onTabDetached,
    ]) {
      expect(event.hasListeners()).toBe(false);
    }
  });
});
