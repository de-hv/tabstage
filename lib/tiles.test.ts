import { describe, expect, it } from 'vitest';
import { BoardGroupBuilder } from '../__mocks__/board-group.builder';
import { BoardMother } from '../__mocks__/board.mother';
import { ItemBuilder } from '../__mocks__/item.builder';
import { StatusMother } from '../__mocks__/status.mother';
import { buildTiles, type Tile } from './tiles';

const statuses = StatusMother.defaults();
const summary = (tiles: Tile[]) =>
  tiles.map((tile) => ({
    status: tile.status.id,
    groups: tile.groups.map((view) => [view.group.name, view.items.map((item) => item.title)]),
    items: tile.items.map((item) => item.title),
    count: tile.count,
    empty: tile.empty,
  }));

describe('buildTiles', () => {
  it('builds one tile per status in order, with groups then loose items', () => {
    expect(summary(buildTiles(BoardMother.sample(), statuses))).toEqual([
      { status: 'todo', groups: [], items: ['CAR-6124 · Login fix', 'Docs guide'], count: 2, empty: false },
      { status: 'in-progress', groups: [['CAR-6115', ['PR #42', 'CAR-6115 spec']]], items: [], count: 2, empty: false },
      { status: 'in-review', groups: [], items: [], count: 0, empty: true },
      { status: 'in-dev', groups: [], items: [], count: 0, empty: true },
      { status: 'done', groups: [], items: [], count: 0, empty: true },
    ]);
  });

  it('sorts statuses by order', () => {
    const reversed = statuses.map((status) => ({ ...status, order: 10 - status.order }));

    expect(buildTiles(BoardMother.empty(), reversed).map((tile) => tile.status.id)).toEqual([
      'done',
      'in-dev',
      'in-review',
      'in-progress',
      'todo',
    ]);
  });

  it('shows a grouped item in its group status, not its own', () => {
    const board = {
      groups: [new BoardGroupBuilder().with({ statusId: 'done' }).build()],
      items: [new ItemBuilder().with({ groupId: 'group-1', statusId: 'todo' }).build()],
    };

    const tiles = buildTiles(board, statuses);

    expect(tiles.at(-1)?.count).toBe(1);
    expect(tiles[0]?.empty).toBe(true);
  });

  it('puts groups and items of an unknown status in the first tile', () => {
    const board = {
      groups: [new BoardGroupBuilder().with({ statusId: 'gone' }).build()],
      items: [new ItemBuilder().with({ statusId: 'gone' }).build()],
    };

    expect(buildTiles(board, statuses)[0]?.count).toBe(1);
    expect(buildTiles(board, statuses)[0]?.groups).toHaveLength(1);
  });

  describe('with a filter', () => {
    it.each(['docs', '  DOCS ', 'docs.example'])('matches items by title or URL with "%s"', (filter) => {
      expect(summary(buildTiles(BoardMother.sample(), statuses, filter))[0]?.items).toEqual(['Docs guide']);
    });

    it('keeps every item of a group whose name matches', () => {
      expect(summary(buildTiles(BoardMother.sample(), statuses, 'car-6115'))[1]?.groups).toEqual([
        ['CAR-6115', ['PR #42', 'CAR-6115 spec']],
      ]);
    });

    it('keeps only matching items of other groups and drops groups with none', () => {
      const tiles = summary(buildTiles(BoardMother.sample(), statuses, 'pr #42'));

      expect(tiles[1]).toMatchObject({ groups: [['CAR-6115', ['PR #42']]], count: 1 });
      expect(summary(buildTiles(BoardMother.sample(), statuses, 'login'))[1]).toMatchObject({ groups: [], empty: true });
    });

    it('keeps a tile for every status', () => {
      expect(buildTiles(BoardMother.sample(), statuses, 'nothing matches')).toHaveLength(5);
    });
  });
});
