import type { KeyboardEvent, MouseEvent } from 'react';

/** Opens a menu at a viewport point. */
export type OpenMenu = (x: number, y: number) => void;

function belowElement(element: Element, open: OpenMenu) {
  const rect = element.getBoundingClientRect();
  open(rect.left + 8, rect.bottom);
}

/**
 * Props that open a context menu on right-click, the Menu key or Shift+F10.
 * From the keyboard, the menu opens under the element.
 */
export function menuTrigger(open: OpenMenu) {
  return {
    onContextMenu(event: MouseEvent) {
      event.preventDefault();
      if (event.clientX === 0 && event.clientY === 0) belowElement(event.currentTarget, open);
      else open(event.clientX, event.clientY);
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        belowElement(event.currentTarget, open);
      }
    },
  };
}
