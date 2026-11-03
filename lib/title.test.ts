import { describe, expect, it } from 'vitest';
import { StatusBuilder } from '../__mocks__/status.builder';
import { StatusMother } from '../__mocks__/status.mother';
import { extractTicketKey, formatTitle, parseTitle } from './title';

const statuses = StatusMother.defaults();

describe('parseTitle', () => {
  it('splits the name and the status', () => {
    expect(parseTitle('CAR-6124 · STG', statuses)).toEqual({
      name: 'CAR-6124',
      ticketKey: 'CAR-6124',
      statusId: 'stg',
    });
  });

  it.each([
    ['CAR-6124 · stg', 'stg'],
    ['CAR-6124 · Stg', 'stg'],
    ['CAR-6124 · IN PROGRESS', 'in-progress'],
    ['CAR-6124 · done', 'done'],
  ])('matches the label ignoring case in "%s"', (title, statusId) => {
    expect(parseTitle(title, statuses)).toMatchObject({
      name: 'CAR-6124',
      statusId,
    });
  });

  it('returns no status when the title has no separator', () => {
    expect(parseTitle('CAR-6124 login fix', statuses)).toEqual({
      name: 'CAR-6124 login fix',
      ticketKey: 'CAR-6124',
      statusId: null,
    });
  });

  it('keeps the whole title as the name when the label is unknown', () => {
    expect(parseTitle('CAR-6124 · Staging', statuses)).toEqual({
      name: 'CAR-6124 · Staging',
      ticketKey: 'CAR-6124',
      statusId: null,
    });
  });

  it('uses the last separator when the name has more', () => {
    expect(parseTitle('CAR-6124 · login · fix · Review', statuses)).toEqual({
      name: 'CAR-6124 · login · fix',
      ticketKey: 'CAR-6124',
      statusId: 'review',
    });
  });

  it('does not match a status before the last separator', () => {
    expect(parseTitle('CAR-6124 · Dev · notes', statuses)).toMatchObject({
      name: 'CAR-6124 · Dev · notes',
      statusId: null,
    });
  });

  it.each([
    ['a separator with no label', 'CAR-6124 · '],
    ['a dot without spaces', 'CAR-6124·STG'],
    ['a hyphen instead of the dot', 'CAR-6124 - STG'],
  ])('returns no status for %s', (_, title) => {
    expect(parseTitle(title, statuses).statusId).toBeNull();
  });

  it('trims the name', () => {
    expect(parseTitle('  CAR-6124   · Dev', statuses).name).toBe('CAR-6124');
  });

  it('falls back to the name when there is no ticket key', () => {
    expect(parseTitle('Groceries · To do', statuses)).toEqual({
      name: 'Groceries',
      ticketKey: 'Groceries',
      statusId: 'todo',
    });
  });

  it('handles an empty title', () => {
    expect(parseTitle('', statuses)).toEqual({
      name: '',
      ticketKey: '',
      statusId: null,
    });
  });

  it('returns no status when the list is empty', () => {
    expect(parseTitle('CAR-6124 · STG', []).statusId).toBeNull();
  });

  it('matches custom statuses', () => {
    const qa = new StatusBuilder().build();

    expect(parseTitle('CAR-1 · qa', [qa]).statusId).toBe('qa');
  });
});

describe('formatTitle', () => {
  it('joins the name and the status label', () => {
    expect(formatTitle('CAR-6124', StatusMother.stg())).toBe('CAR-6124 · STG');
  });

  it('returns the name alone when there is no status', () => {
    expect(formatTitle('CAR-6124', null)).toBe('CAR-6124');
  });

  it('trims the name', () => {
    expect(formatTitle('  CAR-6124 ', StatusMother.dev())).toBe('CAR-6124 · Dev');
  });
});

describe('formatTitle → parseTitle round trip', () => {
  it.each(statuses.map((status) => [status.label, status] as const))(
    'returns the name and id for "%s"',
    (_, status) => {
      const name = 'CAR-6124 · login fix';

      expect(parseTitle(formatTitle(name, status), statuses)).toEqual({
        name,
        ticketKey: 'CAR-6124',
        statusId: status.id,
      });
    },
  );

  it('returns no status when formatted without one', () => {
    expect(parseTitle(formatTitle('CAR-6124', null), statuses)).toEqual({
      name: 'CAR-6124',
      ticketKey: 'CAR-6124',
      statusId: null,
    });
  });
});

describe('extractTicketKey', () => {
  it.each([
    ['CAR-6124', 'CAR-6124'],
    ['CAR-6124 login fix', 'CAR-6124'],
    ['fix for CAR-6124', 'CAR-6124'],
    ['AB2-7', 'AB2-7'],
    ['CAR-1 and WEB-2', 'CAR-1'],
  ])('finds the key in "%s"', (name, key) => {
    expect(extractTicketKey(name)).toBe(key);
  });

  it.each([
    ['lowercase keys', 'car-6124', 'car-6124'],
    ['single-letter projects', 'A-1 notes', 'A-1 notes'],
    ['keys with no number', 'CAR- draft', 'CAR- draft'],
    ['plain names', '  Groceries  ', 'Groceries'],
    ['empty names', '', ''],
  ])('falls back to the trimmed name for %s', (_, name, expected) => {
    expect(extractTicketKey(name)).toBe(expected);
  });
});
