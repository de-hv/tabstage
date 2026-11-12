import { Globe, NotebookText, Ticket } from 'lucide-react';
import { DynamicIcon, type IconName, iconNames } from 'lucide-react/dynamic';

import type { Icon } from '../api/types';

export type ItemKind = 'ticket' | 'note' | 'link';

const DEFAULTS = { ticket: Ticket, note: NotebookText, link: Globe } as const;

const KNOWN = new Set<string>(iconNames);

export function isIconName(name: string): name is IconName {
  return KNOWN.has(name);
}

/** An icon from the icon set by name, loaded on demand. */
export function SymbolIcon({ name, fallback }: { name: string; fallback?: ItemKind }) {
  const Default = DEFAULTS[fallback ?? 'link'];
  if (!isIconName(name)) return <Default className="icon" aria-hidden="true" />;
  return (
    <DynamicIcon
      name={name}
      className="icon"
      aria-hidden="true"
      fallback={() => <Default className="icon" aria-hidden="true" />}
    />
  );
}

/** The custom icon of a ticket, note or link, or the default of its kind. */
export function ItemIcon({ icon, kind }: { icon?: Icon | undefined; kind: ItemKind }) {
  switch (icon?.kind) {
    case 'emoji':
      return (
        <span className="item-icon item-icon--emoji" aria-hidden="true">
          {icon.value}
        </span>
      );
    case 'text':
      return (
        <span className="item-icon item-icon--text" aria-hidden="true">
          {icon.value}
        </span>
      );
    case 'symbol':
      return <SymbolIcon name={icon.value} fallback={kind} />;
    default: {
      const Default = DEFAULTS[kind];
      return <Default className="icon" aria-hidden="true" />;
    }
  }
}
