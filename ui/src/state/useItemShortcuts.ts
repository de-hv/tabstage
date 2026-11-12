import { useEffect, useRef } from 'react';

/** Keys a view's header listens to: T edits the ticket id, E the note. */
export function useItemShortcuts(handlers: { onTicket: () => void; onNote: () => void }) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isTyping(event.target) || document.querySelector('[role="dialog"], [role="menu"]')) return;
      const key = event.key.toLowerCase();
      if (key === 't') latest.current.onTicket();
      else if (key === 'e') latest.current.onNote();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
