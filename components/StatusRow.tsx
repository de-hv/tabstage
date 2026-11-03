import { useState, type KeyboardEvent } from 'react';
import type { AccentColor } from '@/lib/colors';
import type { Status } from '@/lib/types';
import { ColorSelect } from './ColorSelect';

interface StatusRowProps {
  status: Status;
  /** Tabs in the status (loose and grouped). */
  count: number;
  isFirst: boolean;
  isLast: boolean;
  /** False for the only status left: the list needs at least one. */
  canDelete: boolean;
  invalid: boolean;
  onRename: (label: string) => void;
  onRecolor: (color: AccentColor) => void;
  onMove: (offset: -1 | 1) => void;
  onDelete: () => void;
}

/**
 * One status: its label (saved on Enter or blur, reverted on Escape), its
 * accent, how many tabs it has, ↑/↓ reorder buttons and delete.
 */
export function StatusRow({
  status,
  count,
  isFirst,
  isLast,
  canDelete,
  invalid,
  onRename,
  onRecolor,
  onMove,
  onDelete,
}: StatusRowProps) {
  const [draft, setDraft] = useState(status.label);
  const [savedLabel, setSavedLabel] = useState(status.label);
  // Follows renames saved elsewhere (the panel, restore defaults).
  if (savedLabel !== status.label) {
    setSavedLabel(status.label);
    setDraft(status.label);
  }

  const commit = () => {
    const label = draft.trim();
    if (label !== status.label) onRename(label);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(status.label);
    }
  };

  return (
    <li className="status-row" data-color={status.color}>
      <span className="square" aria-hidden="true" />
      <input
        className="status-row__label"
        aria-label={`Label of ${status.label}`}
        aria-invalid={invalid || undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <span className="status-row__count">{count === 1 ? '1 tab' : `${count} tabs`}</span>
      <ColorSelect value={status.color} onChange={onRecolor} label={`Color of ${status.label}`} />
      <div className="status-row__actions">
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${status.label} up`}
          disabled={isFirst}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${status.label} down`}
          disabled={isLast}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="icon-button icon-button--danger"
          aria-label={`Delete ${status.label}`}
          title={canDelete ? undefined : 'Keep at least one status'}
          disabled={!canDelete}
          onClick={onDelete}
        >
          ✕
        </button>
      </div>
    </li>
  );
}
