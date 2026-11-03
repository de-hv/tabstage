import { useState, type FormEvent } from 'react';
import { forgetStatuses } from '@/lib/backup';
import type { GroupColor } from '@/lib/colors';
import { listGroups } from '@/lib/groups';
import { NO_STATUS_LABEL } from '@/lib/lanes';
import {
  DEFAULT_STATUSES,
  addStatus,
  moveStatus,
  recolorStatus,
  removeStatus,
  renameStatus,
  resetStatuses,
  saveStatuses,
  validateStatuses,
  type StatusError,
} from '@/lib/statuses';
import type { Status, StatusId } from '@/lib/types';
import { ColorSelect } from './ColorSelect';
import { StatusRow } from './StatusRow';

interface StatusEditorProps {
  statuses: readonly Status[];
}

interface PendingDelete {
  id: StatusId;
  /** Groups that use the status, or `null` when they couldn't be counted. */
  count: number | null;
}

const SAVE_FAILED: StatusError = { statusId: null, message: 'Could not save the statuses.' };

/**
 * Edits the status list: add, rename, recolor, reorder, delete and restore
 * the defaults. Every change is validated, then saved; the background
 * rewrites the group titles.
 */
export function StatusEditor({ statuses }: StatusEditorProps) {
  const [errors, setErrors] = useState<StatusError[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<GroupColor>('grey');

  const save = async (next: Status[], removed: StatusId[] = []): Promise<boolean> => {
    const found = validateStatuses(next);
    setErrors(found);
    if (found.length > 0) return false;
    try {
      await saveStatuses(next);
      await forgetStatuses(removed);
      return true;
    } catch (error) {
      console.warn('Tabstage: could not save the statuses', error);
      setErrors([SAVE_FAILED]);
      return false;
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (await save(addStatus(statuses, { label: newLabel.trim(), color: newColor }))) {
      setNewLabel('');
    }
  };

  const requestDelete = async (id: StatusId) => {
    let count: number | null;
    try {
      const groups = await listGroups(statuses);
      count = groups.filter((group) => group.statusId === id).length;
    } catch (error) {
      console.warn('Tabstage: could not count the groups', error);
      count = null;
    }
    if (count === 0) await remove(id);
    else setPendingDelete({ id, count });
  };

  const remove = async (id: StatusId) => {
    setPendingDelete(null);
    await save(removeStatus(statuses, id), [id]);
  };

  const reset = async () => {
    setConfirmReset(false);
    setErrors([]);
    const defaultIds = new Set(DEFAULT_STATUSES.map((status) => status.id));
    try {
      await resetStatuses();
      await forgetStatuses(statuses.map((s) => s.id).filter((id) => !defaultIds.has(id)));
    } catch (error) {
      console.warn('Tabstage: could not restore the defaults', error);
      setErrors([SAVE_FAILED]);
    }
  };

  const listIds = new Set(statuses.map((status) => status.id));
  const addInvalid = errors.some((error) => error.statusId && !listIds.has(error.statusId));

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
            isFirst={index === 0}
            isLast={index === statuses.length - 1}
            canDelete={statuses.length > 1}
            pendingDeleteCount={pendingDelete?.id === status.id ? pendingDelete.count : undefined}
            invalid={errors.some((error) => error.statusId === status.id)}
            onRename={(label) => void save(renameStatus(statuses, status.id, label))}
            onRecolor={(color) => void save(recolorStatus(statuses, status.id, color))}
            onMove={(offset) => void save(moveStatus(statuses, status.id, index + offset))}
            onDelete={() => void requestDelete(status.id)}
            onConfirmDelete={() => void remove(status.id)}
            onCancelDelete={() => setPendingDelete(null)}
          />
        ))}
      </ol>

      <form className="editor__add" onSubmit={(event) => void add(event)}>
        <input
          className="editor__add-label"
          aria-label="New status label"
          aria-invalid={addInvalid || undefined}
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
              Replace your statuses with the {DEFAULT_STATUSES.length} defaults? Groups whose
              status is removed move to “{NO_STATUS_LABEL}”.
            </p>
            <button type="button" className="button button--danger" onClick={() => void reset()}>
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
    </section>
  );
}
