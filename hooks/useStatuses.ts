import { useEffect, useState } from 'react';
import { getStatuses, normalizeStatuses, statusesItem } from '@/lib/statuses';
import type { Status } from '@/lib/types';

/**
 * The configured statuses, in order, kept in sync with `sync:statuses`.
 * `undefined` until the first read finishes.
 */
export function useStatuses(): Status[] | undefined {
  const [statuses, setStatuses] = useState<Status[]>();

  useEffect(() => {
    let active = true;
    getStatuses()
      .then((list) => {
        if (active) setStatuses(list);
      })
      .catch((error: unknown) => {
        console.warn('Tabstage: could not read statuses', error);
      });
    const unwatch = statusesItem.watch((next) => {
      if (active) setStatuses(normalizeStatuses(next ?? []));
    });
    return () => {
      active = false;
      unwatch();
    };
  }, []);

  return statuses;
}
