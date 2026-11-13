import * as Popover from '@radix-ui/react-popover';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Color, Profile } from '../api/types';
import { PROFILE_COLOR_NAMES, isCustomColor, parseHexColor, profileColor } from '../lib/profileColors';

/** A profile's filled circle, for places that only show it. */
export function ProfileDot({ color }: { color: Color }) {
  return <span className="profile-dot" style={{ background: profileColor(color) }} aria-hidden="true" />;
}

/**
 * The 20 palette colors as radio items, then a custom color: a swatch that
 * opens the system color picker and a hex field. `value` is the checked one.
 */
export function Swatches({ value, onPick }: { value: Color | undefined; onPick: (color: Color) => void }) {
  return (
    <>
      {/* Arrow keys move between colors; Enter or Space picks one. */}
      <ToggleGroup.Root
        type="single"
        className="swatches__grid"
        aria-label="Palette colors"
        value={typeof value === 'number' ? String(value) : ''}
        loop={false}
      >
        {PROFILE_COLOR_NAMES.map((name, index) => {
          const checked = index === value;
          return (
            <ToggleGroup.Item
              key={name}
              value={String(index)}
              aria-label={name}
              title={name}
              className="swatch"
              style={{ background: profileColor(index) }}
              onClick={() => onPick(index)}
            >
              {checked && <Check className="swatch__check" aria-hidden="true" />}
            </ToggleGroup.Item>
          );
        })}
      </ToggleGroup.Root>
      <CustomColor value={isCustomColor(value) ? value : undefined} onPick={onPick} />
    </>
  );
}

/** A custom `#rrggbb` color: the system picker behind a swatch, and a hex field. */
function CustomColor({ value, onPick }: { value: string | undefined; onPick: (color: string) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const shown = parseHexColor(draft) ?? value;

  // The native "change" fires once the system picker is closed, unlike
  // React's onChange, which fires on every move.
  useEffect(() => {
    const input = picker.current;
    if (!input) return;
    const onChange = () => onPick(input.value.toLowerCase());
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, [onPick]);

  const submit = () => {
    const hex = parseHexColor(draft);
    if (!hex) {
      setInvalid(draft.trim() !== '');
      return;
    }
    if (hex !== value) onPick(hex);
  };

  return (
    <div className="swatches__custom">
      <label
        className="swatch swatch--custom"
        data-checked={value !== undefined || undefined}
        title="Pick a custom color"
        style={shown ? { background: shown } : undefined}
        data-empty={shown ? undefined : true}
      >
        {value !== undefined && <Check className="swatch__check" aria-hidden="true" />}
        <input
          ref={picker}
          type="color"
          className="swatch__native"
          aria-label="Custom color"
          value={shown ?? '#888888'}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
        />
      </label>
      <input
        className="swatches__hex"
        aria-label="Custom color as hex"
        aria-invalid={invalid || undefined}
        placeholder="#ff6a3d"
        value={draft}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        onBlur={submit}
      />
    </div>
  );
}

interface ColorProps {
  profile: Pick<Profile, 'name' | 'color'>;
  onChange: (color: Color) => void;
  /** Controlled open state, so a menu item can open the picker too. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** The profile's dot as a button; it opens the 20 palette colors and a custom one. */
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
        <Popover.Content className="swatches" align="start" sideOffset={6} aria-label="Profile color">
          <Swatches
            value={profile.color}
            onPick={(color) => {
              setOpen(false);
              if (color !== profile.color) onChange(color);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
