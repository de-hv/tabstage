import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Command, Profile, Snapshot } from '../api/types';
import { findBrowser, profileView } from '../lib/browsers';
import { countTabs } from '../lib/workspace';
import { InlineInput } from './InlineInput';
import { ProfileColorButton } from './ProfileDot';

/** Value of the "System browser" option of the browser select. */
const SYSTEM = '';

interface Props {
  snapshot: Snapshot;
  apply: (command: Command) => void;
  /** Profile to scroll to and highlight, e.g. from "Choose browser…". */
  focus?: string | null;
}

/** One card per profile: its name, color and the browser it opens in here. */
export function ProfilesEditor({ snapshot, apply, focus = null }: Props) {
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
            focused={profile.id === focus}
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
        profile={removing}
        others={profiles.filter((profile) => profile.id !== removing?.id)}
        onClose={() => setRemoving(null)}
        onRemove={(moveItemsTo) => {
          if (removing) apply({ type: 'removeProfile', profile: removing.id, moveItemsTo });
          setRemoving(null);
        }}
      />
    </>
  );
}

interface CardProps {
  snapshot: Snapshot;
  profile: Profile;
  focused: boolean;
  canRemove: boolean;
  apply: (command: Command) => void;
  onRemove: () => void;
}

function ProfileCard({ snapshot, profile, focused, canRemove, apply, onRemove }: CardProps) {
  const view = profileView(snapshot, profile.id);
  const system = findBrowser(snapshot, snapshot.systemBrowser)?.name ?? 'none found';

  return (
    <article
      className="profile-card"
      aria-label={`Profile ${profile.name}`}
      data-warning={view?.isFallback || undefined}
      data-focused={focused || undefined}
      ref={(node) => {
        if (focused) node?.scrollIntoView?.({ block: 'center' });
      }}
    >
      <div className="profile-card__head">
        <ProfileColorButton
          profile={profile}
          onChange={(color) => apply({ type: 'setProfileColor', profile: profile.id, color })}
        />
        <NameInput profile={profile} onRename={(name) => apply({ type: 'renameProfile', profile: profile.id, name })} />
        {view?.isFallback && <span className="tag tag--warning">Browser not installed here</span>}
        {canRemove && (
          <button type="button" className="icon-button" aria-label={`Delete profile ${profile.name}`} onClick={onRemove}>
            <Trash2 className="icon" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="profile-card__fields">
        <label className="profile-card__browser">
          <span className="profile-card__label">Opens in</span>
          <select
            className="input"
            aria-label={`Browser for ${profile.name}`}
            value={view?.binding?.browser ?? SYSTEM}
            autoFocus={focused}
            onChange={(event) =>
              apply({ type: 'bindProfile', profile: profile.id, browser: event.target.value || null })
            }
          >
            <option value={SYSTEM}>System browser ({system})</option>
            {snapshot.browsers.map((browser) => (
              <option key={browser.id} value={browser.id}>
                {browser.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
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
  profile: Profile | null;
  others: Profile[];
  onClose: () => void;
  onRemove: (moveItemsTo: string) => void;
}

/** Deleting a profile moves everything in it to another profile. */
export function RemoveProfileDialog({ profile, others, onClose, onRemove }: RemoveProps) {
  const [target, setTarget] = useState('');
  const chosen = target || others[0]?.id || '';
  const tabs = profile ? countTabs(profile) : 0;

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
            {profile?.items.length === 0
              ? 'It is empty.'
              : `Its groups, folders and ${tabs === 1 ? 'tab' : `${tabs} tabs`} move to the profile you choose. Nothing is lost.`}
          </AlertDialog.Description>
          <fieldset className="dialog__choices">
            <legend className="visually-hidden">Move its contents to</legend>
            {others.map((option) => (
              <label key={option.id} className="choice">
                <input
                  type="radio"
                  name="move-items-to"
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
