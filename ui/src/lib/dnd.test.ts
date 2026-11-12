import { describe, expect, it } from 'vitest';

import type { Workspace } from '../api/types';
import { snapshotFixture } from '../test/ipc';
import { dropCommand, moveDestinations } from './dnd';

const TRABAJO = '00000000-0000-0000-0000-0000000000c1';
const PERSONAL = '00000000-0000-0000-0000-0000000000c2';
const QA = '00000000-0000-0000-0000-0000000000c3';
const JIRA = '00000000-0000-0000-0000-0000000000a1';
const IN_TEST = '00000000-0000-0000-0000-0000000000a4';
const SPRINT = '00000000-0000-0000-0000-0000000000f1';
const INCIDENTS = '00000000-0000-0000-0000-0000000000f2';
const ONBOARDING = '00000000-0000-0000-0000-0000000000f3';
const LOGIN = '00000000-0000-0000-0000-000000000b01';
const GRAFANA = '00000000-0000-0000-0000-000000000b04';
const STATUS_PAGE = '00000000-0000-0000-0000-000000000b09';

const workspace = (): Workspace => snapshotFixture().workspace;
const tab = (id: string) => ({ kind: 'tab', tab: id }) as const;
const folder = (id: string) => ({ kind: 'folder', folder: id }) as const;
const group = (id: string) => ({ kind: 'group', group: id }) as const;

describe('dropping a tab', () => {
  it('takes the place of the row it lands on, in any list', () => {
    expect(dropCommand(tab(STATUS_PAGE), { kind: 'before', node: GRAFANA }, workspace())).toEqual({
      type: 'moveTab',
      tab: STATUS_PAGE,
      place: { group: JIRA },
      index: 2,
    });
  });

  it('goes out of a folder straight into its profile', () => {
    expect(dropCommand(tab(LOGIN), { kind: 'into', place: { profile: TRABAJO } }, workspace())).toEqual({
      type: 'moveTab',
      tab: LOGIN,
      place: { profile: TRABAJO },
      index: 4,
    });
  });

  it('moving down its own list lands one slot earlier', () => {
    expect(dropCommand(tab(LOGIN), { kind: 'before', node: '00000000-0000-0000-0000-000000000b02' }, workspace())).toBeNull();
  });

  it('goes to the end of its own list from the drop zone after it', () => {
    expect(dropCommand(tab(LOGIN), { kind: 'end', place: { folder: SPRINT } }, workspace())).toEqual({
      type: 'moveTab',
      tab: LOGIN,
      place: { folder: SPRINT },
      index: 1,
    });
  });

  it('does nothing on its own container or itself', () => {
    expect(dropCommand(tab(LOGIN), { kind: 'into', place: { folder: SPRINT } }, workspace())).toBeNull();
    expect(dropCommand(tab(LOGIN), { kind: 'before', node: LOGIN }, workspace())).toBeNull();
  });
});

describe('dropping a folder', () => {
  it('moves into a profile or group but never into a folder', () => {
    expect(dropCommand(folder(SPRINT), { kind: 'into', place: { profile: PERSONAL } }, workspace())).toEqual({
      type: 'moveFolder',
      folder: SPRINT,
      place: { profile: PERSONAL },
      index: 1,
    });
    expect(dropCommand(folder(ONBOARDING), { kind: 'into', place: { group: IN_TEST } }, workspace())).toEqual({
      type: 'moveFolder',
      folder: ONBOARDING,
      place: { group: IN_TEST },
      index: 1,
    });
    expect(dropCommand(folder(SPRINT), { kind: 'into', place: { folder: INCIDENTS } }, workspace())).toBeNull();
    expect(dropCommand(folder(SPRINT), { kind: 'before', node: '00000000-0000-0000-0000-000000000b03' }, workspace())).toBeNull();
  });
});

describe('dropping a group', () => {
  it('moves to another profile or reorders, but never nests', () => {
    expect(dropCommand(group(IN_TEST), { kind: 'into', place: { profile: QA } }, workspace())).toEqual({
      type: 'moveGroup',
      group: IN_TEST,
      profile: QA,
      index: 1,
    });
    expect(dropCommand(group(IN_TEST), { kind: 'before', node: JIRA }, workspace())).toEqual({
      type: 'moveGroup',
      group: IN_TEST,
      profile: TRABAJO,
      index: 0,
    });
    expect(dropCommand(group(IN_TEST), { kind: 'into', place: { group: JIRA } }, workspace())).toBeNull();
    expect(dropCommand(group(IN_TEST), { kind: 'before', node: GRAFANA }, workspace())).toBeNull();
  });
});

describe('dropping a profile', () => {
  it('reorders profiles', () => {
    expect(dropCommand({ kind: 'profile', profile: QA }, { kind: 'into', place: { profile: TRABAJO } }, workspace())).toEqual({
      type: 'moveProfile',
      profile: QA,
      index: 0,
    });
    expect(dropCommand({ kind: 'profile', profile: QA }, { kind: 'into', place: { group: JIRA } }, workspace())).toBeNull();
  });
});

describe('move destinations', () => {
  it('offers every other place for a tab, including its profile', () => {
    const labels = moveDestinations(tab(LOGIN), workspace()).map((move) => move.label);
    expect(labels).toContain('Trabajo');
    expect(labels).toContain('Trabajo / Trabajo · Jira');
    expect(labels).toContain('Trabajo / Onboarding');
    expect(labels).toContain('Personal / Investigación');
    expect(labels).not.toContain('Trabajo / Trabajo · Jira / Sprint 42');
  });

  it('offers profiles and groups, not folders, for a folder', () => {
    const labels = moveDestinations(folder(SPRINT), workspace()).map((move) => move.label);
    expect(labels).toEqual(['Trabajo', 'Trabajo / In TEST', 'Personal', 'Personal / Investigación', 'QA', 'QA / Docs Rust']);
  });

  it('offers other profiles for a group', () => {
    expect(moveDestinations(group(JIRA), workspace()).map((move) => move.label)).toEqual(['Personal', 'QA']);
  });
});

describe('dropping on the pinned section', () => {
  const pinnedWorkspace = (): Workspace => ({
    ...workspace(),
    pinned: [{ tab: LOGIN }, { folder: SPRINT }, { tab: GRAFANA }],
  });

  it('pins what is not pinned yet', () => {
    expect(dropCommand(tab(STATUS_PAGE), { kind: 'pinned' }, pinnedWorkspace())).toEqual({
      type: 'pin',
      target: { tab: STATUS_PAGE },
    });
    expect(dropCommand({ kind: 'profile', profile: TRABAJO }, { kind: 'pinned' }, pinnedWorkspace())).toBeNull();
  });

  it('reorders pinned items, accounting for the removal first', () => {
    const before = (target: { tab: string } | { folder: string }) => ({ kind: 'pinned', before: target }) as const;
    expect(dropCommand(tab(GRAFANA), before({ tab: LOGIN }), pinnedWorkspace())).toEqual({
      type: 'movePinned',
      target: { tab: GRAFANA },
      index: 0,
    });
    expect(dropCommand(tab(LOGIN), { kind: 'pinned' }, pinnedWorkspace())).toEqual({
      type: 'movePinned',
      target: { tab: LOGIN },
      index: 2,
    });
    expect(dropCommand(tab(LOGIN), before({ folder: SPRINT }), pinnedWorkspace())).toBeNull();
    expect(dropCommand(tab(GRAFANA), { kind: 'pinned' }, pinnedWorkspace())).toBeNull();
  });
});
