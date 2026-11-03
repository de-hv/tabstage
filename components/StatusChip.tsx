import { useRef, useState } from 'react';
import type { Group } from '@/lib/groups';
import { NO_STATUS_LABEL } from '@/lib/lanes';
import type { Status } from '@/lib/types';
import { StatusPicker } from './StatusPicker';

interface StatusChipProps {
  group: Group;
  statuses: readonly Status[];
}

/** The group's status in its native color. Clicking it opens the picker. */
export function StatusChip({ group, statuses }: StatusChipProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const label =
    statuses.find((status) => status.id === group.statusId)?.label ?? NO_STATUS_LABEL;

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  return (
    <div className="status-chip-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="status-chip"
        data-color={group.statusId === null ? 'none' : group.color}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${label}. Change status of ${group.name || 'group'}`}
        // Keeps focus in the open picker, so its blur doesn't close it before
        // this click toggles it.
        onMouseDown={(event) => {
          if (open) event.preventDefault();
        }}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && (
        <StatusPicker
          groupId={group.id}
          current={group.statusId}
          statuses={statuses}
          onClose={close}
        />
      )}
    </div>
  );
}
