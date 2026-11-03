import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { StatusBuilder } from '../__mocks__/status.builder';
import { StatusMother } from '../__mocks__/status.mother';
import {
  DEFAULT_STATUSES,
  addStatus,
  findStatusByLabel,
  getStatuses,
  moveStatus,
  recolorStatus,
  removeStatus,
  renameStatus,
  resetStatuses,
  saveStatuses,
  statusesItem,
} from './statuses';
import type { Status } from './types';

const orders = (statuses: Status[]) => statuses.map((status) => status.order);
const ids = (statuses: Status[]) => statuses.map((status) => status.id);
const contiguous = (length: number) => Array.from({ length }, (_, i) => i);

describe('DEFAULT_STATUSES', () => {
  it('lists the 8 English statuses with their colors, in order', () => {
    expect(DEFAULT_STATUSES).toEqual(StatusMother.defaults());
  });

  it('has unique ids and labels', () => {
    expect(new Set(DEFAULT_STATUSES.map((s) => s.id)).size).toBe(8);
    expect(new Set(DEFAULT_STATUSES.map((s) => s.label)).size).toBe(8);
  });
});

describe('storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('getStatuses', () => {
    it('falls back to the defaults when nothing is stored', async () => {
      expect(await getStatuses()).toEqual(StatusMother.defaults());
    });

    it('returns stored statuses sorted by order', async () => {
      const qa = new StatusBuilder().with({ order: 0 }).build();
      const done = { ...StatusMother.done(), order: 1 };
      await statusesItem.setValue([done, qa]);

      expect(await getStatuses()).toEqual([qa, done]);
    });

    it('returns copies, so callers cannot change the fallback', async () => {
      const [first] = await getStatuses();
      first!.label = 'Changed';

      expect((await getStatuses())[0]?.label).toBe('To do');
      expect(DEFAULT_STATUSES[0]?.label).toBe('To do');
    });
  });

  describe('saveStatuses', () => {
    it('stores the list in sync:statuses with contiguous order', async () => {
      const qa = new StatusBuilder().with({ order: 4 }).build();
      const stg = { ...StatusMother.stg(), order: 9 };

      await saveStatuses([stg, qa]);

      expect(await fakeBrowser.storage.sync.get('statuses')).toEqual({
        statuses: [
          { ...qa, order: 0 },
          { ...stg, order: 1 },
        ],
      });
    });
  });

  describe('resetStatuses', () => {
    it('stores the defaults again', async () => {
      await saveStatuses([new StatusBuilder().build()]);

      await resetStatuses();

      expect(await statusesItem.getValue()).toEqual(StatusMother.defaults());
    });
  });
});

describe('addStatus', () => {
  it('appends the status with the next order', () => {
    const result = addStatus(StatusMother.defaults(), {
      label: 'QA',
      color: 'red',
    });

    expect(result.at(-1)).toEqual({
      id: 'qa',
      label: 'QA',
      color: 'red',
      order: 8,
    });
    expect(orders(result)).toEqual(contiguous(9));
  });

  it.each([
    ['Code review', 'code-review'],
    ['  UAT / Sign-off ', 'uat-sign-off'],
    ['🚀', 'status'],
  ])('makes the id from the label "%s"', (label, id) => {
    expect(addStatus([], { label, color: 'red' })[0]?.id).toBe(id);
  });

  it('adds a suffix when the id is taken', () => {
    const once = addStatus(StatusMother.defaults(), {
      label: 'Done',
      color: 'red',
    });
    const twice = addStatus(once, { label: 'done', color: 'red' });

    expect(ids(twice).slice(-2)).toEqual(['done-2', 'done-3']);
  });

  it('does not mutate its input', () => {
    const input = StatusMother.defaults();

    addStatus(input, { label: 'QA', color: 'red' });

    expect(input).toEqual(StatusMother.defaults());
  });
});

