import type { KeyboardEvent } from 'react';

/**
 * Props that make a non-button element act as a button (role, focus,
 * Enter and Space). Used for the parts of a draggable row or card that a
 * drag starts from: WebKit, the engine of the macOS app, does not start a
 * drag on a real `<button>`.
 */
export function pressable(onPress: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPress();
      }
    },
  };
}
