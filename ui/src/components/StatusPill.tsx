import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Ellipsis, Settings2 } from 'lucide-react';
import type { CSSProperties } from 'react';

import type { Color, Status } from '../api/types';
import { profileColor } from '../lib/profileColors';

interface PillProps {
  name: string;
  color?: Color;
  /** How many tickets it holds, shown after the name. */
  count?: number;
  /** A collapsed lane: an outlined pill with "…" at the end. */
  collapsed?: boolean;
}

/** A status's name on its color, as in the lanes and the board; grey for "No status". */
export function StatusPill({ name, color, count, collapsed }: PillProps) {
  return (
    <span
      className="status-pill"
      data-none={color === undefined || undefined}
      data-collapsed={collapsed || undefined}
      style={color === undefined ? undefined : ({ '--lane': profileColor(color) } as CSSProperties)}
    >
      <span className="status-pill__dot" aria-hidden="true" />
      <span className="status-pill__name">{name}</span>
      {count !== undefined && <span className="status-pill__count">{count}</span>}
      {collapsed && <Ellipsis className="status-pill__more" aria-hidden="true" />}
    </span>
  );
}

interface PickerProps {
  statuses: Status[];
  /** The current status; `undefined` is "No status". */
  value: Status | undefined;
  onChange: (status: string | null) => void;
  onEditStatuses: () => void;
}

/** The status of a ticket as a button that opens the list of statuses. */
export function StatusPicker({ statuses, value, onChange, onEditStatuses }: PickerProps) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button
          type="button"
          className="status-button"
          aria-label={`Status: ${value?.name ?? 'No status'}`}
          data-none={value ? undefined : true}
          style={value ? ({ '--lane': profileColor(value.color) } as CSSProperties) : undefined}
        >
          <span className="status-pill__dot" aria-hidden="true" />
          {value?.name ?? 'No status'}
          <ChevronDown className="icon" aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="start" sideOffset={4} collisionPadding={8}>
          {statuses.map((status) => (
            <Menu.Item key={status.id} className="menu__item" onSelect={() => onChange(status.id)}>
              <span className="status-pill__dot" style={{ '--lane': profileColor(status.color) } as CSSProperties} aria-hidden="true" />
              <span className="menu__item-label">{status.name}</span>
              {value?.id === status.id && <Check className="icon menu__chevron" aria-hidden="true" />}
            </Menu.Item>
          ))}
          <Menu.Item className="menu__item" onSelect={() => onChange(null)}>
            <span className="status-pill__dot status-pill__dot--none" aria-hidden="true" />
            No status
            {!value && <Check className="icon menu__chevron" aria-hidden="true" />}
          </Menu.Item>
          <Menu.Separator className="separator" />
          <Menu.Item className="menu__item" onSelect={onEditStatuses}>
            <Settings2 className="icon" aria-hidden="true" />
            Edit statuses…
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
