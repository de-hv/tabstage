import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '../__mocks__/fake-tab-groups';
import { StatusBuilder } from '../__mocks__/status.builder';
import { TabGroupBuilder } from '../__mocks__/tab-group.builder';
import {
  forget,
  forgetStatuses,
  remember,
  restore,
  statusBackupItem,
} from './backup';
import { statusesItem } from './statuses';

let fake: FakeTabGroups;

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabGroups.install();
});

afterEach(() => {
  fake.uninstall();
});

const group = (title: string | undefined, id = 1) =>
  new TabGroupBuilder().with({ id, title, color: 'grey' }).build();

describe('statusBackupItem', () => {
  it('is empty by default', async () => {
    expect(await statusBackupItem.getValue()).toEqual({});
  });
});

describe('remember', () => {
  it('saves the status under the ticket key', async () => {
    await statusBackupItem.setValue({ 'CAR-6100': 'dev' });

    expect(await remember(group('CAR-6124 fix · STG'))).toBe(true);

    expect(await statusBackupItem.getValue()).toEqual({
      'CAR-6100': 'dev',
      'CAR-6124': 'stg',
    });
  });

  it('uses the name as the key when the title has no ticket key', async () => {
    await remember(group('Research · Review'));

    expect(await statusBackupItem.getValue()).toEqual({ Research: 'review' });
  });

  it('replaces the saved status of the ticket', async () => {
    await statusBackupItem.setValue({ 'CAR-6124': 'stg' });

    await remember(group('CAR-6124 · PROD'));

    expect(await statusBackupItem.getValue()).toEqual({ 'CAR-6124': 'prod' });
  });

  it('does not write when the entry is already saved', async () => {
    await statusBackupItem.setValue({ 'CAR-6124': 'stg' });

    expect(await remember(group('CAR-6124 · STG'))).toBe(false);
  });

  it.each([
    ['a title with no status', 'CAR-6124'],
    ['a title with an unknown status', 'CAR-6124 · Blocked'],
    ['a status with no name', ' · STG'],
    ['an empty title', ''],
    ['a missing title', undefined],
  ])('saves nothing for %s', async (_case, title) => {
    expect(await remember(group(title))).toBe(false);
    expect(await statusBackupItem.getValue()).toEqual({});
  });

  it('parses with the statuses it is given', async () => {
    const qa = new StatusBuilder().with({ id: 'qa', label: 'QA' }).build();

    await remember(group('CAR-1 · QA'), [qa]);

    expect(await statusBackupItem.getValue()).toEqual({ 'CAR-1': 'qa' });
  });
});

describe('restore', () => {
  it('adds the saved status and its color back to a title with none', async () => {
    fake.with({ groups: [group('CAR-6124 hotfix')] });
    await statusBackupItem.setValue({ 'CAR-6124': 'stg' });

    expect(await restore(group('CAR-6124 hotfix'))).toBe(true);

    expect(fake.updates).toEqual([
      { groupId: 1, properties: { title: 'CAR-6124 hotfix · STG', color: 'orange' } },
    ]);
  });

  it('restores a title with no ticket key by its name', async () => {
    fake.with({ groups: [group('Research')] });
    await statusBackupItem.setValue({ Research: 'review' });

    await restore(group('Research'));

    expect(fake.group(1)?.title).toBe('Research · Review');
  });

  it('leaves a title that already has a status', async () => {
    await statusBackupItem.setValue({ 'CAR-6124': 'stg' });

    expect(await restore(group('CAR-6124 · Dev'))).toBe(false);
    expect(fake.updates).toEqual([]);
  });

  it.each([
    ['nothing is saved for the ticket', {}],
    ['the saved status no longer exists', { 'CAR-6124': 'deleted' }],
  ])('does nothing when %s', async (_case, backup) => {
    await statusBackupItem.setValue(backup);

    expect(await restore(group('CAR-6124'))).toBe(false);
    expect(fake.updates).toEqual([]);
  });

  it('does nothing for an empty title', async () => {
    await statusBackupItem.setValue({ '': 'stg' });

    expect(await restore(group(''))).toBe(false);
  });

  it('uses the stored statuses', async () => {
    const qa = new StatusBuilder().with({ id: 'qa', label: 'QA', color: 'red' }).build();
    await statusesItem.setValue([qa]);
    fake.with({ groups: [group('CAR-1')] });
    await statusBackupItem.setValue({ 'CAR-1': 'qa' });

    await restore(group('CAR-1'));

    expect(fake.group(1)).toMatchObject({ title: 'CAR-1 · QA', color: 'red' });
  });
});

describe('forget', () => {
  it('drops the entry of the ticket', async () => {
    await statusBackupItem.setValue({ 'CAR-6124': 'stg', 'CAR-6100': 'dev' });

    await forget('CAR-6124');

    expect(await statusBackupItem.getValue()).toEqual({ 'CAR-6100': 'dev' });
  });

  it('keeps the backup when the ticket has no entry', async () => {
    await statusBackupItem.setValue({ 'CAR-6100': 'dev' });

    await forget('CAR-6124');

    expect(await statusBackupItem.getValue()).toEqual({ 'CAR-6100': 'dev' });
  });
});

describe('forgetStatuses', () => {
  it('drops every entry that points to the given statuses', async () => {
    await statusBackupItem.setValue({ 'CAR-1': 'stg', 'CAR-2': 'dev', 'CAR-3': 'stg' });

    await forgetStatuses(['stg']);

    expect(await statusBackupItem.getValue()).toEqual({ 'CAR-2': 'dev' });
  });

  it.each([
    ['no ids', []],
    ['ids no entry uses', ['prod']],
  ])('keeps the backup with %s', async (_case, ids) => {
    await statusBackupItem.setValue({ 'CAR-2': 'dev' });

    await forgetStatuses(ids);

    expect(await statusBackupItem.getValue()).toEqual({ 'CAR-2': 'dev' });
  });
});
