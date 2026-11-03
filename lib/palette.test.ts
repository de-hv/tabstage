import { describe, expect, it } from 'vitest';
import { GroupBuilder } from '@/__mocks__/group.builder';
import { GroupTabBuilder } from '@/__mocks__/group-tab.builder';
import { StatusMother } from '@/__mocks__/status.mother';
import type { Group } from './groups';
import { MAX_RESULTS, parseCommand, scoreGroup, type PaletteAction } from './palette';

const statuses = StatusMother.defaults();

const groups: Group[] = [
  new GroupBuilder()
    .with({
      id: 1,
      title: 'CAR-6115 checkout · In progress',
      name: 'CAR-6115 checkout',
      ticketKey: 'CAR-6115',
      statusId: 'in-progress',
      color: 'blue',
      tabs: [
        new GroupTabBuilder().with({ id: 10, title: 'CAR-6115 · Jira', url: 'https://jira.example.com/browse/CAR-6115' }).build(),
        new GroupTabBuilder().with({ id: 11, title: 'Checkout PR', url: 'https://github.com/acme/shop/pull/42', active: true }).build(),
      ],
    })
    .build(),
  new GroupBuilder()
    .with({
      id: 2,
      title: 'CAR-6124 login fix · STG',
      name: 'CAR-6124 login fix',
      ticketKey: 'CAR-6124',
      statusId: 'stg',
      tabs: [new GroupTabBuilder().with({ id: 20, title: 'Login bug', url: 'https://jira.example.com/browse/CAR-6124' }).build()],
    })
    .build(),
  new GroupBuilder()
    .with({
      id: 3,
      title: 'Research',
      name: 'Research',
      ticketKey: 'Research',
      statusId: null,
      color: 'red',
      tabs: [new GroupTabBuilder().with({ id: 30, title: 'Notes', url: 'https://notes.example.com' }).build()],
    })
    .build(),
  new GroupBuilder()
    .with({
      id: 4,
      title: 'OPS-7115 deploy · STG',
      name: 'OPS-7115 deploy',
      ticketKey: 'OPS-7115',
      statusId: 'stg',
      tabs: [new GroupTabBuilder().with({ id: 40, title: 'Deploy runbook', url: 'https://wiki.example.com/deploy' }).build()],
    })
    .build(),
];

const parse = (input: string, list: readonly Group[] = groups) =>
  parseCommand(input, list, statuses);

/** A short, readable form of each action. */
function describeAction(action: PaletteAction): string {
  switch (action.kind) {
    case 'focus-group':
      return `group ${action.group.id}`;
    case 'focus-tab':
      return `tab ${action.tab.id}`;
    case 'set-status':
      return `set ${action.group.id} ${action.status?.id ?? 'none'}`;
    case 'open-panel':
      return 'panel';
  }
}

const summary = (input: string, list?: readonly Group[]) => parse(input, list).map(describeAction);

