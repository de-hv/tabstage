import * as Select from '@radix-ui/react-select';
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

/** Select values that are not statuses. */
const NONE = '__none';
const EDIT = '__edit';

/** The status of a ticket as a button that opens the list of statuses (a listbox, with typeahead). */
export function StatusPicker({ statuses, value, onChange, onEditStatuses }: PickerProps) {
  return (
    <Select.Root
      value={value?.id ?? NONE}
      onValueChange={(next) => {
        if (next === EDIT) onEditStatuses();
        else onChange(next === NONE ? null : next);
      }}
    >
      <Select.Trigger
        className="status-button"
        aria-label={`Status: ${value?.name ?? 'No status'}`}
        data-none={value ? undefined : true}
        style={value ? ({ '--lane': profileColor(value.color) } as CSSProperties) : undefined}
      >
        <span className="status-pill__dot" aria-hidden="true" />
        {value?.name ?? 'No status'}
        <Select.Icon asChild>
          <ChevronDown className="icon" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="menu select__content" position="popper" align="start" sideOffset={4} collisionPadding={8}>
          <Select.Viewport>
            {statuses.map((status) => (
              <Select.Item key={status.id} value={status.id} className="menu__item">
                <span className="status-pill__dot" style={{ '--lane': profileColor(status.color) } as CSSProperties} aria-hidden="true" />
                <Select.ItemText>
                  <span className="menu__item-label">{status.name}</span>
                </Select.ItemText>
                <Select.ItemIndicator className="menu__chevron">
                  <Check className="icon" aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
            <Select.Item value={NONE} className="menu__item">
              <span className="status-pill__dot status-pill__dot--none" aria-hidden="true" />
              <Select.ItemText>No status</Select.ItemText>
              <Select.ItemIndicator className="menu__chevron">
                <Check className="icon" aria-hidden="true" />
              </Select.ItemIndicator>
            </Select.Item>
            <Select.Separator className="separator" />
            <Select.Item value={EDIT} className="menu__item">
              <Settings2 className="icon" aria-hidden="true" />
              <Select.ItemText>Edit statuses…</Select.ItemText>
            </Select.Item>
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
