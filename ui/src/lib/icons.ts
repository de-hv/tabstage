import type { Icon } from '../api/types';

/** Longest text icon, in visible characters (same limit as the Rust side). */
export const MAX_TEXT_ICON = 3;

/** Symbols offered under "Text": they take the text color in both themes. */
export const SYMBOLS = ['★', '●', '◆', '▲', '■', '✓', '✗', '→', '⚑', '♦', '♥', '☰', '⌘', '§', '¶', '∞', '#', '@', '✦', '◎', '⚠', '⚡', '☀', '☂'];

/** Icon-set names shown before the user searches. */
export const SUGGESTED_SYMBOLS = [
  'bug', 'git-pull-request', 'git-branch', 'flask-conical', 'rocket', 'list-checks', 'ticket', 'github',
  'database', 'server', 'chart-line', 'file-text', 'book-open', 'calendar', 'mail', 'lock',
  'star', 'flag', 'bookmark', 'briefcase', 'house', 'heart', 'shield', 'zap',
  'terminal', 'cloud', 'globe', 'users', 'message-square', 'shopping-cart', 'graduation-cap', 'wrench',
];

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), (part) => part.segment);
}

/** A text icon from what the user typed, or an error message to show. */
export function textIcon(raw: string): Icon | string {
  const value = raw.trim();
  const parts = graphemes(value);
  if (parts.length === 0 || parts.length > MAX_TEXT_ICON) return `Use 1 to ${MAX_TEXT_ICON} characters`;
  if (parts.some((part) => /[\s\p{Cc}]/u.test(part))) return 'Spaces are not allowed';
  return { kind: 'text', value };
}

const RECENT_KEY = 'tabstage.recentIcons';
const RECENT_MAX = 16;

/** Icons picked lately on this computer, newest first. */
export function readRecentIcons(): Icon[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter(isIcon) : [];
  } catch {
    return [];
  }
}

export function rememberIcon(icon: Icon) {
  const next = [icon, ...readRecentIcons().filter((other) => !sameIcon(other, icon))].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable; recent icons are only a convenience.
  }
}

export function sameIcon(a: Icon | undefined, b: Icon | undefined): boolean {
  return a?.kind === b?.kind && a?.value === b?.value;
}

function isIcon(value: unknown): value is Icon {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, value: inner } = value as Record<string, unknown>;
  return (kind === 'emoji' || kind === 'symbol' || kind === 'text') && typeof inner === 'string';
}

/** One emoji from emojibase, trimmed to what the picker needs. */
export interface EmojiEntry {
  unicode: string;
  label: string;
  tags: string[];
  group: number;
}

/** Emoji categories in picker order; group 2 (skin tone parts) is left out. */
export const EMOJI_GROUPS: { id: number; label: string }[] = [
  { id: 0, label: 'Smileys' },
  { id: 1, label: 'People' },
  { id: 3, label: 'Nature' },
  { id: 4, label: 'Food' },
  { id: 5, label: 'Travel' },
  { id: 6, label: 'Activities' },
  { id: 7, label: 'Objects' },
  { id: 8, label: 'Symbols' },
  { id: 9, label: 'Flags' },
];

let emojiCache: Promise<EmojiEntry[]> | null = null;

/** The emoji list, bundled with the app (no network), loaded on first use. */
export function loadEmoji(): Promise<EmojiEntry[]> {
  emojiCache ??= import('emojibase-data/en/compact.json').then((module) =>
    module.default
      .filter((entry) => entry.group !== undefined && entry.group !== 2)
      .map((entry) => ({
        unicode: entry.unicode,
        label: entry.label,
        tags: entry.tags ?? [],
        group: entry.group ?? 0,
      })),
  );
  return emojiCache;
}

export function searchEmoji(all: EmojiEntry[], query: string, limit = 160): EmojiEntry[] {
  const text = query.trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  // Exact names first, then names that start with the query, then the rest.
  const rank = (entry: EmojiEntry) => {
    const label = entry.label.toLowerCase();
    return label === text ? 0 : label.startsWith(text) ? 1 : 2;
  };
  return all
    .filter((entry) =>
      words.every((word) => entry.label.toLowerCase().includes(word) || entry.tags.some((tag) => tag.startsWith(word))),
    )
    .map((entry, order) => ({ entry, order, rank: rank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
