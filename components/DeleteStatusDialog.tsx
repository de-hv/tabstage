import { useState } from 'react';
import type { DeleteStatusChoice } from '@/lib/board';
import type { Status, StatusId } from '@/lib/types';
import { Dialog } from './Dialog';

interface DeleteStatusDialogProps {
  status: Status;
  /** Tabs shown in the status (loose and grouped). */
  count: number;
  statuses: readonly Status[];
  onConfirm: (choice: DeleteStatusChoice) => void;
  onCancel: () => void;
}

/**
 * Asks what happens to the tabs of a status being deleted: move them, with
 * their groups, to another status, or remove them. Only shown when the
 * status has tabs.
 */
export function DeleteStatusDialog({ status, count, statuses, onConfirm, onCancel }: DeleteStatusDialogProps) {
  const others = [...statuses].filter((other) => other.id !== status.id).sort((a, b) => a.order - b.order);
  const [moveTo, setMoveTo] = useState<StatusId>(others[0]?.id ?? '');
  const tabs = count === 1 ? '1 tab' : `${count} tabs`;

  return (
    <Dialog title={`Delete ${status.label}?`} role="alertdialog" className="delete-dialog" onClose={onCancel}>
      <h2 className="dialog__title">Delete “{status.label}”?</h2>
      <p className="dialog__text">It has {tabs}. Where should they go?</p>
      <label className="field">
        <span className="field__label">Move to</span>
        <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)} data-autofocus>
          {others.map((other) => (
            <option key={other.id} value={other.id}>
              {other.label}
            </option>
          ))}
        </select>
      </label>
      <div className="dialog__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={!moveTo}
          onClick={() => onConfirm({ moveTo })}
        >
          Move to {others.find((other) => other.id === moveTo)?.label ?? '…'}
        </button>
        <button type="button" className="button button--danger" onClick={() => onConfirm({ remove: true })}>
          Remove them
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
