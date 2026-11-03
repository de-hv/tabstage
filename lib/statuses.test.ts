import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { StatusBuilder } from '../__mocks__/status.builder';
import { StatusMother } from '../__mocks__/status.mother';
import {
  DEFAULT_STATUSES,
  addStatus,
  migrateV1Statuses,
  normalizeStatuses,
  findStatusByLabel,
  getStatuses,
  moveStatus,
  recolorStatus,
  removeStatus,
  renameStatus,
  resetStatuses,
  saveStatuses,
  statusesItem,
  validateStatuses,
} from './statuses';
import type { Status } from './types';

const orders = (statuses: Status[]) => statuses.map((status) => status.order);
const ids = (statuses: Status[]) => statuses.map((status) => status.id);
const contiguous = (length: number) => Array.from({ length }, (_, i) => i);

describe('DEFAULT_STATUSES', () => {
  it('lists To do, In progress, In review, In dev and Done with accents, in order', () => {
    expect(DEFAULT_STATUSES).toEqual(StatusMother.defaults());
  });

  it('has unique ids and labels', () => {
    expect(new Set(DEFAULT_STATUSES.map((s) => s.id)).size).toBe(5);
    expect(new Set(DEFAULT_STATUSES.map((s) => s.label)).size).toBe(5);
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
      const stg = { ...StatusMother.inDev(), order: 9 };

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
      order: 5,
    });
    expect(orders(result)).toEqual(contiguous(6));
  });

  it('inserts the status right after afterId', () => {
    const result = addStatus(StatusMother.defaults(), { label: 'QA', color: 'red' }, 'in-review');

    expect(ids(result)).toEqual(['todo', 'in-progress', 'in-review', 'qa', 'in-dev', 'done']);
    expect(orders(result)).toEqual(contiguous(6));
  });

  it('appends when afterId is unknown', () => {
    expect(ids(addStatus(StatusMother.defaults(), { label: 'QA', color: 'red' }, 'nope')).at(-1)).toBe('qa');
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
    const result = removeStatus(StatusMother.defaults(), 'in-review');

    expect(ids(result)).not.toContain('in-review');
    expect(orders(result)).toEqual(contiguous(4));
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
    const result = renameStatus(StatusMother.defaults(), 'in-dev', 'Staging');

    expect(result[3]).toEqual({ ...StatusMother.inDev(), label: 'Staging' });
    expect(orders(result)).toEqual(contiguous(5));
  });

  it('returns an equal list when the id is unknown', () => {
    expect(renameStatus(StatusMother.defaults(), 'nope', 'X')).toEqual(
      StatusMother.defaults(),
    );
  });

  it('does not mutate its input', () => {
    const input = StatusMother.defaults();

    renameStatus(input, 'in-dev', 'Staging');

    expect(input).toEqual(StatusMother.defaults());
  });
});

describe('recolorStatus', () => {
  it('changes the color and keeps the rest', () => {
    const result = recolorStatus(StatusMother.defaults(), 'in-dev', 'red');

    expect(result[3]).toEqual({ ...StatusMother.inDev(), color: 'red' });
    expect(orders(result)).toEqual(contiguous(5));
  });

  it('does not mutate its input', () => {
    const input = StatusMother.defaults();

    recolorStatus(input, 'in-dev', 'red');

    expect(input).toEqual(StatusMother.defaults());
  });
});

