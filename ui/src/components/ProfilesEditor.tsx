import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { BrowserInfo, Command, Profile, Snapshot } from '../api/types';
import { findBrowser, groupsOf, profileView } from '../lib/browsers';
import { ProfileColorButton } from './ProfileDot';
import { InlineInput } from './InlineInput';

interface Props {
  snapshot: Snapshot;
  apply: (command: Command) => void;
}

/** One card per profile: its name, and the browser it opens in on this machine. */
export function ProfilesEditor({ snapshot, apply }: Props) {
  const [removing, setRemoving] = useState<Profile | null>(null);
  const { profiles } = snapshot.workspace;

  return (
    <>
      <div className="profile-cards">
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            snapshot={snapshot}
            profile={profile}
            canRemove={profiles.length > 1}
            apply={apply}
            onRemove={() => setRemoving(profile)}
          />
        ))}
      </div>
      <div className="status-list__add">
        <InlineInput
          label="New profile"
          placeholder="New profile, for example Client X"
          onCancel={() => undefined}
          onSubmit={async (name) => {
            apply({ type: 'addProfile', name });
            return true;
          }}
        />
      </div>
      <RemoveProfileDialog
        snapshot={snapshot}
        profile={removing}
        others={profiles.filter((profile) => profile.id !== removing?.id)}
        onClose={() => setRemoving(null)}
        onRemove={(moveGroupsTo) => {
          if (removing) apply({ type: 'removeProfile', profile: removing.id, moveGroupsTo });
          setRemoving(null);
        }}
      />
    </>
  );
}

interface CardProps {
  snapshot: Snapshot;
  profile: Profile;
  canRemove: boolean;
  apply: (command: Command) => void;
  onRemove: () => void;
}

function ProfileCard({ snapshot, profile, canRemove, apply, onRemove }: CardProps) {
  const view = profileView(snapshot, profile.id);
  const binding = view?.binding ?? null;
  const bound = binding ? findBrowser(snapshot, binding.browser) : undefined;
  const browserProfiles = bound ? (snapshot.browserProfiles[bound.id] ?? []) : [];
  const unconfigured = !view?.isBound;

  const bind = (changes: { browser?: string; browserProfile?: string | null; newWindow?: boolean }) => {
    const browser = changes.browser ?? binding?.browser;
    if (!browser) return;
    const sameBrowser = browser === binding?.browser;
    apply({
      type: 'bindProfile',
      profile: profile.id,
      browser,
      browserProfile:
        changes.browserProfile !== undefined
          ? changes.browserProfile
          : sameBrowser
            ? (binding?.browserProfile ?? null)
            : null,
      newWindow: changes.newWindow ?? binding?.newWindow ?? false,
    });
  };

  return (
    <article className="profile-card" aria-label={`Profile ${profile.name}`} data-warning={unconfigured || view?.isFallback || undefined}>
      <div className="profile-card__head">
        <ProfileColorButton
          profile={profile}
          onChange={(color) => apply({ type: 'setProfileColor', profile: profile.id, color })}
        />
        <NameInput profile={profile} onRename={(name) => apply({ type: 'renameProfile', profile: profile.id, name })} />
        {unconfigured && <span className="tag tag--warning">Not set up on this computer</span>}
        {view?.isFallback && <span className="tag tag--warning">Browser not installed here</span>}
        {canRemove && (
          <button type="button" className="icon-button" aria-label="Delete profile" onClick={onRemove}>
            <Trash2 className="icon" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="profile-card__fields">
        <span className="profile-card__label">On this computer</span>
        <label className="field field--inline">
          <span className="visually-hidden">Browser</span>
          <select
            className="input"
            aria-label="Browser"
            value={binding?.browser ?? ''}
            onChange={(event) => bind({ browser: event.target.value })}
          >
            {!binding && <option value="">Choose a browser…</option>}
            {snapshot.browsers.map((browser) => (
              <option key={browser.id} value={browser.id}>
                {browser.name}
              </option>
            ))}
          </select>
        </label>
        {bound && browserProfiles.length > 0 && (
          <select
            className="input"
            aria-label="Browser profile"
            value={binding?.browserProfile ?? ''}
            onChange={(event) => bind({ browserProfile: event.target.value || null })}
          >
            <option value="">Browser's active profile</option>
            {browserProfiles.map((browserProfile) => (
              <option key={browserProfile.id} value={browserProfile.id}>
                {browserProfile.name}
              </option>
            ))}
          </select>
        )}
        {binding && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={binding.newWindow}
              onChange={(event) => bind({ newWindow: event.target.checked })}
            />
            Open all in a new window
          </label>
        )}
      </div>
      {bound && browserProfiles.length === 0 && <p className="profile-card__note">{noProfilesNote(bound)}</p>}
      {unconfigured && (
        <p className="profile-card__note">
          It comes from another computer or has no browser yet. Until you choose one, its groups open in{' '}
          {findBrowser(snapshot, snapshot.systemBrowser)?.name ?? 'the system browser'}.
        </p>
      )}
    </article>
  );
}

function noProfilesNote(browser: BrowserInfo): string {
  return browser.kind === 'chromium' || browser.kind === 'firefox'
    ? `No ${browser.name} profiles found on this computer.`
    : `${browser.name} doesn't let other apps pick its profile: it opens in its active profile.`;
}

/** Name field that saves on Enter or when it loses focus. */
function NameInput({ profile, onRename }: { profile: Profile; onRename: (name: string) => void }) {
  const [value, setValue] = useState(profile.name);
  useEffect(() => setValue(profile.name), [profile.name]);

  const commit = () => {
    const name = value.trim();
    if (!name) setValue(profile.name);
    else if (name !== profile.name) onRename(name);
  };

  return (
    <input
      className="input profile-card__name"
      aria-label="Name"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setValue(profile.name);
      }}
    />
  );
}

export interface RemoveProps {
  snapshot: Snapshot;
  profile: Profile | null;
  others: Profile[];
  onClose: () => void;
  onRemove: (moveGroupsTo: string) => void;
}

export function RemoveProfileDialog({ snapshot, profile, others, onClose, onRemove }: RemoveProps) {
  const [target, setTarget] = useState('');
  const chosen = target || others[0]?.id || '';
  const count = profile ? groupsOf(snapshot, profile.id).length : 0;

  return (
    <AlertDialog.Root
      open={profile !== null}
      onOpenChange={(open) => {
        if (!open) {
          setTarget('');
          onClose();
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog__overlay" />
        <AlertDialog.Content className="dialog">
          <AlertDialog.Title className="dialog__title">Delete the “{profile?.name}” profile?</AlertDialog.Title>
          <AlertDialog.Description className="dialog__text">
            {count === 1 ? 'Its group moves' : `Its ${count} groups move`} to the profile you choose. No tabs are
            lost.
          </AlertDialog.Description>
          <fieldset className="dialog__choices">
            <legend className="visually-hidden">Move its groups to</legend>
            {others.map((option) => (
              <label key={option.id} className="choice">
                <input
                  type="radio"
                  name="move-groups-to"
                  checked={chosen === option.id}
                  onChange={() => setTarget(option.id)}
                />
                {option.name}
              </label>
            ))}
          </fieldset>
          <div className="dialog__actions">
            <AlertDialog.Cancel className="button">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
              className="button button--danger"
              onClick={() => {
                onRemove(chosen);
                setTarget('');
              }}
            >
              Delete
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
