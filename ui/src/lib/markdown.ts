/** Helpers for notes, which are written in Markdown. */

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;
const FENCE = /^\s*(```|~~~)/;

/**
 * Flips the `index`-th task box (`- [ ]` ↔ `- [x]`) of a note, counting in
 * reading order and skipping code blocks. Returns the note unchanged when
 * there is no such box.
 */
export function toggleTask(note: string, index: number): string {
  const lines = note.split('\n');
  let inFence = false;
  let seen = 0;
  for (const [at, line] of lines.entries()) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = TASK.exec(line);
    if (!match) continue;
    if (seen === index) {
      const mark = match[2] === ' ' ? 'x' : ' ';
      lines[at] = line.replace(TASK, `$1${mark}$3`);
      return lines.join('\n');
    }
    seen += 1;
  }
  return note;
}

/** A note as plain text, for tooltips: no Markdown marks, at most `maxLines` lines. */
export function plainText(note: string, maxLines = 3): string {
  const lines = note
    .split('\n')
    .filter((line) => !FENCE.test(line))
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*/, (_all, indent: string, mark: string) =>
          `${indent}${mark === ' ' ? '☐' : '☑'} `,
        )
        .replace(/^(\s*)(?:[-*+]|\d+[.)])\s+/, '$1• ')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__|\*|_|~~|`)(.+?)\1/g, '$2')
        .trimEnd(),
    )
    .filter((line) => line.trim() !== '');
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown.push('…');
  return shown.join('\n');
}

/** What a toolbar button or shortcut does to the selected text. */
export type Format = 'bold' | 'italic' | 'heading' | 'task' | 'list' | 'code' | 'link';

export interface Edit {
  text: string;
  /** Selection to restore after the edit. */
  start: number;
  end: number;
}

/** Applies a format to `text` between `start` and `end`. */
export function applyFormat(text: string, start: number, end: number, format: Format): Edit {
  const selected = text.slice(start, end);
  const wrap = (before: string, after: string, placeholder: string): Edit => {
    const inner = selected || placeholder;
    const next = text.slice(0, start) + before + inner + after + text.slice(end);
    return { text: next, start: start + before.length, end: start + before.length + inner.length };
  };
  switch (format) {
    case 'bold':
      return wrap('**', '**', 'bold');
    case 'italic':
      return wrap('_', '_', 'italic');
    case 'code':
      return selected.includes('\n') ? wrap('```\n', '\n```', 'code') : wrap('`', '`', 'code');
    case 'link': {
      const label = selected || 'link';
      const before = `[${label}](`;
      const next = `${text.slice(0, start)}${before}https://)${text.slice(end)}`;
      const urlStart = start + before.length;
      return { text: next, start: urlStart, end: urlStart + 'https://'.length };
    }
    case 'heading':
    case 'task':
    case 'list': {
      const prefix = format === 'heading' ? '### ' : format === 'task' ? '- [ ] ' : '- ';
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const block = text.slice(lineStart, end);
      const prefixed = block
        .split('\n')
        .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line))
        .join('\n');
      const next = text.slice(0, lineStart) + prefixed + text.slice(end);
      return { text: next, start: lineStart, end: lineStart + prefixed.length };
    }
  }
}
