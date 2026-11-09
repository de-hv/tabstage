import * as Popover from '@radix-ui/react-popover';
import { Check } from 'lucide-react';
import { useState } from 'react';

import type { Profile } from '../api/types';
import { PROFILE_COLOR_NAMES, profileColor } from '../lib/profileColors';

/** A profile's filled circle, for places that only show it. */
export function ProfileDot({ color }: { color: number }) {
  return <span className="profile-dot" style={{ background: profileColor(color) }} aria-hidden="true" />;
}

interface ColorProps {
  profile: Profile;
  onChange: (color: number) => void;
  /** Controlled open state, so a menu item can open the picker too. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** The profile's dot as a button; it opens a 4×5 grid of the 20 colors. */
export function ProfileColorButton({ profile, onChange, open, onOpenChange }: ColorProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="profile-dot-button" aria-label={`Color of ${profile.name}`}>
          <ProfileDot color={profile.color} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="swatches" align="start" sideOffset={6} role="menu" aria-label="Profile color">
          {PROFILE_COLOR_NAMES.map((name, index) => {
            const checked = index === profile.color;
            return (
              <button
                key={name}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                aria-label={name}
                title={name}
                className="swatch"
                style={{ background: profileColor(index) }}
                onClick={() => {
                  setOpen(false);
                  if (!checked) onChange(index);
                }}
              >
                {checked && <Check className="swatch__check" aria-hidden="true" />}
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
