import { describe, expect, it } from 'vitest';
import { GROUP_COLORS, isGroupColor } from './colors';

describe('GROUP_COLORS', () => {
  it('lists the 9 native tab group colors', () => {
    expect(GROUP_COLORS).toEqual([
      'grey',
      'blue',
      'red',
      'yellow',
      'green',
      'pink',
      'purple',
      'cyan',
      'orange',
    ]);
  });

  it('has no duplicates', () => {
    expect(new Set(GROUP_COLORS).size).toBe(GROUP_COLORS.length);
  });
});

describe('isGroupColor', () => {
  it.each(GROUP_COLORS)('accepts "%s"', (color) => {
    expect(isGroupColor(color)).toBe(true);
  });

  it.each(['gray', 'Blue', 'BLUE', 'white', 'black', '', ' blue'])(
    'rejects the string "%s"',
    (value) => {
      expect(isGroupColor(value)).toBe(false);
    },
  );

  it.each([undefined, null, 0, 1, true, {}, [], ['blue']])(
    'rejects the non-string value %j',
    (value) => {
      expect(isGroupColor(value)).toBe(false);
    },
  );
});

describe('WxtVitest', () => {
  it('provides the fake browser global', () => {
    expect(browser.runtime.id).toBeTypeOf('string');
  });
});
