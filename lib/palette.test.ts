import { describe, expect, it } from 'vitest';
import { BoardMother } from '../__mocks__/board.mother';
import { ItemBuilder } from '../__mocks__/item.builder';
import { StatusMother } from '../__mocks__/status.mother';
import { MAX_RESULTS, parseCommand, scoreName, type PaletteAction } from './palette';

const statuses = StatusMother.defaults();
const board = BoardMother.sample();

function describeAction(action: PaletteAction): string {
  switch (action.kind) {
    case 'open-item':
      return `open ${action.item.id}`;
    case 'show-group':
      return `group ${action.group.id}`;
    case 'move-item':
      return `move ${action.item.id} → ${action.status.id}`;
    case 'move-group':
      return `move ${action.group.id} → ${action.status.id}`;
    case 'add-tab':
      return `add → ${action.status.id}`;
  }
}

const run = (input: string) => parseCommand(input, board, statuses).map(describeAction);

describe('scoreName', () => {
  it.each([
    ['CAR-6115', 'car-6115', 100],
    ['CAR-6115 spec', '6115', 90],
    ['CAR-6115 spec', 'car', 70],
    ['CAR-6115 spec', '115', 70],
    ['Release notes', 'notes', 50],
    ['Release notes', 'zzz', 0],
  ])('scores "%s" for "%s" as %i', (name, query, score) => {
    expect(scoreName(name, query)).toBe(score);
  });
});

describe('parseCommand', () => {
  it('lists every group, then every item, for an empty query', () => {
    expect(run('  ')).toEqual(['group group-1', 'open item-1', 'open item-2', 'open item-3', 'open item-4']);
  });

  it('finds items by title and URL, and groups by name', () => {
    expect(run('docs')).toEqual(['open item-2']);
    expect(run('github.com')).toEqual(['open item-3']);
    expect(run('car-6115')[0]).toBe('group group-1');
  });

  it('moves a group with "<number> <status>"', () => {
    expect(run('6115 done')[0]).toBe('move group-1 → done');
  });

  it('moves an item with "<title> <status>", also with a status prefix', () => {
    expect(run('docs in r')).toContain('move item-2 → in-review');
    expect(run('docs in')).toEqual(
      expect.arrayContaining(['move item-2 → in-progress', 'move item-2 → in-review', 'move item-2 → in-dev']),
    );
  });

  it('does not offer a move to the status the item is already in', () => {
    expect(run('docs to do')).not.toContain('move item-2 → todo');
  });

  it('lists the groups and items of a status', () => {
    expect(run('in progress')).toEqual(['group group-1', 'open item-3', 'open item-4']);
  });

  it('offers to add the current tab to each status with "add"', () => {
    expect(run('add')).toEqual(['add → todo', 'add → in-progress', 'add → in-review', 'add → in-dev', 'add → done']);
  });

  it('adds to a named status with "add <status>"', () => {
    expect(run('add done')).toEqual(['add → done']);
  });

  it('marks closed items so the panel can reopen them', () => {
    const [action] = parseCommand('docs', board, statuses);

    expect(action).toMatchObject({ kind: 'open-item', item: { tabId: null }, status: { id: 'todo' } });
  });

  it('returns at most MAX_RESULTS results', () => {
    const many = {
      groups: [],
      items: Array.from({ length: 80 }, (_, i) =>
        new ItemBuilder().with({ id: `i${i}`, title: `Page ${i}`, order: i }).build(),
      ),
    };

    expect(parseCommand('page', many, statuses)).toHaveLength(MAX_RESULTS);
  });

  it('returns nothing for text that matches nothing', () => {
    expect(run('zzzz')).toEqual([]);
  });
});
