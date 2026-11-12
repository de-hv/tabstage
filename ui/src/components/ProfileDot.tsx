import * as Popover from '@radix-ui/react-popover';
import { Check, CornerLeftUp } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import type { ContainerColor, Profile } from '../api/types';
import { PROFILE_COLOR_NAMES, profileColor } from '../lib/profileColors';

/** A profile's filled circle, for places that only show it. */
export function ProfileDot({ color }: { color: number }) {
  return <span className="profile-dot" style={{ background: profileColor(color) }} aria-hidden="true" />;
}

/** The 20 colors as radio items; `value` is the checked one, if any. */
function Swatches({ value, onPick }: { value: number | undefined; onPick: (color: number) => void }) {
  return (
    <div className="swatches__grid">
      {PROFILE_COLOR_NAMES.map((name, index) => {
        const checked = index === value;
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
            onClick={() => onPick(index)}
          >
            {checked && <Check className="swatch__check" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
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

interface ContainerColorProps {
  /** What gets the color, for labels, e.g. "In TEST". */
  name: string;
  /** Its color; `undefined` is none. */
  color: ContainerColor | undefined;
  /** The color it gets from its parent (`undefined`: no color), and the parent's name. */
  parentColor: number | undefined;
  parentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (color: ContainerColor) => void;
  /** The element the picker opens next to. */
  children: ReactNode;
}

/** A small swatch of a color, or a crossed-out one for no color. */
function SmallSwatch({ color, checked }: { color: number | undefined; checked: boolean }) {
  return (
    <span
      className={color === undefined ? 'swatch swatch--small swatch--none' : 'swatch swatch--small'}
      style={color === undefined ? undefined : { background: profileColor(color) }}
      aria-hidden="true"
    >
      {checked && <Check className="swatch__check" aria-hidden="true" />}
    </span>
  );
}

/**
 * Color of a group or folder: none (the default), its parent's, or one of
 * the 20 colors.
 */
export function ContainerColorPicker(props: ContainerColorProps) {
  const { name, parentColor, parentName, open, onOpenChange, onChange } = props;
  const color = props.color ?? 'none';
  const pick = (next: ContainerColor) => {
    onOpenChange(false);
    if (next !== color) onChange(next);
  };
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor asChild>{props.children}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="swatches"
          align="start"
          sideOffset={4}
          role="menu"
          aria-label={`Color of ${name}`}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={color === 'none'}
            className="swatches__inherit"
            onClick={() => pick('none')}
          >
            <SmallSwatch color={undefined} checked={color === 'none'} />
            <span>No color</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={color === 'parent'}
            className="swatches__inherit"
            onClick={() => pick('parent')}
          >
            <SmallSwatch color={parentColor} checked={color === 'parent'} />
            <span>Use parent color ({parentName})</span>
            <CornerLeftUp className="icon" aria-hidden="true" />
          </button>
          <Swatches value={typeof color === 'number' ? color : undefined} onPick={pick} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
