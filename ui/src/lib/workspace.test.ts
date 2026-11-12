import { describe, expect, it } from 'vitest';

import { snapshotFixture } from '../test/ipc';
import { allGroups, allTabs, countTabs, effectiveColor, locate, pinnedIndex, pinnedItems, placeLabel } from './workspace';

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

describe('effectiveColor', () => {
  const IN_TEST = '00000000-0000-0000-0000-0000000000a4';
  const INCIDENTS = '00000000-0000-0000-0000-0000000000f2';
  const STAGING = '00000000-0000-0000-0000-000000000b07';
  const INCIDENT_TAB = '00000000-0000-0000-0000-000000000b03';

  it('is the chosen color, the parent one when asked for, else none', () => {
    const workspace = snapshotFixture().workspace;
    expect(effectiveColor(workspace, TRABAJO)).toBe(0);
    expect(effectiveColor(workspace, JIRA)).toBeUndefined();
    expect(effectiveColor(workspace, SPRINT)).toBeUndefined();
    expect(effectiveColor(workspace, STATUS_PAGE)).toBeUndefined();
    expect(effectiveColor(workspace, '00000000-0000-0000-0000-0000000000a2')).toBe(1);
    expect(effectiveColor(workspace, IN_TEST)).toBe(3);
    expect(effectiveColor(workspace, STAGING)).toBe(3);
    expect(effectiveColor(workspace, INCIDENTS)).toBe(15);
    expect(effectiveColor(workspace, INCIDENT_TAB)).toBe(15);
    expect(effectiveColor(workspace, ONBOARDING)).toBeUndefined();
    expect(effectiveColor(workspace, WIKI)).toBeUndefined();
    expect(effectiveColor(workspace, 'missing')).toBeUndefined();
  });
});

describe('pinnedItems', () => {
  it('lists pinned items that still exist, in order, with their profile', () => {
    const workspace = { ...snapshotFixture().workspace };
    workspace.pinned = [{ tab: STATUS_PAGE }, { group: 'gone' }, { folder: SPRINT }];
    const pinned = pinnedItems(workspace);
    expect(pinned.map((entry) => [entry.kind, entry.item.id, entry.profile.id])).toEqual([
      ['tab', STATUS_PAGE, TRABAJO],
      ['folder', SPRINT, TRABAJO],
    ]);
    expect(pinnedIndex(workspace, { folder: SPRINT })).toBe(2);
    expect(pinnedIndex(workspace, { tab: SPRINT })).toBe(-1);
  });
});
