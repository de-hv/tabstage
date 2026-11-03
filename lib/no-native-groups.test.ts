import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const SKIP = new Set(['node_modules', '.output', '.wxt', '.git', '__mocks__']);
/** The only file allowed to touch native groups: the opt-in cleanup. */
const ALLOWED = new Set(['lib/cleanup.ts']);
const NATIVE_GROUP_CALL = /\btabGroups\s*[.?]|\btabs\s*\.\s*(group|ungroup)\s*\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('native tab groups', () => {
  it('are only touched by the opt-in cleanup', () => {
    const offenders = sourceFiles(ROOT)
      .map((path) => relative(ROOT, path))
      .filter((path) => !ALLOWED.has(path) && NATIVE_GROUP_CALL.test(readFileSync(join(ROOT, path), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
