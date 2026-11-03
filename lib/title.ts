/** Separated the group name from its status label in v1 native group titles. */
export const TITLE_SEPARATOR = ' · ';

/**
 * Strips a v1 ` · <label>` suffix from a native group title when `<label>`
 * is one of `labels` (case and surrounding spaces ignored). Returns `null`
 * when the title has no such suffix, so callers know there is nothing to do.
 */
export function stripStatusSuffix(title: string, labels: readonly string[]): string | null {
  const at = title.lastIndexOf(TITLE_SEPARATOR);
  if (at === -1) return null;
  const suffix = title.slice(at + TITLE_SEPARATOR.length).trim().toLowerCase();
  const known = labels.some((label) => label.trim().toLowerCase() === suffix);
  return known && suffix ? title.slice(0, at).trimEnd() : null;
}
