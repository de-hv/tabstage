import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import type { BrowserChoice, Group, Snapshot } from '../api/types';
import { defaultBrowser, findBrowser, groupBrowser, groupBrowserLabel } from '../lib/browsers';
import { BrowserBadge } from './BrowserBadge';

interface Props {
  snapshot: Snapshot;
  group: Group;
  onChange: (browser: BrowserChoice) => void;
}

/** Button with the group's browser and a menu to follow the default or pick one. */
export function BrowserPicker({ snapshot, group, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const label = groupBrowserLabel(snapshot, group.id);
  const resolved = groupBrowser(snapshot, group.id);
  const shown = findBrowser(snapshot, resolved?.browser);
  const fallback = defaultBrowser(snapshot);
  const current = group.browser.kind === 'specific' ? group.browser.browser : null;

  const choose = (browser: BrowserChoice) => {
    setOpen(false);
    onChange(browser);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="button"
          data-accent={resolved?.followsDefault ? undefined : true}
          aria-label={`Navegador del grupo: ${label}`}
        >
          {shown && <BrowserBadge name={shown.name} kind={shown.kind} dim={resolved?.followsDefault} />}
          {label}
          <ChevronDown className="icon" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="picker" align="start" sideOffset={6} role="menu" aria-label="Navegador">
          <p className="picker__label">Abrir los tabs de este grupo en</p>
          <Option
            checked={current === null}
            label={`Por defecto (${fallback?.name ?? 'ninguno'})`}
            badge={fallback && <BrowserBadge name={fallback.name} kind={fallback.kind} dim />}
            onSelect={() => choose({ kind: 'default' })}
          />
          <hr className="separator" />
          {snapshot.browsers.map((browser) => (
            <Option
              key={browser.id}
              checked={current === browser.id}
              label={browser.name}
              badge={<BrowserBadge name={browser.name} kind={browser.kind} />}
              onSelect={() => choose({ kind: 'specific', browser: browser.id })}
            />
          ))}
          <p className="picker__label">Navegadores detectados en este equipo</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface OptionProps {
  checked: boolean;
  label: string;
  badge: React.ReactNode;
  onSelect: () => void;
}

function Option({ checked, label, badge, onSelect }: OptionProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      aria-label={label}
      className="picker__option"
      onClick={onSelect}
    >
      {badge}
      <span>{label}</span>
      {checked && <Check className="icon picker__check" aria-hidden="true" />}
    </button>
  );
}
