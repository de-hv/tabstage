import { describe, expect, it } from 'vitest';
import { stripStatusSuffix } from './title';

const labels = ['STG', 'In progress', 'Done'];

describe('stripStatusSuffix', () => {
  it.each([
    ['CAR-6124 · STG', 'CAR-6124'],
    ['CAR-6124 · stg', 'CAR-6124'],
    ['CAR-6124 login · IN PROGRESS', 'CAR-6124 login'],
    ['Docs · Notes · Done', 'Docs · Notes'],
    ['CAR-6124 ·  Done ', 'CAR-6124'],
  ])('strips the known suffix of "%s"', (title, expected) => {
    expect(stripStatusSuffix(title, labels)).toBe(expected);
  });

  it.each([
    ['CAR-6124', 'no separator'],
    ['CAR-6124 · Staging', 'an unknown label'],
    ['CAR-6124 · ', 'an empty suffix'],
    ['CAR-6124·STG', 'a separator without spaces'],
    ['', 'an empty title'],
  ])('returns null for "%s" (%s)', (title) => {
    expect(stripStatusSuffix(title, labels)).toBeNull();
  });
});
