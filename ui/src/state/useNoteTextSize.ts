import { useCallback, useState } from 'react';

const KEY = 'tabstage.noteTextSize';

/** Note text sizes, in percent of the normal size. */
export const NOTE_TEXT_MIN = 90;
export const NOTE_TEXT_MAX = 200;
export const NOTE_TEXT_STEP = 10;
export const NOTE_TEXT_DEFAULT = 100;

function clamp(size: number): number {
  const stepped = Math.round(size / NOTE_TEXT_STEP) * NOTE_TEXT_STEP;
  return Math.min(NOTE_TEXT_MAX, Math.max(NOTE_TEXT_MIN, stepped));
}

/**
 * The text size of notes, kept per computer (it depends on how far the
 * screen is), shared by every note.
 */
export function useNoteTextSize(): [number, (size: number) => void] {
  const [size, setSize] = useState(read);
  const set = useCallback((next: number) => {
    const clamped = clamp(next);
    setSize(clamped);
    try {
      localStorage.setItem(KEY, String(clamped));
    } catch {
      // Storage can be unavailable; the size then resets on restart.
    }
  }, []);
  return [size, set];
}

function read(): number {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return saved ? clamp(saved) : NOTE_TEXT_DEFAULT;
  } catch {
    return NOTE_TEXT_DEFAULT;
  }
}
