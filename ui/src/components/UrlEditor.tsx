import { useState } from 'react';

import type { AppError } from '../api/types';

interface Props {
  initial: string;
  /** Saves the new address; resolves to the error when it was refused. */
  onSubmit: (url: string) => Promise<AppError | null>;
  onDone: () => void;
}

const MESSAGES: Partial<Record<AppError['code'], string>> = {
  invalidUrl: 'Enter a web address that starts with http:// or https://',
};

/**
 * Edits a tab's address. Enter saves, Escape cancels; on an error the field
 * stays open with the text so it can be fixed.
 */
export function UrlEditor({ initial, onSubmit, onDone }: Props) {
  const [url, setUrl] = useState(initial);
  const [error, setError] = useState('');

  return (
    <form
      className="url-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = url.trim();
        if (!trimmed || trimmed === initial) {
          onDone();
          return;
        }
        const failure = await onSubmit(trimmed);
        if (failure) {
          setError(MESSAGES[failure.code] ?? failure.message);
          return;
        }
        onDone();
      }}
    >
      <input
        className="input url-editor__input"
        aria-label="Address"
        placeholder="https://"
        value={url}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        onFocus={(event) => event.target.select()}
        onChange={(event) => {
          setUrl(event.target.value);
          setError('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onDone();
          }
        }}
      />
      <div className="url-editor__actions">
        <button type="button" className="button" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="button button--accent">
          Save
        </button>
      </div>
      {error && (
        <p className="add-form__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
