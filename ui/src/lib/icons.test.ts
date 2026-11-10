import { describe, expect, it } from 'vitest';

import { loadEmoji, readRecentIcons, rememberIcon, searchEmoji, textIcon } from './icons';

describe('textIcon', () => {
  it('accepts one to three visible characters', () => {
    expect(textIcon(' 142 ')).toEqual({ kind: 'text', value: '142' });
    expect(textIcon('★')).toEqual({ kind: 'text', value: '★' });
    expect(textIcon('👩‍💻QA')).toEqual({ kind: 'text', value: '👩‍💻QA' });
  });

  it('explains what is wrong otherwise', () => {
    expect(textIcon('')).toBe('Use 1 to 3 characters');
    expect(textIcon('1234')).toBe('Use 1 to 3 characters');
    expect(textIcon('a b')).toBe('Spaces are not allowed');
  });
});

describe('recent icons', () => {
  it('keeps the newest first without duplicates', () => {
    rememberIcon({ kind: 'emoji', value: '🧪' });
    rememberIcon({ kind: 'text', value: 'QA' });
    rememberIcon({ kind: 'emoji', value: '🧪' });

    expect(readRecentIcons()).toEqual([
      { kind: 'emoji', value: '🧪' },
      { kind: 'text', value: 'QA' },
    ]);
  });
});

describe('emoji search', () => {
  it('finds emoji by name or tag from the bundled data', async () => {
    const all = await loadEmoji();

    expect(searchEmoji(all, 'test tube').map((entry) => entry.unicode)).toContain('🧪');
    expect(searchEmoji(all, 'rocket')[0]?.unicode).toBe('🚀');
    expect(searchEmoji(all, '')).toEqual([]);
  });
});
