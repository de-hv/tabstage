import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';

import type { AppError, Command, Place } from '../api/types';

const MESSAGES: Partial<Record<AppError['code'], string>> = {
  invalidUrl: 'Enter a web address that starts with http:// or https://',
};

interface Props {
  /** Where the tab goes; `null` keeps the dialog closed. */
  place: Place | null;
  /** "Cliente / In TEST", shown in the title. */
  placeName: string;
  apply: (command: Command) => Promise<AppError | null>;
  onClose: () => void;
}

/** "New tab…" from any menu: the address and an optional title. */
export function NewTabDialog({ place, placeName, apply, onClose }: Props) {
  return (
    <Dialog.Root open={place !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog__overlay" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <Dialog.Title className="dialog__title">New tab in {placeName}</Dialog.Title>
          {place && <TabForm place={place} apply={apply} onDone={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TabForm({ place, apply, onDone }: { place: Place; apply: Props['apply']; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  return (
    <form
      className="dialog__form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!url.trim()) {
          setError("Enter the tab's address");
          return;
        }
        const failure = await apply({ type: 'addTab', place, url: url.trim(), title: title.trim() });
        if (failure) setError(MESSAGES[failure.code] ?? failure.message);
        else onDone();
      }}
    >
      <label className="field">
        <span className="field__label">URL</span>
        <input
          className="input"
          placeholder="https://"
          value={url}
          autoFocus
          aria-invalid={error ? true : undefined}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Title (optional)</span>
        <input
          className="input"
          placeholder="The URL is used when this is empty"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
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
          Add tab
        </button>
      </div>
    </form>
  );
}
