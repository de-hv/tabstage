import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { AppError, Command, Status, Workspace } from '../api/types';
import { allTickets } from '../lib/workspace';
import { InlineInput } from './InlineInput';
import { ProfileColorButton } from './ProfileDot';

interface Props {
  workspace: Workspace;
  apply: (command: Command) => Promise<AppError | null>;
}

/** Statuses in workflow order: their order is the order of the lanes and board columns. */
export function StatusEditor({ workspace, apply }: Props) {
  const [removing, setRemoving] = useState<Status | null>(null);
  const { statuses } = workspace;
  const inUse = (status: Status) => allTickets(workspace).filter(({ ticket }) => ticket.status === status.id).length;
  const nextColor = () => {
    const used = new Set(statuses.map((status) => status.color));
    return [14, 0, 5, 7, 16, 11, 3, 9, 18, 1].find((color) => !used.has(color)) ?? statuses.length % 20;
  };

  return (
    <>
      <ol className="status-list" aria-label="Statuses">
        {statuses.map((status, index) => (
          <li key={status.id} className="status-row">
            <ProfileColorButton
              profile={status}
              onChange={(color) => void apply({ type: 'setStatusColor', status: status.id, color })}
            />
            <StatusName status={status} apply={apply} />
            <span className="status-row__count">
              {inUse(status)} {inUse(status) === 1 ? 'ticket' : 'tickets'}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Move ${status.name} up`}
              disabled={index === 0}
              onClick={() => void apply({ type: 'moveStatus', status: status.id, index: index - 1 })}
            >
              <ArrowUp className="icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Move ${status.name} down`}
              disabled={index === statuses.length - 1}
              onClick={() => void apply({ type: 'moveStatus', status: status.id, index: index + 1 })}
            >
              <ArrowDown className="icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Delete status ${status.name}`}
              onClick={() => (inUse(status) > 0 ? setRemoving(status) : void apply({ type: 'removeStatus', status: status.id }))}
            >
              <Trash2 className="icon" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <div className="status-list__add">
        <InlineInput
          label="New status"
          placeholder="New status, for example In review"
          onCancel={() => undefined}
          onSubmit={async (name) => !(await apply({ type: 'addStatus', name, color: nextColor() }))}
        />
      </div>
      <AlertDialog.Root open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog__overlay" />
          <AlertDialog.Content className="dialog">
            <AlertDialog.Title className="dialog__title">Delete the “{removing?.name}” status?</AlertDialog.Title>
            <AlertDialog.Description className="dialog__text">
              {removing && inUse(removing) === 1 ? '1 ticket has' : `${removing ? inUse(removing) : 0} tickets have`} it. They
              stay, with no status.
            </AlertDialog.Description>
            <div className="dialog__actions">
              <AlertDialog.Cancel className="button">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action
                className="button button--danger"
                onClick={() => removing && void apply({ type: 'removeStatus', status: removing.id })}
              >
                Delete status
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

/** Name field that saves on Enter or when it loses focus. */
function StatusName({ status, apply }: { status: Status; apply: Props['apply'] }) {
  const [value, setValue] = useState(status.name);
  useEffect(() => setValue(status.name), [status.name]);
  const commit = () => {
    const name = value.trim();
    if (!name) setValue(status.name);
    else if (name !== status.name) void apply({ type: 'renameStatus', status: status.id, name });
  };
  return (
    <input
      className="input status-row__name"
      aria-label={`Name of ${status.name}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // Enter saves by leaving the field, so the blur does not save again.
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setValue(status.name);
      }}
    />
  );
}