describe('removeStatus', () => {
  it('removes the status and closes the order gap', () => {
    const result = removeStatus(StatusMother.defaults(), 'review');

    expect(ids(result)).not.toContain('review');
    expect(orders(result)).toEqual(contiguous(7));
  });

  it('returns an equal list when the id is unknown', () => {
    expect(removeStatus(StatusMother.defaults(), 'nope')).toEqual(
      StatusMother.defaults(),
    );
  });

  it('does not mutate its input', () => {
    const input = StatusMother.defaults();

    removeStatus(input, 'todo');

    expect(input).toEqual(StatusMother.defaults());
  });
});

describe('renameStatus', () => {
  it('changes the label and keeps the id, color and order', () => {
    const result = renameStatus(StatusMother.defaults(), 'stg', 'Staging');

    expect(result[5]).toEqual({ ...StatusMother.stg(), label: 'Staging' });
    expect(orders(result)).toEqual(contiguous(8));
  });

  it('returns an equal list when the id is unknown', () => {
    expect(renameStatus(StatusMother.defaults(), 'nope', 'X')).toEqual(
      StatusMother.defaults(),
    );
  });

  it('does not mutate its input', () => {
    const input = StatusMother.defaults();

    renameStatus(input, 'stg', 'Staging');

    expect(input).toEqual(StatusMother.defaults());
  });
});

describe('recolorStatus', () => {
  it('changes the color and keeps the rest', () => {
    const result = recolorStatus(StatusMother.defaults(), 'dev', 'red');

    expect(result[3]).toEqual({ ...StatusMother.dev(), color: 'red' });
    expect(orders(result)).toEqual(contiguous(8));
  });

  it('does not mutate its input', () => {
    const input = StatusMother.defaults();

    recolorStatus(input, 'dev', 'red');

    expect(input).toEqual(StatusMother.defaults());
  });
});

describe('moveStatus', () => {
  it.each([
    ['down', 'todo', 2, ['in-progress', 'review', 'todo']],
    ['up', 'review', 0, ['review', 'todo', 'in-progress']],
    ['to the same index', 'in-progress', 1, ['todo', 'in-progress', 'review']],
    ['past the end (clamped)', 'todo', 99, ['in-progress', 'review', 'todo']],
    ['before the start (clamped)', 'review', -5, ['review', 'todo', 'in-progress']],
  ])('moves a status %s', (_, id, toIndex, expected) => {
    const input = StatusMother.defaults().slice(0, 3);

    const result = moveStatus(input, id, toIndex);

    expect(ids(result)).toEqual(expected);
    expect(orders(result)).toEqual(contiguous(3));
  });

  it('returns an equal list when the id is unknown', () => {
    expect(moveStatus(StatusMother.defaults(), 'nope', 0)).toEqual(
      StatusMother.defaults(),
    );
  });

  it('does not mutate its input', () => {
    const input = StatusMother.defaults();

    moveStatus(input, 'done', 0);

    expect(input).toEqual(StatusMother.defaults());
  });
});

describe('list helpers with gaps in order', () => {
  it('sort by order and renumber from 0', () => {
    const a = new StatusBuilder().with({ id: 'a', label: 'A', order: 10 }).build();
    const b = new StatusBuilder().with({ id: 'b', label: 'B', order: 3 }).build();

    const result = renameStatus([a, b], 'a', 'A2');

    expect(result).toEqual([
      { ...b, order: 0 },
      { ...a, label: 'A2', order: 1 },
    ]);
  });
});

describe('findStatusByLabel', () => {
  it.each(['STG', 'stg', 'Stg', '  stg  '])('finds STG from "%s"', (label) => {
    expect(findStatusByLabel(StatusMother.defaults(), label)).toEqual(
      StatusMother.stg(),
    );
  });

  it('matches multi-word labels ignoring case', () => {
    expect(findStatusByLabel(StatusMother.defaults(), 'IN PROGRESS')).toEqual(
      StatusMother.inProgress(),
    );
  });

  it.each(['Staging', '', 'ST G'])(
    'returns undefined for the unknown label "%s"',
    (label) => {
      expect(findStatusByLabel(StatusMother.defaults(), label)).toBeUndefined();
    },
  );
});
