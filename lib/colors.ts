/**
 * The status colors: ten Catppuccin accents. Their values for Mocha (dark)
 * and Latte (light) live in `assets/theme.css` as `--c-<accent>`.
 */
export const ACCENT_COLORS = [
  'lavender',
  'blue',
  'sky',
  'teal',
  'green',
  'yellow',
  'peach',
  'red',
  'pink',
  'mauve',
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];

export function isAccentColor(value: unknown): value is AccentColor {
  return (
    typeof value === 'string' &&
    (ACCENT_COLORS as readonly string[]).includes(value)
  );
}

/** The v1 native tab group colors, mapped to the closest accent. */
export const V1_COLOR_TO_ACCENT: Readonly<Record<string, AccentColor>> = {
  grey: 'lavender',
  blue: 'blue',
  red: 'red',
  yellow: 'yellow',
  green: 'green',
  pink: 'pink',
  purple: 'mauve',
  cyan: 'teal',
  orange: 'peach',
};
