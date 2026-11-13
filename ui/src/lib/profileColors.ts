import type { Color } from '../api/types';

/** Names of the 20 profile colors, by index: hues every 18° on the OKLCH wheel. */
export const PROFILE_COLOR_NAMES = [
  'Rose',
  'Red',
  'Coral',
  'Orange',
  'Amber',
  'Yellow',
  'Lime',
  'Green',
  'Emerald',
  'Jade',
  'Teal',
  'Cyan',
  'Sky',
  'Azure',
  'Blue',
  'Indigo',
  'Violet',
  'Purple',
  'Magenta',
  'Pink',
] as const;

/** CSS color of a profile or status: a palette color from the theme tokens (lighter in dark mode), or a custom one as is. */
export function profileColor(color: Color): string {
  return typeof color === 'string' ? color : `var(--profile-${color})`;
}

/** Whether a color is a custom `#rrggbb` one. */
export function isCustomColor(color: Color | undefined): color is string {
  return typeof color === 'string';
}

/** A `#rrggbb` color from what someone typed (`ff6a3d`, `#FF6A3D`, `#f63`), or `null`. */
export function parseHexColor(text: string): string | null {
  const digits = text.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(digits)) return `#${digits}`;
  if (/^[0-9a-f]{3}$/.test(digits)) return `#${[...digits].map((digit) => digit + digit).join('')}`;
  return null;
}
