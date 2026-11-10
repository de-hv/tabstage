import type { Profile, Snapshot } from '../api/types';
import { profileBrowser, profileView } from '../lib/browsers';

/** Shown when a profile has no browser chosen here, or it is not installed. */
export function SetupNote({ snapshot, profile, onConfigure }: { snapshot: Snapshot; profile: Profile; onConfigure: () => void }) {
  const view = profileView(snapshot, profile.id);
  if (!view || (view.isBound && !view.isFallback)) return null;
  const browser = profileBrowser(snapshot, profile.id)?.name ?? 'the system browser';
  return (
    <div className="group__note" role="note">
      <p className="group__note-text">
        {view.isFallback
          ? `The browser chosen for “${profile.name}” is not installed on this computer. For now its tabs open in ${browser}.`
          : `“${profile.name}” has no browser chosen on this computer. For now its tabs open in ${browser}.`}
      </p>
      <button type="button" className="button" onClick={onConfigure}>
        Choose browser
      </button>
    </div>
  );
}
