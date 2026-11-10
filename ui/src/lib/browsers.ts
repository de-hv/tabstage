import type { BrowserInfo, Profile, ProfileView, Snapshot, Uuid } from '../api/types';

export function findBrowser(snapshot: Snapshot, id: string | null | undefined): BrowserInfo | undefined {
  return id ? snapshot.browsers.find((browser) => browser.id === id) : undefined;
}

export function findProfile(snapshot: Snapshot, id: Uuid): Profile | undefined {
  return snapshot.workspace.profiles.find((profile) => profile.id === id);
}

export function profileView(snapshot: Snapshot, id: Uuid): ProfileView | undefined {
  return snapshot.profiles.find((view) => view.profile === id);
}

/** Browser that opens this profile's tabs on this machine. */
export function profileBrowser(snapshot: Snapshot, id: Uuid): BrowserInfo | undefined {
  return findBrowser(snapshot, profileView(snapshot, id)?.browser);
}

/** Name of the browser a profile opens in here. */
export function profileOpensIn(snapshot: Snapshot, id: Uuid): string {
  return profileBrowser(snapshot, id)?.name ?? 'no browser';
}

/** The profile has no working browser chosen on this computer. */
export function needsSetup(snapshot: Snapshot, id: Uuid): boolean {
  const view = profileView(snapshot, id);
  return !view?.isBound || view.isFallback;
}
