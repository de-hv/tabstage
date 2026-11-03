import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS, V1_COLOR_TO_ACCENT, isAccentColor } from './colors';

describe('ACCENT_COLORS', () => {
  it('lists 10 Catppuccin accents with no duplicates', () => {
    expect(ACCENT_COLORS).toHaveLength(10);
    expect(new Set(ACCENT_COLORS).size).toBe(10);
  });
});

describe('isAccentColor', () => {
  it.each(ACCENT_COLORS)('accepts "%s"', (color) => {
    expect(isAccentColor(color)).toBe(true);
  });

  it.each(['grey', 'purple', 'cyan', 'Mauve', '', ' blue'])(
    'rejects the string "%s"',
    (value) => {
      expect(isAccentColor(value)).toBe(false);
    },
  );

  it.each([undefined, null, 0, true, {}, ['blue']])(
    'rejects the non-string value %j',
    (value) => {
      expect(isAccentColor(value)).toBe(false);
    },
  );
});

describe('V1_COLOR_TO_ACCENT', () => {
  it('maps every v1 native color to an accent', () => {
    const v1 = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

    expect(Object.keys(V1_COLOR_TO_ACCENT).sort()).toEqual([...v1].sort());
    expect(Object.values(V1_COLOR_TO_ACCENT).every(isAccentColor)).toBe(true);
  });
});

describe('WxtVitest', () => {
  it('provides the fake browser global', () => {
    expect(browser.runtime.id).toBeTypeOf('string');
  });
});
