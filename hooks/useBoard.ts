import { useEffect, useState } from 'react';
import { boardItem, getBoard, normalizeBoard } from '@/lib/board';
import type { Board } from '@/lib/types';

/**
 * The board from `local:board`, kept live through `watch`. `undefined` until
 * the first read finishes. Statuses come from `useStatuses`; changes go
 * through `lib/actions.ts`.
 */
export function useBoard(): Board | undefined {
  const [board, setBoard] = useState<Board>();

  useEffect(() => {
    let active = true;
    getBoard()
      .then((value) => {
        if (active) setBoard(value);
      })
      .catch((error: unknown) => console.warn('Tabstage: could not read the board', error));
    const unwatch = boardItem.watch((next) => {
      if (active) setBoard(normalizeBoard(next));
    });
    return () => {
      active = false;
      unwatch();
    };
  }, []);

  return board;
}
