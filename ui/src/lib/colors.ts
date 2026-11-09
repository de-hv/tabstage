import type { AccentColor } from '../api/types';

/** The ten accents, in palette order, with the names shown in menus. */
export const ACCENTS: { color: AccentColor; name: string }[] = [
  { color: 'lavender', name: 'Lavender' },
  { color: 'blue', name: 'Blue' },
  { color: 'sky', name: 'Sky' },
  { color: 'teal', name: 'Teal' },
  { color: 'green', name: 'Green' },
  { color: 'yellow', name: 'Yellow' },
  { color: 'peach', name: 'Peach' },
  { color: 'red', name: 'Red' },
  { color: 'pink', name: 'Pink' },
  { color: 'mauve', name: 'Mauve' },
];

/** The first accent nobody uses yet, so new items stand apart. */
export function nextAccent(used: AccentColor[]): AccentColor {
  return ACCENTS.find(({ color }) => !used.includes(color))?.color ?? 'blue';
}
