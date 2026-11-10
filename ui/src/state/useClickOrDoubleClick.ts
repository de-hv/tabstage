import { useEffect, useRef } from 'react';

/** How long a click waits for a second one, in ms (a typical double-click). */
export const DOUBLE_CLICK_MS = 250;

/**
 * Click handlers for an element whose single click replaces it (it selects
 * something and the view changes): the single click waits briefly, so a
 * double-click can still run its own action instead.
 */
export function useClickOrDoubleClick(onClick: () => void, onDoubleClick: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    onClick: () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(onClick, DOUBLE_CLICK_MS);
    },
    onDoubleClick: () => {
      clearTimeout(timer.current);
      onDoubleClick();
    },
  };
}
