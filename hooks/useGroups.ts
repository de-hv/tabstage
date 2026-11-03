import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { listGroups, type Group } from '@/lib/groups';
import type { Status } from '@/lib/types';

/** Bursts of tab events (a drag, a restore) cause one refresh. */
export const REFRESH_DELAY_MS = 50;

interface BrowserEvent {
  addListener(listener: () => void): void;
  removeListener(listener: () => void): void;
}

function groupEvents(): BrowserEvent[] {
  const { tabGroups, tabs } = browser;
  return [
    tabGroups.onCreated,
    tabGroups.onUpdated,
    tabGroups.onRemoved,
    tabGroups.onMoved,
    tabs.onCreated,
    tabs.onUpdated,
    tabs.onRemoved,
    tabs.onMoved,
    tabs.onAttached,
    tabs.onDetached,
    tabs.onActivated,
  ] as unknown as BrowserEvent[];
}

/**
 * A live snapshot of every tab group and its tabs. It waits for `statuses`,
 * reloads when they change, and refreshes after tab and group events.
 * `undefined` until the first load finishes.
 */
export function useGroups(statuses: readonly Status[] | undefined): Group[] | undefined {
  const [groups, setGroups] = useState<Group[]>();

  useEffect(() => {
    if (!statuses) return;
    let active = true;
    let request = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      const current = ++request;
      listGroups(statuses)
        .then((list) => {
          if (active && current === request) setGroups(list);
        })
        .catch((error: unknown) => {
          console.warn('Tabstage: could not list groups', error);
        });
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(load, REFRESH_DELAY_MS);
    };

    const events = groupEvents();
    for (const event of events) event.addListener(schedule);
    load();

    return () => {
      active = false;
      clearTimeout(timer);
      for (const event of events) event.removeListener(schedule);
    };
  }, [statuses]);

  return groups;
}
