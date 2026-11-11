import * as Dialog from '@radix-ui/react-dialog';
import { type KeyboardEvent, useState } from 'react';

import type { AppError, Command, Target } from '../api/types';
import type { TargetDetails } from '../lib/workspace';

interface Props {
  /** What is being edited; `null` keeps the dialog closed. */
  target: Target | null;
  details: TargetDetails | null;
  apply: (command: Command) => Promise<AppError | null>;
  onClose: () => void;
}

const TITLES: Record<TargetDetails['kind'], string> = {
  group: 'Group details',
  folder: 'Folder details',
  tab: 'Tab details',
};

/** "Edit details…": the name, an optional ticket id and a multi-line note. */
export function DetailsDialog({ target, details, apply, onClose }: Props) {
  const open = target !== null && details !== null;
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog__overlay" />
        <Dialog.Content className="dialog details-dialog" aria-describedby={undefined}>
          <Dialog.Title className="dialog__title">{details ? TITLES[details.kind] : 'Details'}</Dialog.Title>
          {open && <DetailsForm target={target} details={details} apply={apply} onDone={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function renameCommand(target: Target, name: string): Command {
  if ('group' in target) return { type: 'renameGroup', group: target.group, name };
  if ('folder' in target) return { type: 'renameFolder', folder: target.folder, name };
  return { type: 'renameTab', tab: target.tab, title: name };
}

function DetailsForm({
  target,
  details,
  apply,
  onDone,
}: {
  target: Target;
  details: TargetDetails;
  apply: Props['apply'];
  onDone: () => void;
}) {
  const [name, setName] = useState(details.name);
  const [ticketId, setTicketId] = useState(details.ticketId ?? '');
  const [note, setNote] = useState(details.note ?? '');
  const [error, setError] = useState('');

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed && details.kind !== 'tab') {
      setError('Enter a name');
      return;
    }
    if (trimmed !== details.name) {
      const failure = await apply(renameCommand(target, trimmed));
      if (failure) {
        setError(failure.message);
        return;
      }
    }
    const failure = await apply({ type: 'setDetails', target, ticketId: ticketId.trim(), note: note.trim() });
    if (failure) setError(failure.message);
    else onDone();
  };

  const onNoteKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <form
      className="dialog__form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="input"
          value={name}
          autoFocus
          aria-invalid={error ? true : undefined}
          placeholder={details.kind === 'tab' ? 'The URL is used when this is empty' : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setError('');
          }}
        />
      </label>
      <label className="field">
        <span className="field__label">Ticket ID (optional)</span>
        <input
          className="input details-dialog__ticket"
          value={ticketId}
          maxLength={64}
          placeholder="PROJ-123"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setTicketId(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Note</span>
        <textarea
          className="input details-dialog__note"
          value={note}
          rows={5}
          maxLength={5000}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={onNoteKeyDown}
        />
      </label>
      {error && (
        <p className="add-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog__actions">
        <Dialog.Close className="button">Cancel</Dialog.Close>
        <button type="submit" className="button button--accent">
          Save
        </button>
      </div>
    </form>
  );
}