describe('parseCommand', () => {
  describe('with an empty input', () => {
    it.each(['', '   '])('lists every group, then "Open side panel" (%j)', (input) => {
      expect(summary(input)).toEqual(['group 1', 'group 2', 'group 3', 'group 4', 'panel']);
    });

    it('focuses the active tab of a group, or its first tab', () => {
      const [first, second] = parse('');

      expect(first).toMatchObject({ kind: 'focus-group', tabId: 11 });
      expect(second).toMatchObject({ kind: 'focus-group', tabId: 20 });
    });

    it('skips groups with no tabs', () => {
      const empty = new GroupBuilder().with({ id: 9, tabs: [] }).build();

      expect(summary('', [empty])).toEqual(['panel']);
    });
  });

  describe('with free text', () => {
    it('finds groups by ticket key, then tabs by title', () => {
      expect(summary('car-6124')).toEqual(['group 2', 'tab 20']);
    });

    it('finds tabs by title or URL', () => {
      expect(summary('runbook')).toEqual(['tab 40']);
      expect(summary('github.com')).toEqual(['tab 11']);
    });

    it('focuses the matched tab', () => {
      expect(parse('login bug')[0]).toMatchObject({ kind: 'focus-tab', tab: { id: 20 }, group: { id: 2 } });
    });

    it('ranks key over number suffix over name', () => {
      // "car-6115" is group 1's key; tab 10's title starts with it too.
      expect(summary('car-6115')).toEqual(['group 1', 'tab 10']);
      // "115" is a number suffix of both CAR-6115 and OPS-7115.
      expect(summary('115')).toEqual(['group 1', 'group 4', 'tab 10']);
    });

    it.each(['RESEARCH', 'research', '  ReSeArCh  '])('ignores case and spaces (%j)', (input) => {
      expect(summary(input)).toEqual(['group 3']);
    });

    it('returns nothing when nothing matches', () => {
      expect(parse('zzz')).toEqual([]);
    });
  });

  describe('with <key|number> <status>', () => {
    it.each([
      ['by full key', 'CAR-6115 dev'],
      ['by number', '6115 dev'],
      ['in upper case', '6115 DEV'],
    ])('sets the status %s', (_, input) => {
      const [first] = parse(input);

      expect(first).toMatchObject({ kind: 'set-status', group: { id: 1 }, status: { id: 'dev' } });
    });

    it('matches a status by its id', () => {
      expect(parse('6124 todo')[0]).toMatchObject({ kind: 'set-status', status: { id: 'todo' } });
    });

    it('matches a status label with spaces', () => {
      expect(parse('6124 in progress')[0]).toMatchObject({
        kind: 'set-status',
        group: { id: 2 },
        status: { id: 'in-progress' },
      });
    });

    it.each(['6115 none', '6115 no status'])('clears the status with %j', (input) => {
      expect(parse(input)[0]).toMatchObject({ kind: 'set-status', group: { id: 1 }, status: null });
    });

    it('offers every status that starts with the given text, exact ones first', () => {
      expect(summary('6115 d')).toEqual(['set 1 dev', 'set 1 done']);
      expect(summary('6115 dev')).toEqual(['set 1 dev']);
    });

    it('offers every group that matches an ambiguous ref, best match first', () => {
      // "115" is a number suffix of both CAR-6115 and OPS-7115: a tie keeps group order.
      expect(summary('115 done')).toEqual(['set 1 done', 'set 4 done']);
      expect(summary('6124 done')).toEqual(['set 2 done']);
    });

    it('skips the status the group already has', () => {
      expect(summary('6124 stg')).toEqual([]);
    });

    it('does not set a status that does not exist', () => {
      expect(parse('6115 xyz')).toEqual([]);
    });
  });

  describe('with <status>', () => {
    it('lists the groups in that status', () => {
      expect(summary('stg')).toEqual(['group 2', 'group 4']);
    });

    it.each(['No status', 'none'])('lists the groups with no status for %j', (input) => {
      expect(summary(input)).toEqual(['group 3']);
    });

    it('matches a status label with spaces', () => {
      expect(summary('In Progress')).toEqual(['group 1']);
    });

    it('lists the groups of a status prefix below exact text matches', () => {
      // "st" starts "STG"; no group name starts with it.
      expect(summary('st')).toEqual(['group 2', 'group 4']);
    });

    it('returns nothing for a status with no groups that matches nothing else', () => {
      expect(parse('prod')).toEqual([]);
    });
  });

  describe('with panel', () => {
    it.each(['panel', 'PANEL', 'sidebar', 'open side panel'])('opens the side panel first (%j)', (input) => {
      expect(parse(input)[0]).toEqual({ kind: 'open-panel', id: 'open-panel' });
    });

    it('offers the panel for a prefix too', () => {
      expect(summary('pan')).toContain('panel');
    });
  });

  it('returns each action once', () => {
    const ids = parse('car').map((action) => action.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it(`returns at most ${MAX_RESULTS} results`, () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      new GroupBuilder()
        .with({ id: 100 + i, tabs: [new GroupTabBuilder().with({ id: 1000 + i }).build()] })
        .build(),
    );

    expect(parse('car', many)).toHaveLength(MAX_RESULTS);
  });
});

describe('scoreGroup', () => {
  const group = groups[0]!;

  it.each([
    ['car-6115', 100],
    ['6115', 90],
    ['car-61', 70],
    ['15', 70],
    ['car-6115 check', 60],
    ['checkout', 50],
    ['zzz', 0],
  ])('scores %j as %i', (query, expected) => {
    expect(scoreGroup(group, query)).toBe(expected);
  });
});