describe('moveStatus', () => {
  it.each([
    ['down', 'todo', 2, ['in-progress', 'in-review', 'todo']],
    ['up', 'in-review', 0, ['in-review', 'todo', 'in-progress']],
    ['to the same index', 'in-progress', 1, ['todo', 'in-progress', 'in-review']],
    ['past the end (clamped)', 'todo', 99, ['in-progress', 'in-review', 'todo']],
    ['before the start (clamped)', 'in-review', -5, ['in-review', 'todo', 'in-progress']],
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
  it.each(['Done', 'done', 'DONE', '  done  '])('finds Done from "%s"', (label) => {
    expect(findStatusByLabel(StatusMother.defaults(), label)).toEqual(
      StatusMother.done(),
    );
  });

  it('matches multi-word labels ignoring case', () => {
    expect(findStatusByLabel(StatusMother.defaults(), 'IN PROGRESS')).toEqual(
      StatusMother.inProgress(),
    );
  });

  it.each(['Staging', '', 'Do ne'])(
    'returns undefined for the unknown label "%s"',
    (label) => {
      expect(findStatusByLabel(StatusMother.defaults(), label)).toBeUndefined();
    },
  );
});

describe('validateStatuses', () => {
  it('accepts the default statuses', () => {
    expect(validateStatuses(StatusMother.defaults())).toEqual([]);
  });

  it('accepts a single status', () => {
    expect(validateStatuses([new StatusBuilder().build()])).toEqual([]);
  });

  it('rejects an empty list', () => {
    expect(validateStatuses([])).toEqual([
      { statusId: null, message: 'Keep at least one status.' },
    ]);
  });

  it.each(['', '   '])('rejects the empty label "%s"', (label) => {
    const status = new StatusBuilder().with({ id: 'qa', label }).build();

    expect(validateStatuses([status])).toEqual([
      { statusId: 'qa', message: 'A status needs a label.' },
    ]);
  });

  it.each(['Dev · QA', 'Dev - QA', 'Dev.QA'])('accepts the label "%s"', (label) => {
    expect(validateStatuses([new StatusBuilder().with({ label }).build()])).toEqual([]);
  });

  it('rejects a color that is not an accent', () => {
    const status = { ...new StatusBuilder().build(), color: 'orange' } as unknown as Status;

    expect(validateStatuses([status])).toEqual([
      { statusId: 'qa', message: '"QA" has an unknown color.' },
    ]);
  });

  it.each(['Done', 'done', 'DONE', ' Done '])(
    'rejects "%s" next to Done, ignoring case and spaces',
    (label) => {
      const copy = new StatusBuilder().with({ id: 'copy', label, order: 8 }).build();

      expect(validateStatuses([...StatusMother.defaults(), copy])).toEqual([
        { statusId: 'done', message: expect.stringContaining('more than one status') },
        { statusId: 'copy', message: expect.stringContaining('more than one status') },
      ]);
    },
  );

  it('reports one error per invalid status', () => {
    const empty = new StatusBuilder().with({ id: 'empty', label: '' }).build();
    const separator = { ...new StatusBuilder().with({ id: 'sep', label: 'A' }).build(), color: 'grey' } as unknown as Status;
    const duplicate = new StatusBuilder().with({ id: 'dup', label: 'done' }).build();

    expect(
      validateStatuses([StatusMother.done(), empty, separator, duplicate]).map(
        (error) => error.statusId,
      ),
    ).toEqual(['done', 'empty', 'sep', 'dup']);
  });
});

describe('normalizeStatuses', () => {
  it('maps a v1 native color to its accent', () => {
    const status = { ...StatusMother.todo(), color: 'grey' } as unknown as Status;

    expect(normalizeStatuses([status])[0]?.color).toBe('lavender');
  });

  it('uses lavender for an unknown color', () => {
    const status = { ...StatusMother.todo(), color: 'black' } as unknown as Status;

    expect(normalizeStatuses([status])[0]?.color).toBe('lavender');
  });
});

describe('migrateV1Statuses', () => {
  it('replaces the untouched v1 defaults with the v2 defaults', () => {
    expect(migrateV1Statuses(StatusMother.v1Defaults())).toEqual(StatusMother.defaults());
  });

  it('keeps a customized v1 list and maps its colors to accents', () => {
    const custom = [
      { id: 'todo', label: 'Backlog', color: 'grey', order: 0 },
      { id: 'stg', label: 'STG', color: 'orange', order: 1 },
      { id: 'qa', label: 'QA', color: 'cyan', order: 2 },
    ];

    expect(migrateV1Statuses(custom)).toEqual([
      { id: 'todo', label: 'Backlog', color: 'lavender', order: 0 },
      { id: 'stg', label: 'STG', color: 'peach', order: 1 },
      { id: 'qa', label: 'QA', color: 'teal', order: 2 },
    ]);
  });

  it.each([null, undefined, [], 'statuses'])('returns the defaults for %j', (value) => {
    expect(migrateV1Statuses(value)).toEqual(StatusMother.defaults());
  });

  describe('through statusesItem', () => {
    beforeEach(() => {
      fakeBrowser.reset();
    });

    it('migrates a v1 value stored with no version', async () => {
      await fakeBrowser.storage.sync.set({ statuses: StatusMother.v1Defaults() });

      await statusesItem.migrate();

      expect(await getStatuses()).toEqual(StatusMother.defaults());
    });
  });
});
