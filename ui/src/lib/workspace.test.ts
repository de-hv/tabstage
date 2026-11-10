import { describe, expect, it } from 'vitest';

import { snapshotFixture } from '../test/ipc';
import { allGroups, allTabs, countTabs, locate, placeLabel } from './workspace';

const TRABAJO = '00000000-0000-0000-0000-0000000000c1';
const JIRA = '00000000-0000-0000-0000-0000000000a1';
const SPRINT = '00000000-0000-0000-0000-0000000000f1';
const ONBOARDING = '00000000-0000-0000-0000-0000000000f3';
const LOGIN = '00000000-0000-0000-0000-000000000b01';
const WIKI = '00000000-0000-0000-0000-000000000b08';
const STATUS_PAGE = '00000000-0000-0000-0000-000000000b09';

const workspace = () => snapshotFixture().workspace;

describe('locate', () => {
  it('finds items at every level with their containers', () => {
    expect(locate(workspace(), JIRA)).toMatchObject({ place: { profile: TRABAJO }, index: 0 });
    expect(locate(workspace(), STATUS_PAGE)).toMatchObject({ place: { profile: TRABAJO }, index: 3 });
    expect(locate(workspace(), SPRINT)).toMatchObject({ place: { group: JIRA }, index: 0 });
    expect(locate(workspace(), LOGIN)?.group?.id).toBe(JIRA);
    expect(locate(workspace(), WIKI)).toMatchObject({ place: { folder: ONBOARDING }, index: 0 });
    expect(locate(workspace(), WIKI)?.group).toBeUndefined();
    expect(locate(workspace(), 'missing')).toBeNull();
  });
});

describe('collections', () => {
  it('lists groups and tabs across profiles', () => {
    expect(allGroups(workspace()).map((group) => group.name)).toEqual([
      'Trabajo · Jira',
      'In TEST',
      'Investigación',
      'Docs Rust',
    ]);
    expect(allTabs(workspace())).toHaveLength(9);
  });

  it('counts tabs inside folders, groups and profiles', () => {
    const [trabajo] = workspace().profiles;
    expect(trabajo && countTabs(trabajo)).toBe(8);
    expect(trabajo?.items[0] && countTabs(trabajo.items[0])).toBe(5);
  });
});

describe('placeLabel', () => {
  it('names a place by its path', () => {
    expect(placeLabel(workspace(), { profile: TRABAJO })).toBe('Trabajo');
    expect(placeLabel(workspace(), { group: JIRA })).toBe('Trabajo / Trabajo · Jira');
    expect(placeLabel(workspace(), { folder: SPRINT })).toBe('Trabajo / Trabajo · Jira / Sprint 42');
    expect(placeLabel(workspace(), { folder: ONBOARDING })).toBe('Trabajo / Onboarding');
  });
});
