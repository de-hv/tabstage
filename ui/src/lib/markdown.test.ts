import { describe, expect, it } from 'vitest';

import { applyFormat, linkTicketKeys, parseTicketLine, plainText, toggleTask } from './markdown';

describe('toggleTask', () => {
  const note = '- [x] Deploy\n```\n- [ ] not a task\n```\n  * [ ] Ping QA\n1. [X] Numbered';

  it('flips the box at an index, in reading order, outside code blocks', () => {
    expect(toggleTask(note, 0)).toBe(note.replace('- [x] Deploy', '- [ ] Deploy'));
    expect(toggleTask(note, 1)).toBe(note.replace('* [ ] Ping QA', '* [x] Ping QA'));
    expect(toggleTask(note, 2)).toBe(note.replace('1. [X]', '1. [ ]'));
  });

  it('leaves the note alone when there is no such box', () => {
    expect(toggleTask(note, 3)).toBe(note);
    expect(toggleTask('plain', 0)).toBe('plain');
  });
});

describe('plainText', () => {
  it('drops the marks and shows tasks as boxes', () => {
    expect(plainText('## Steps\n- [x] **Deploy** [now](https://a.dev)\n- [ ] Ping `#ops`')).toBe(
      'Steps\n☑ Deploy now\n☐ Ping #ops',
    );
  });

  it('keeps the first lines only', () => {
    expect(plainText('a\n\nb\nc\nd', 3)).toBe('a\nb\nc\n…');
  });
});

describe('applyFormat', () => {
  it('wraps the selection, or a placeholder it selects', () => {
    expect(applyFormat('ship it', 0, 4, 'bold')).toEqual({ text: '**ship** it', start: 2, end: 6 });
    expect(applyFormat('', 0, 0, 'italic')).toEqual({ text: '_italic_', start: 1, end: 7 });
  });

  it('turns the selection into a link with the address selected', () => {
    expect(applyFormat('docs', 0, 4, 'link')).toEqual({ text: '[docs](https://)', start: 7, end: 15 });
  });

  it('prefixes every selected line, and removes the prefix when it is there', () => {
    const lists = applyFormat('one\ntwo', 1, 6, 'task');
    expect(lists.text).toBe('- [ ] one\n- [ ] two');
    expect(applyFormat(lists.text, 0, lists.text.length, 'task').text).toBe('one\ntwo');
  });
});

describe('linkTicketKeys', () => {
  const keys = new Map([['CAR-6210', 't1']]);

  it('links known keys, case-insensitively, outside code and links', () => {
    expect(linkTicketKeys('Ask about car-6210 and CAR-1', keys)).toBe(
      'Ask about [car-6210](tabstage://ticket/t1) and CAR-1',
    );
    expect(linkTicketKeys('`CAR-6210` [CAR-6210](https://x.dev/CAR-6210) https://x.dev/CAR-6210', keys)).toBe(
      '`CAR-6210` [CAR-6210](https://x.dev/CAR-6210) https://x.dev/CAR-6210',
    );
    expect(linkTicketKeys('```\nCAR-6210\n```', keys)).toBe('```\nCAR-6210\n```');
  });
});

describe('parseTicketLine', () => {
  it('takes a leading key as the key and the rest as the title', () => {
    expect(parseTicketLine('- [ ] car-6210: Decouple status')).toEqual({ key: 'CAR-6210', title: 'Decouple status' });
    expect(parseTicketLine('CAR-1')).toEqual({ key: 'CAR-1', title: 'CAR-1' });
    expect(parseTicketLine('## Ship the **map**')).toEqual({ title: 'Ship the map' });
  });
});
