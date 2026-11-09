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

/** CSS color of a profile, from the theme tokens (lighter in dark mode). */
export function profileColor(index: number): string {
  return `var(--profile-${index})`;
}
