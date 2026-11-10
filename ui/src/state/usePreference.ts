import { useCallback, useState } from 'react';

/** A yes/no preference of this computer, kept in localStorage. */
export function usePreference(key: string, byDefault: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? byDefault : saved === 'true';
    } catch {
      return byDefault;
    }
  });
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Storage can be unavailable; the preference then resets on restart.
      }
    },
    [key],
  );
  return [value, set];
}
