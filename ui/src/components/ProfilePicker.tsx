import * as Popover from '@radix-ui/react-popover';
import { AlertTriangle, Check, ChevronDown, Settings } from 'lucide-react';
import { useState } from 'react';

import type { Group, Snapshot } from '../api/types';
import { findProfile, profileOpensIn, profileView } from '../lib/browsers';
import { ProfileDot } from './ProfileDot';

interface Props {
  snapshot: Snapshot;
  group: Group;
  onChange: (profile: string) => void;
  onManage: () => void;
}

/** "en Trabajo · Google Chrome · Trabajo", with a menu to move the group to another profile. */
export function ProfilePicker({ snapshot, group, onChange, onManage }: Props) {
  const [open, setOpen] = useState(false);
  const profile = findProfile(snapshot, group.profile);
  const name = profile?.name ?? 'no profile';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="button profile-picker" aria-label={`Group profile: ${name}`}>
          {profile && <ProfileDot color={profile.color} />}
          <span>
            en <b className="profile-picker__name">{name}</b>
          </span>
          <span className="profile-picker__opens">· {profileOpensIn(snapshot, group.profile)}</span>
          <ChevronDown className="icon" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="picker" align="start" sideOffset={6} role="menu" aria-label="Profile">
          <p className="picker__label">This group belongs to the profile</p>
          {snapshot.workspace.profiles.map((candidate) => {
            const view = profileView(snapshot, candidate.id);
            const checked = candidate.id === group.profile;
            return (
              <button
                key={candidate.id}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                aria-label={candidate.name}
                className="picker__option"
                onClick={() => {
                  setOpen(false);
                  if (!checked) onChange(candidate.id);
                }}
              >
                <ProfileDot color={candidate.color} />
                <span className="picker__text">
                  {candidate.name}
                  <span className="picker__meta">
                    {view?.isBound && !view.isFallback ? (
                      profileOpensIn(snapshot, candidate.id)
                    ) : (
                      <>
                        <AlertTriangle className="icon picker__warning" aria-hidden="true" /> Not set up here
                      </>
                    )}
                  </span>
                </span>
                {checked && <Check className="icon picker__check" aria-hidden="true" />}
              </button>
            );
          })}
          <hr className="separator" />
          <button
            type="button"
            role="menuitem"
            className="picker__option"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            <Settings className="icon" aria-hidden="true" />
            Manage profiles…
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
