import { useState, type KeyboardEvent } from 'react';

interface ListNavigationOptions {
  /** Number of items in the list. */
  count: number;
  /** The selection goes back to the first item whenever this changes. */
  resetKey?: unknown;
  /** Enter on the selected item. Not called on an empty list. */
  onEnter: (index: number) => void;
  /** Escape. Closes the window (the popup) by default. */
  onEscape?: () => void;
}

interface ListNavigation {
  /** The selected item, or -1 for an empty list. */
  index: number;
  setIndex: (index: number) => void;
  /** Put on the element that holds focus (the palette input). */
  onKeyDown: (event: KeyboardEvent) => void;
}

/**
 * Keyboard selection for a list: ↑/↓ move (and wrap), Enter runs the
 * selected item, Escape closes.
 */
export function useListNavigation({
  count,
  resetKey,
  onEnter,
  onEscape = () => window.close(),
}: ListNavigationOptions): ListNavigation {
  // The key is stored with the index, so a new key derives index 0 without an
  // effect.
  const [state, setState] = useState({ key: resetKey, index: 0 });
  const raw = state.key === resetKey ? state.index : 0;
  const index = count === 0 ? -1 : Math.min(raw, count - 1);

  const setIndex = (next: number) => setState({ key: resetKey, index: next });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count > 0) setIndex(index >= count - 1 ? 0 : index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count > 0) setIndex(index <= 0 ? count - 1 : index - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (index >= 0) onEnter(index);
        break;
      case 'Escape':
        event.preventDefault();
        onEscape();
        break;
    }
  };

  return { index, setIndex, onKeyDown };
}
