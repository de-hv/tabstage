import { useState, type FormEvent } from 'react';
import * as actions from '@/lib/actions';
import { countInStatus, type DeleteStatusChoice } from '@/lib/board';
import type { AccentColor } from '@/lib/colors';
import { DEFAULT_STATUSES, type StatusError } from '@/lib/statuses';
import type { Board, Status } from '@/lib/types';
import { ColorSelect } from './ColorSelect';
import { DeleteStatusDialog } from './DeleteStatusDialog';
import { StatusRow } from './StatusRow';

interface StatusEditorProps {
  statuses: readonly Status[];
  board: Board;
}

const SAVE_FAILED: StatusError = { statusId: null, message: 'Could not save the statuses.' };

/**
 * Edits the status list: add, rename, recolor, reorder, delete and restore
 * the defaults. Deleting a status with tabs asks where they go, as in the
 * panel. Every change is validated, then saved.
 */
export function StatusEditor({ statuses, board }: StatusEditorProps) {
  const [errors, setErrors] = useState<StatusError[]>([]);
  const [deleting, setDeleting] = useState<Status | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<AccentColor>('lavender');

  const run = async (work: Promise<StatusError[] | void>): Promise<boolean> => {
    try {
      const found = (await work) ?? [];
      setErrors(found);
      return found.length === 0;
    } catch (error) {
      console.warn('Tabstage: could not save the statuses', error);
      setErrors([SAVE_FAILED]);
      return false;
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) {
      setErrors([{ statusId: null, message: 'A status needs a label.' }]);
      return;
    }
    if (await run(actions.addNewStatus({ label, color: newColor }))) setNewLabel('');
  };

  const requestDelete = (status: Status) => {
    if (countInStatus(board, status.id) === 0) {
      void run(actions.deleteStatusAndItems(status.id, { remove: true }));
    } else {
      setDeleting(status);
    }
  };

  const confirmDelete = (choice: DeleteStatusChoice) => {
    const status = deleting!;
    setDeleting(null);
    void run(actions.deleteStatusAndItems(status.id, choice));
  };

  const reset = () => {
    setConfirmReset(false);
    void run(actions.restoreDefaultStatuses());
  };

  return (
    <section className="editor" aria-label="Statuses">
      {errors.length > 0 && (
        <ul className="editor__errors" role="alert">
          {[...new Set(errors.map((error) => error.message))].map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <ol className="editor__list">
        {statuses.map((status, index) => (
          <StatusRow
            key={status.id}
            status={status}
            count={countInStatus(board, status.id)}
            isFirst={index === 0}
            isLast={index === statuses.length - 1}
            canDelete={statuses.length > 1}
            invalid={errors.some((error) => error.statusId === status.id)}
            onRename={(label) => void run(actions.renameStatusLabel(status.id, label))}
            onRecolor={(color) => void run(actions.setStatusColor(status.id, color))}
            onMove={(offset) => void run(actions.shiftStatus(status.id, offset))}
            onDelete={() => requestDelete(status)}
          />
        ))}
      </ol>

      <form className="editor__add" onSubmit={(event) => void add(event)}>
        <input
          className="editor__add-label"
          aria-label="New status label"
          placeholder="New status"
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
        />
        <ColorSelect value={newColor} onChange={setNewColor} label="Color of the new status" />
        <button type="submit" className="button button--primary">
          Add status
        </button>
      </form>

      <footer className="editor__footer">
        {confirmReset ? (
          <div className="confirm" role="alertdialog" aria-label="Restore defaults?">
            <p>
              Replace your statuses with the {DEFAULT_STATUSES.length} defaults? Tabs in a status
              that goes away move to “{DEFAULT_STATUSES[0]!.label}”.
            </p>
            <button type="button" className="button button--danger" onClick={reset}>
              Restore
            </button>
            <button type="button" className="button" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="button" onClick={() => setConfirmReset(true)}>
            Restore defaults
          </button>
        )}
      </footer>

      {deleting && (
        <DeleteStatusDialog
          status={deleting}
          count={countInStatus(board, deleting.id)}
          statuses={statuses}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
