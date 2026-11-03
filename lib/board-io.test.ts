import { describe, expect, it } from 'vitest';
import { BoardMother } from '../__mocks__/board.mother';
import { StatusMother } from '../__mocks__/status.mother';
import { BackupError, exportBackup, parseBackup } from './board-io';

const statuses = StatusMother.defaults();
const file = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({ ...JSON.parse(exportBackup(BoardMother.sample(), statuses)), ...patch });

describe('exportBackup', () => {
  it('writes the app, version, date, statuses and board', () => {
    const data = JSON.parse(exportBackup(BoardMother.sample(), statuses, new Date('2026-11-03T12:00:00Z')));

    expect(data).toEqual({
      app: 'tabstage',
      version: 1,
      exportedAt: '2026-11-03T12:00:00.000Z',
      statuses,
      board: BoardMother.sample(),
    });
  });
});

describe('parseBackup', () => {
  it('reads back what was exported, with every tab as a closed link', () => {
    const { statuses: read, board } = parseBackup(file());

    expect(read).toEqual(statuses);
    expect(board.groups).toEqual(BoardMother.sample().groups);
    expect(board.items).toEqual(BoardMother.sample().items.map((item) => ({ ...item, tabId: null })));
  });

  it.each([
    ['not JSON', '{nope', 'The file is not valid JSON.'],
    ['another app', file({ app: 'other' }), 'The file is not a Tabstage backup.'],
    ['another version', file({ version: 2 }), 'The file is not a Tabstage backup.'],
    ['no statuses', file({ statuses: 'x' }), 'The file is not a Tabstage backup.'],
    ['a bad color', file({ statuses: [{ ...StatusMother.todo(), color: 'grey' }] }), 'The file has an invalid status.'],
    ['no statuses left', file({ statuses: [] }), 'Keep at least one status.'],
    ['a bad item', file({ board: { groups: [], items: [{ id: 1 }] } }), 'The file has an invalid tab.'],
    ['a bad group', file({ board: { groups: [{ id: 'g' }], items: [] } }), 'The file has an invalid group.'],
    ['an unknown status', file({ statuses: [StatusMother.done()] }), 'The file uses a status it does not define.'],
    [
      'an unknown group',
      file({ board: { groups: [], items: [{ ...BoardMother.sample().items[2], statusId: 'todo' }] } }),
      'The file uses a group it does not define.',
    ],
  ])('rejects a file with %s', (_, text, message) => {
    expect(() => parseBackup(text)).toThrow(new BackupError(message));
  });
});
