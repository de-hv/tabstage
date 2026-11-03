import { describe, expect, it } from 'vitest';
import { GroupTabBuilder } from '../__mocks__/group-tab.builder';
import { GroupBuilder } from '../__mocks__/group.builder';
import { StatusBuilder } from '../__mocks__/status.builder';
import { StatusMother } from '../__mocks__/status.mother';
import { buildLanes, NO_STATUS_LANE_ID } from './lanes';

const ids = (lanes: ReturnType<typeof buildLanes>) => lanes.map((lane) => lane.id);

describe('buildLanes', () => {
  it('puts "No status" first, then one lane per status in configured order', () => {
    const statuses = [
      { ...StatusMother.todo(), order: 1 },
      { ...StatusMother.done(), order: 0 },
    ];

    const lanes = buildLanes([], statuses, '');

    expect(ids(lanes)).toEqual([NO_STATUS_LANE_ID, 'done', 'todo']);
    expect(lanes[0]).toMatchObject({ statusId: null, label: 'No status', color: null });
    expect(lanes[1]).toMatchObject({ statusId: 'done', label: 'Done', color: 'green' });
  });

  it('returns every lane with a zero count when there are no groups', () => {
    const lanes = buildLanes([], StatusMother.defaults(), '');

    expect(lanes).toHaveLength(9);
    expect(lanes.every((lane) => lane.count === 0 && lane.groups.length === 0)).toBe(true);
  });

  it('places each group in its status lane and counts it, keeping input order', () => {
    const groups = [
      new GroupBuilder().with({ id: 1, statusId: 'stg' }).build(),
      new GroupBuilder().with({ id: 2, statusId: 'todo' }).build(),
      new GroupBuilder().with({ id: 3, statusId: 'stg' }).build(),
    ];

    const lanes = buildLanes(groups, StatusMother.defaults(), '');
    const stg = lanes.find((lane) => lane.id === 'stg');
    const todo = lanes.find((lane) => lane.id === 'todo');

    expect(stg?.groups.map((g) => g.id)).toEqual([1, 3]);
    expect(stg?.count).toBe(2);
    expect(todo?.count).toBe(1);
  });

  it('puts groups with no status, or a status not configured, in "No status"', () => {
    const groups = [
      new GroupBuilder().with({ id: 1, statusId: null }).build(),
      new GroupBuilder().with({ id: 2, statusId: 'qa' }).build(),
    ];

    const [noStatus] = buildLanes(groups, StatusMother.defaults(), '');

    expect(noStatus?.groups.map((g) => g.id)).toEqual([1, 2]);
    expect(noStatus?.count).toBe(2);
  });

  it('uses the label and color of custom statuses', () => {
    const qa = new StatusBuilder().with({ id: 'qa', label: 'QA', color: 'red' }).build();

    const lanes = buildLanes([], [qa], '');

    expect(lanes[1]).toMatchObject({ id: 'qa', label: 'QA', color: 'red' });
  });

  describe('with a filter', () => {
    const groups = [
      new GroupBuilder()
        .with({ id: 1, name: 'CAR-6124 login fix', ticketKey: 'CAR-6124', statusId: 'stg' })
        .build(),
      new GroupBuilder()
        .with({
          id: 2,
          name: 'CAR-7000 payments',
          ticketKey: 'CAR-7000',
          statusId: 'todo',
          tabs: [new GroupTabBuilder().with({ title: 'Stripe dashboard' }).build()],
        })
        .build(),
      new GroupBuilder()
        .with({ id: 3, name: 'Research', ticketKey: 'Research', statusId: null })
        .build(),
    ];

    it.each([
      ['the group name', 'login', [1]],
      ['the ticket key', 'car-7000', [2]],
      ['a tab title', 'STRIPE', [2]],
      ['a term shared by several groups', 'car-', [1, 2]],
    ])('matches %s, ignoring case', (_what, filter, expected) => {
      const lanes = buildLanes(groups, StatusMother.defaults(), filter);

      expect(lanes.flatMap((lane) => lane.groups.map((g) => g.id)).sort()).toEqual(expected);
    });

    it('drops lanes with no match and counts only matches', () => {
      const lanes = buildLanes(groups, StatusMother.defaults(), 'login');

      expect(lanes).toEqual([expect.objectContaining({ id: 'stg', count: 1 })]);
    });

    it('returns no lanes when nothing matches', () => {
      expect(buildLanes(groups, StatusMother.defaults(), 'nothing')).toEqual([]);
    });

    it('ignores a filter of only spaces', () => {
      expect(buildLanes(groups, StatusMother.defaults(), '   ')).toHaveLength(9);
    });

    it('trims the filter', () => {
      const lanes = buildLanes(groups, StatusMother.defaults(), '  research ');

      expect(ids(lanes)).toEqual([NO_STATUS_LANE_ID]);
    });
  });
});
