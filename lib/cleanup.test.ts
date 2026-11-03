import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabs } from '../__mocks__/fake-tabs';
import { StatusBuilder } from '../__mocks__/status.builder';
import { StatusMother } from '../__mocks__/status.mother';
import { cleanupNativeTitles } from './cleanup';

let fake: FakeTabs;
const groups = () => [
  { id: 1, title: 'CAR-6124 · STG', color: 'orange' },
  { id: 2, title: 'CAR-6100 · In review', color: 'purple' },
  { id: 3, title: 'Research', color: 'blue' },
  { id: 4, title: 'Notes · Mine', color: 'grey' },
];

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabs.install();
});

afterEach(() => {
  fake.uninstall();
});

describe('cleanupNativeTitles', () => {
  it('asks for the tabGroups permission before anything else', () => {
    fake.allowNativeGroups(groups());

    void cleanupNativeTitles(StatusMother.defaults());

    expect(fake.permissionsRequest).toHaveBeenCalledWith({ permissions: ['tabGroups'] });
  });

  it('strips v1 and current status suffixes and leaves other titles and colors alone', async () => {
    fake.allowNativeGroups(groups());

    const result = await cleanupNativeTitles(StatusMother.defaults());

    expect(result).toEqual({ kind: 'done', cleaned: 2 });
    expect(fake.nativeGroups).toEqual([
      { id: 1, title: 'CAR-6124', color: 'orange' },
      { id: 2, title: 'CAR-6100', color: 'purple' },
      { id: 3, title: 'Research', color: 'blue' },
      { id: 4, title: 'Notes · Mine', color: 'grey' },
    ]);
    expect(fake.groupUpdates.map((update) => Object.keys(update.properties))).toEqual([['title'], ['title']]);
  });

  it('strips a custom status label too', async () => {
    fake.allowNativeGroups(groups());

    await cleanupNativeTitles([new StatusBuilder().with({ label: 'Mine' }).build()]);

    expect(fake.nativeGroups[3]?.title).toBe('Notes');
  });

  it('changes nothing when the permission is denied', async () => {
    fake.allowNativeGroups(groups());
    fake.permissionsRequest.mockResolvedValue(false);

    expect(await cleanupNativeTitles(StatusMother.defaults())).toEqual({ kind: 'denied' });
    expect(fake.groupUpdates).toEqual([]);
  });

  it('reports a browser without tab groups', async () => {
    (fakeBrowser as unknown as { tabGroups?: unknown }).tabGroups = undefined;

    expect(await cleanupNativeTitles(StatusMother.defaults())).toEqual({ kind: 'unsupported' });
  });
});
