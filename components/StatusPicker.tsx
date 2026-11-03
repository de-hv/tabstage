import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { GroupColor } from '@/lib/colors';
import { setStatus } from '@/lib/groups';
import { NO_STATUS_LABEL } from '@/lib/lanes';
import type { Status, StatusId } from '@/lib/types';

interface Option {
  id: StatusId | null;
  label: string;
  color: GroupColor | null;
}

interface StatusPickerProps {
  groupId: number;
  current: StatusId | null;
  statuses: readonly Status[];
  /**
   * Called after a pick, on Escape or Tab (`restoreFocus` true), and when
   * focus leaves the list (`restoreFocus` false).
   */
  onClose: (restoreFocus: boolean) => void;
}

/**
 * A listbox of the statuses plus "No status". Arrow keys, Home and End move,
 * Enter or Space picks, Escape closes. Picking calls `setStatus`.
 */
export function StatusPicker({ groupId, current, statuses, onClose }: StatusPickerProps) {
  const options: Option[] = [
    ...statuses.map(({ id, label, color }) => ({ id, label, color })),
    { id: null, label: NO_STATUS_LABEL, color: null },
  ];
  const [active, setActive] = useState(() =>
    Math.max(0, options.findIndex((option) => option.id === current)),
  );
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  const pick = async (option: Option) => {
    onClose(true);
    if (option.id === current) return;
    try {
      await setStatus(groupId, option.id);
    } catch (error) {
      console.warn('Tabstage: could not set the status', error);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    const moves: Record<string, () => number> = {
      ArrowDown: () => (active >= last ? 0 : active + 1),
      ArrowUp: () => (active <= 0 ? last : active - 1),
      Home: () => 0,
      End: () => last,
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setActive(move());
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[active];
      if (option) void pick(option);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose(true);
    }
  };

  return (
    <ul
      ref={listRef}
      className="status-picker"
      role="listbox"
      aria-label="Status"
      tabIndex={-1}
      aria-activedescendant={optionId(active)}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onClose(false);
      }}
    >
      {options.map((option, index) => (
        <li
          key={option.id ?? NO_STATUS_LABEL}
          id={optionId(index)}
          role="option"
          aria-selected={option.id === current}
          className="status-picker__option"
          data-active={index === active || undefined}
          onMouseEnter={() => setActive(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void pick(option)}
        >
          <span className="dot" data-color={option.color ?? 'none'} aria-hidden="true" />
          {option.label}
        </li>
      ))}
    </ul>
  );
}
