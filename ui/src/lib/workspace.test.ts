import { describe, expect, it } from 'vitest';

import { snapshotFixture } from '../test/ipc';
import {
  CARRIER,
  DONE,
  IN_TEST,
  MONEY,
  ONBOARDING,
  REMOVE_MAP,
  REVIEW,
  STANDUP,
  TRABAJO,
} from '../test/render';
import {
  findTicket,
  laneIndex,
  lanes,
  mentionsOf,
  pinnedIndex,
  pinnedItems,
  ticketsByKey,
} from './workspace';

const workspace = () => snapshotFixture().workspace;
const trabajo = () => workspace().profiles[0]!;

describe('lookups', () => {
  it('finds tickets and sub-tickets with what holds them', () => {
    expect(findTicket(workspace(), MONEY)).toMatchObject({ profile: { id: TRABAJO }, parent: { id: CARRIER } });
    expect(findTicket(workspace(), CARRIER)?.parent).toBeUndefined();
    expect(findTicket(workspace(), 'nope')).toBeNull();
  });

  it('finds the notes that mention a key, whole words only', () => {
    expect(mentionsOf(workspace(), 'CAR-6163').map(({ note }) => note.id)).toEqual([STANDUP]);
    expect(mentionsOf(workspace(), 'CAR-616')).toEqual([]);
    expect(mentionsOf(workspace(), undefined)).toEqual([]);
  });

  it('maps keys in upper case to their tickets', () => {
    const keys = ticketsByKey(workspace());
    expect(keys.get('CAR-6020')?.id).toBe(MONEY);
    expect(keys.size).toBe(3);
  });
});

describe('lanes', () => {
  it('sorts a profile’s tickets by status, in workflow order, with "No status" last', () => {
    const result = lanes(workspace(), trabajo()).map((lane) => [lane.status?.id ?? null, lane.tickets.map((t) => t.id)]);
    expect(result).toEqual([
      [REVIEW, [REMOVE_MAP]],
      [IN_TEST, [CARRIER]],
      [DONE, []],
      [null, [ONBOARDING]],
    ]);
  });

  it('treats a status that no longer exists as none', () => {
    const changed = workspace();
    changed.statuses = changed.statuses.filter((status) => status.id !== REVIEW);
    const none = lanes(changed, changed.profiles[0]!).at(-1)!;
    expect(none.tickets.map((t) => t.id)).toEqual([REMOVE_MAP, ONBOARDING]);
  });

  it('gives the index to insert at the end of a lane or before a ticket', () => {
    const profile = trabajo();
    const [review, test, done] = lanes(workspace(), profile);
    expect(laneIndex(profile, review!)).toBe(2);
    expect(laneIndex(profile, test!)).toBe(1);
    expect(laneIndex(profile, done!)).toBe(3);
    expect(laneIndex(profile, review!, CARRIER)).toBe(0);
  });
});

describe('pinned', () => {
  it('lists pinned items that still exist, in order', () => {
    const changed = { ...workspace(), pinned: [{ note: STANDUP }, { ticket: 'gone' }, { ticket: MONEY }] };
    expect(pinnedItems(changed).map((entry) => [entry.kind, entry.item.id])).toEqual([
      ['note', STANDUP],
      ['ticket', MONEY],
    ]);
    expect(pinnedIndex(changed, { ticket: MONEY })).toBe(2);
    expect(pinnedIndex(changed, { note: MONEY })).toBe(-1);
  });
});
