import type { AccentColor } from '../api/types';

/** The ten accents, in palette order, with the names shown in menus. */
export const ACCENTS: { color: AccentColor; name: string }[] = [
  { color: 'lavender', name: 'Lavanda' },
  { color: 'blue', name: 'Azul' },
  { color: 'sky', name: 'Celeste' },
  { color: 'teal', name: 'Verde azulado' },
  { color: 'green', name: 'Verde' },
  { color: 'yellow', name: 'Amarillo' },
  { color: 'peach', name: 'Durazno' },
  { color: 'red', name: 'Rojo' },
  { color: 'pink', name: 'Rosa' },
  { color: 'mauve', name: 'Malva' },
];

/** The first accent nobody uses yet, so new items stand apart. */
export function nextAccent(used: AccentColor[]): AccentColor {
  return ACCENTS.find(({ color }) => !used.includes(color))?.color ?? 'blue';
}
