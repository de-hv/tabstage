import { describe, expect, it } from 'vitest';

import type { Group, Status } from '../api/types';
import { groupByStatus } from './board';

const statuses: Status[] = [
  { id: 'todo', label: 'To do', color: 'lavender' },
  { id: 'done', label: 'Done', color: 'green' },
];

function tab(id: string, status?: string) {
  return { id, url: `https://${id}.dev/`, title: id, ...(status ? { status } : {}) };
}

function group(children: Group['children']): Group {
  return { id: 'g', name: 'G', color: 'blue', browser: { kind: 'default' }, children };
}

function summary(tiles: ReturnType<typeof groupByStatus>) {
  return tiles.map((tile) => ({
    status: tile.status?.id ?? null,
    items: tile.items.map((item) =>
      item.kind === 'folder' ? `folder:${item.folder.name}` : `${item.folder ? `${item.folder.name}/` : ''}${item.tab.id}`,
    ),
  }));
}

describe('groupByStatus', () => {
  it('returns one tile per status plus a last tile without status', () => {
    expect(summary(groupByStatus(group([]), statuses))).toEqual([
      { status: 'todo', items: [] },
      { status: 'done', items: [] },
      { status: null, items: [] },
    ]);
  });

  it('places loose tabs by their own status', () => {
    const tiles = groupByStatus(group([{ type: 'tab', ...tab('a', 'done') }, { type: 'tab', ...tab('b') }]), statuses);

    expect(summary(tiles)).toEqual([
      { status: 'todo', items: [] },
      { status: 'done', items: ['a'] },
      { status: null, items: ['b'] },
    ]);
  });

  it('keeps a folder with a status together in its tile', () => {
    const tiles = groupByStatus(
      group([
        {
          type: 'folder',
          id: 'f',
          name: 'Sprint',
          status: 'todo',
          collapsed: false,
          tabs: [tab('a', 'done'), tab('b')],
        },
      ]),
      statuses,
    );

    expect(summary(tiles)[0]).toEqual({ status: 'todo', items: ['folder:Sprint'] });
    expect(summary(tiles)[1]?.items).toEqual([]);
  });

  it('spreads the tabs of a folder without status by their own status', () => {
    const tiles = groupByStatus(
      group([
        { type: 'folder', id: 'f', name: 'Reading', collapsed: false, tabs: [tab('a', 'done'), tab('b')] },
      ]),
      statuses,
    );

    expect(summary(tiles)).toEqual([
      { status: 'todo', items: [] },
      { status: 'done', items: ['Reading/a'] },
      { status: null, items: ['Reading/b'] },
    ]);
  });

  it('treats an unknown status as no status', () => {
    const tiles = groupByStatus(group([{ type: 'tab', ...tab('a', 'ghost') }]), statuses);

    expect(summary(tiles).at(-1)).toEqual({ status: null, items: ['a'] });
  });
});
