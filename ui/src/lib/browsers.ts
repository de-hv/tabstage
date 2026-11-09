import type { BrowserInfo, Group, Profile, ProfileView, Snapshot, Uuid } from '../api/types';

export function findBrowser(snapshot: Snapshot, id: string | null | undefined): BrowserInfo | undefined {
  return id ? snapshot.browsers.find((browser) => browser.id === id) : undefined;
}

export function findProfile(snapshot: Snapshot, id: Uuid): Profile | undefined {
  return snapshot.workspace.profiles.find((profile) => profile.id === id);
}

export function profileView(snapshot: Snapshot, id: Uuid): ProfileView | undefined {
  return snapshot.profiles.find((view) => view.profile === id);
}

/** Browser that opens this profile's groups on this machine. */
export function profileBrowser(snapshot: Snapshot, id: Uuid): BrowserInfo | undefined {
  return findBrowser(snapshot, profileView(snapshot, id)?.browser);
}

export function groupProfile(snapshot: Snapshot, group: Group): Profile | undefined {
  return findProfile(snapshot, group.profile);
}

/**
 * How a profile opens here, e.g. "Google Chrome · Trabajo" when it is bound
 * to a browser profile, or just the browser name.
 */
export function profileOpensIn(snapshot: Snapshot, id: Uuid): string {
  const view = profileView(snapshot, id);
  const browser = findBrowser(snapshot, view?.browser);
  if (!browser) return 'no browser';
  const wanted = view?.isFallback ? undefined : view?.binding?.browserProfile;
  const browserProfile = wanted
    ? (snapshot.browserProfiles[browser.id]?.find((profile) => profile.id === wanted)?.name ?? wanted)
    : undefined;
  return browserProfile ? `${browser.name} · ${browserProfile}` : browser.name;
}

/** Groups of a profile, in sidebar order. */
export function groupsOf(snapshot: Snapshot, profile: Uuid): Group[] {
  return snapshot.workspace.groups.filter((group) => group.profile === profile);
}
