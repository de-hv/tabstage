import { useCallback, useState } from 'react';

const KEY = 'tabstage.tree';

/**
 * Which sidebar rows are expanded, kept per computer. Profiles start
 * expanded; groups and folders start collapsed.
 */
export function useTreeState() {
  const [state, setState] = useState<Record<string, boolean>>(read);

  const isExpanded = useCallback((id: string, byDefault: boolean) => state[id] ?? byDefault, [state]);

  const set = useCallback((id: string, expanded: boolean) => {
    setState((current) => {
      const next = { ...current, [id]: expanded };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable; the tree then resets on restart.
      }
      return next;
    });
  }, []);

  return { isExpanded, set };
}

function read(): Record<string, boolean> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'boolean'));
  } catch {
    return {};
  }
}
