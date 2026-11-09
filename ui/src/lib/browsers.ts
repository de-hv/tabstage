import type { BrowserInfo, GroupBrowser, Snapshot, Uuid } from '../api/types';

export function findBrowser(snapshot: Snapshot, id: string | null | undefined): BrowserInfo | undefined {
  return id ? snapshot.browsers.find((browser) => browser.id === id) : undefined;
}

export function defaultBrowser(snapshot: Snapshot): BrowserInfo | undefined {
  return findBrowser(snapshot, snapshot.defaultBrowser);
}

export function groupBrowser(snapshot: Snapshot, group: Uuid): GroupBrowser | undefined {
  return snapshot.groups.find((resolved) => resolved.group === group);
}

/** Text for the group's browser button, e.g. "Por defecto (Firefox)". */
export function groupBrowserLabel(snapshot: Snapshot, group: Uuid): string {
  const resolved = groupBrowser(snapshot, group);
  const fallbackName = defaultBrowser(snapshot)?.name ?? 'ninguno';
  if (!resolved || resolved.followsDefault) return `Por defecto (${fallbackName})`;
  const wanted = snapshot.workspace.groups.find((candidate) => candidate.id === group)?.browser;
  if (resolved.isFallback && wanted?.kind === 'specific') return `${wanted.browser} (no instalado)`;
  return findBrowser(snapshot, resolved.browser)?.name ?? fallbackName;
}
