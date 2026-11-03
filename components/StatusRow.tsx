import { useState, type KeyboardEvent } from 'react';
import type { GroupColor } from '@/lib/colors';
import { NO_STATUS_LABEL } from '@/lib/lanes';
import type { Status } from '@/lib/types';
import { ColorSelect } from './ColorSelect';

interface StatusRowProps {
  status: Status;
  isFirst: boolean;
  isLast: boolean;
  /** False for the only status left: the list needs at least one. */
  canDelete: boolean;
  /**
   * Set while a delete waits for confirmation: the groups that use the
   * status, or `null` when they couldn't be counted.
   */
  pendingDeleteCount?: number | null;
  invalid: boolean;
  onRename: (label: string) => void;
  onRecolor: (color: GroupColor) => void;
  onMove: (offset: -1 | 1) => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function usedBy(count: number | null): string {
  if (count === null) return 'Groups that use';
  return count === 1 ? '1 group uses' : `${count} groups use`;
}

/**
 * One status: its label (saved on Enter or blur, reverted on Escape), its
 * color, ↑/↓ reorder buttons and delete, with a warning when groups use it.
 */
export function StatusRow({
  status,
  isFirst,
  isLast,
  canDelete,
  pendingDeleteCount,
  invalid,
  onRename,
  onRecolor,
  onMove,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
}: StatusRowProps) {
  const [draft, setDraft] = useState(status.label);
  const [savedLabel, setSavedLabel] = useState(status.label);
  // Follows renames saved elsewhere (another tab, restore defaults).
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
      <div className="status-row__main">
        <span className="dot" aria-hidden="true" />
        <input
          className="status-row__label"
          aria-label={`Label of ${status.label}`}
          aria-invalid={invalid || undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
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
      </div>
      {pendingDeleteCount !== undefined && (
        <div className="confirm" role="alertdialog" aria-label={`Delete ${status.label}?`}>
          <p>
            {usedBy(pendingDeleteCount)} “{status.label}”. They will move to “{NO_STATUS_LABEL}”.
          </p>
          <button type="button" className="button button--danger" onClick={onConfirmDelete}>
            Delete
          </button>
          <button type="button" className="button" onClick={onCancelDelete}>
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}
