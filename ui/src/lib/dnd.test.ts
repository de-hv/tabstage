import { describe, expect, it } from 'vitest';

import type { Workspace } from '../api/types';
import { snapshotFixture } from '../test/ipc';
import { dropCommand } from './dnd';

// Fixture: Trabajo [Sprint 42 (login, cache), Incidentes (incident 77), Grafana, Runbook],
// Investigación [MDN], Docs Rust [].
const WORK = '00000000-0000-0000-0000-0000000000a1';
const RESEARCH = '00000000-0000-0000-0000-0000000000a2';
const DOCS = '00000000-0000-0000-0000-0000000000a3';
const SPRINT = '00000000-0000-0000-0000-0000000000f1';
const INCIDENTS = '00000000-0000-0000-0000-0000000000f2';
const LOGIN = '00000000-0000-0000-0000-000000000b01';
const CACHE = '00000000-0000-0000-0000-000000000b02';
const GRAFANA = '00000000-0000-0000-0000-000000000b04';
const RUNBOOK = '00000000-0000-0000-0000-000000000b05';

function workspace(): Workspace {
  return snapshotFixture().workspace;
}

const tab = (id: string) => ({ kind: 'tab', tab: id }) as const;
const folder = (id: string) => ({ kind: 'folder', folder: id }) as const;
const group = (id: string) => ({ kind: 'group', group: id }) as const;

describe('dropCommand', () => {
  describe('tabs in lists', () => {
    it('moves a tab up to the place of another row', () => {
      expect(dropCommand(tab(RUNBOOK), { kind: 'before', node: SPRINT }, workspace())).toEqual({
        type: 'moveTab',
        tab: RUNBOOK,
        place: { group: WORK },
        index: 0,
      });
    });

    it('accounts for its own slot when moving down the same list', () => {
      expect(dropCommand(tab(LOGIN), { kind: 'end', place: { folder: SPRINT } }, workspace())).toEqual({
        type: 'moveTab',
        tab: LOGIN,
        place: { folder: SPRINT },
        index: 1,
      });
    });

    it('moves a loose tab into a folder list at a row', () => {
      expect(dropCommand(tab(GRAFANA), { kind: 'before', node: CACHE }, workspace())).toEqual({
        type: 'moveTab',
        tab: GRAFANA,
        place: { folder: SPRINT },
        index: 1,
      });
    });

    it('ignores drops that keep the tab where it is', () => {
      expect(dropCommand(tab(GRAFANA), { kind: 'before', node: GRAFANA }, workspace())).toBeNull();
      expect(dropCommand(tab(GRAFANA), { kind: 'before', node: RUNBOOK }, workspace())).toBeNull();
      expect(dropCommand(tab(RUNBOOK), { kind: 'end', place: { group: WORK } }, workspace())).toBeNull();
    });

    it('drops a tab on a folder header to the end of that folder', () => {
      expect(dropCommand(tab(GRAFANA), { kind: 'folder', folder: INCIDENTS }, workspace())).toEqual({
        type: 'moveTab',
        tab: GRAFANA,
        place: { folder: INCIDENTS },
        index: 1,
      });
      expect(dropCommand(tab(LOGIN), { kind: 'folder', folder: SPRINT }, workspace())).toBeNull();
    });

    it('drops a tab on a sidebar group to the end of that group', () => {
      expect(dropCommand(tab(LOGIN), { kind: 'group', group: RESEARCH }, workspace())).toEqual({
        type: 'moveTab',
        tab: LOGIN,
        place: { group: RESEARCH },
        index: 1,
      });
    });
  });

  describe('folders', () => {
    it('reorders a folder among the group rows', () => {
      expect(dropCommand(folder(SPRINT), { kind: 'before', node: RUNBOOK }, workspace())).toEqual({
        type: 'moveFolder',
        folder: SPRINT,
        group: WORK,
        index: 2,
      });
    });

    it('takes the place of another folder when dropped on its header', () => {
      expect(dropCommand(folder(INCIDENTS), { kind: 'folder', folder: SPRINT }, workspace())).toEqual({
        type: 'moveFolder',
        folder: INCIDENTS,
        group: WORK,
        index: 0,
      });
    });

    it('never nests folders', () => {
      expect(dropCommand(folder(INCIDENTS), { kind: 'before', node: LOGIN }, workspace())).toBeNull();
      expect(dropCommand(folder(INCIDENTS), { kind: 'end', place: { folder: SPRINT } }, workspace())).toBeNull();
    });

    it('moves a folder to the end of another group', () => {
      expect(dropCommand(folder(SPRINT), { kind: 'group', group: DOCS }, workspace())).toEqual({
        type: 'moveFolder',
        folder: SPRINT,
        group: DOCS,
        index: 0,
      });
    });
  });

  describe('board tiles', () => {
    it('sets the status of a tab or a folder', () => {
      expect(dropCommand(tab(GRAFANA), { kind: 'tile', status: 'done' }, workspace())).toEqual({
        type: 'setStatus',
        target: { tab: GRAFANA },
        status: 'done',
      });
      expect(dropCommand(folder(SPRINT), { kind: 'tile', status: null }, workspace())).toEqual({
        type: 'setStatus',
        target: { folder: SPRINT },
        status: null,
      });
    });

    it('ignores the tile the item is already in', () => {
      expect(dropCommand(tab(GRAFANA), { kind: 'tile', status: 'todo' }, workspace())).toBeNull();
      expect(dropCommand(folder(SPRINT), { kind: 'tile', status: 'in-progress' }, workspace())).toBeNull();
    });

    it('does not move a tab whose folder status decides its tile', () => {
      expect(dropCommand(tab(LOGIN), { kind: 'tile', status: 'done' }, workspace())).toBeNull();
    });
  });

  describe('groups', () => {
    it('takes the place of the group it is dropped on', () => {
      expect(dropCommand(group(DOCS), { kind: 'group', group: WORK }, workspace())).toEqual({
        type: 'moveGroup',
        group: DOCS,
        index: 0,
      });
      expect(dropCommand(group(WORK), { kind: 'group', group: RESEARCH }, workspace())).toEqual({
        type: 'moveGroup',
        group: WORK,
        index: 1,
      });
    });

    it('ignores itself and non-sidebar targets', () => {
      expect(dropCommand(group(WORK), { kind: 'group', group: WORK }, workspace())).toBeNull();
      expect(dropCommand(group(WORK), { kind: 'tile', status: 'done' }, workspace())).toBeNull();
    });
  });
});
