import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '../__mocks__/fake-tab-groups';
import { StatusMother } from '../__mocks__/status.mother';
import { TabGroupBuilder } from '../__mocks__/tab-group.builder';
import { statusBackupItem } from './backup';
import { migrateTitles } from './migrate';
import {
  addStatus,
  moveStatus,
  recolorStatus,
  removeStatus,
  renameStatus,
} from './statuses';

let fake: FakeTabGroups;
const prev = StatusMother.defaults();

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabGroups.install().with({
    groups: [
      new TabGroupBuilder().with({ id: 1, title: 'CAR-6124 · STG', color: 'orange' }).build(),
      new TabGroupBuilder().with({ id: 2, title: 'CAR-6115 fix · stg', color: 'red' }).build(),
      new TabGroupBuilder().with({ id: 3, title: 'CAR-6100 · Dev', color: 'cyan' }).build(),
      new TabGroupBuilder().with({ id: 4, title: 'Research', color: 'grey' }).build(),
    ],
  });
});

afterEach(() => {
  fake.uninstall();
});

const titles = () => fake.groups.map((group) => group.title);
const colors = () => fake.groups.map((group) => group.color);

describe('migrateTitles', () => {
  it('replaces the label of a renamed status and keeps the colors', async () => {
    const count = await migrateTitles(prev, renameStatus(prev, 'stg', 'Staging'));

    expect(count).toBe(2);
    expect(titles()).toEqual([
      'CAR-6124 · Staging',
      'CAR-6115 fix · Staging',
      'CAR-6100 · Dev',
      'Research',
    ]);
    expect(colors()).toEqual(['orange', 'red', 'cyan', 'grey']);
    expect(fake.updates[0]?.properties).toEqual({ title: 'CAR-6124 · Staging' });
  });

  it('sets the new color of a recolored status', async () => {
    const count = await migrateTitles(prev, recolorStatus(prev, 'stg', 'blue'));

    expect(count).toBe(2);
    expect(colors()).toEqual(['blue', 'blue', 'cyan', 'grey']);
    expect(titles()[1]).toBe('CAR-6115 fix · STG');
  });

  it('writes the label and the color together when both change', async () => {
    const next = recolorStatus(renameStatus(prev, 'dev', 'Develop'), 'dev', 'green');

    await migrateTitles(prev, next);

    expect(fake.updates).toEqual([
      { groupId: 3, properties: { title: 'CAR-6100 · Develop', color: 'green' } },
    ]);
  });

  it('strips the suffix of a deleted status and keeps the color', async () => {
    const count = await migrateTitles(prev, removeStatus(prev, 'stg'));

    expect(count).toBe(2);
    expect(titles()).toEqual(['CAR-6124', 'CAR-6115 fix', 'CAR-6100 · Dev', 'Research']);
    expect(colors()).toEqual(['orange', 'red', 'cyan', 'grey']);
  });

  it('drops the backup entries of a deleted status', async () => {
    await statusBackupItem.setValue({ 'CAR-6124': 'stg', 'CAR-6100': 'dev' });

    await migrateTitles(prev, removeStatus(prev, 'stg'));

    expect(await statusBackupItem.getValue()).toEqual({ 'CAR-6100': 'dev' });
  });

  it.each([
    ['nothing changed', prev],
    ['a status was only moved', moveStatus(prev, 'stg', 0)],
    ['a status was added', addStatus(prev, { label: 'QA', color: 'red' })],
  ])('does nothing when %s', async (_case, next) => {
    const query = vi.spyOn(fakeBrowser.tabGroups, 'query');

    expect(await migrateTitles(prev, next)).toBe(0);

    expect(query).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });

  it('skips a group whose title already matches', async () => {
    fake.with({
      groups: [new TabGroupBuilder().with({ id: 1, title: 'CAR-1 · stg' }).build()],
    });
    const next = renameStatus(prev, 'stg', 'stg');

    expect(await migrateTitles(prev, next)).toBe(0);
  });

  it('matches statuses by id, not by position', async () => {
    const next = renameStatus(moveStatus(prev, 'stg', 0), 'stg', 'Staging');

    await migrateTitles(prev, next);

    expect(titles()[0]).toBe('CAR-6124 · Staging');
    expect(titles()[2]).toBe('CAR-6100 · Dev');
  });
});
