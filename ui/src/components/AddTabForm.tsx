import { useState } from 'react';

import type { AppError } from '../api/types';

interface Props {
  onSubmit: (url: string, title: string) => Promise<AppError | null>;
  onCancel: () => void;
}

const MESSAGES: Partial<Record<AppError['code'], string>> = {
  invalidUrl: 'Enter a web address that starts with http:// or https://',
};

/** URL plus optional title. Stays open on errors so the text is not lost. */
export function AddTabForm({ onSubmit, onCancel }: Props) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  return (
    <form
      className="add-form"
      onKeyDown={(event) => event.key === 'Escape' && onCancel()}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!url.trim()) return;
        const failure = await onSubmit(url.trim(), title.trim());
        if (failure) {
          setError(MESSAGES[failure.code] ?? failure.message);
          return;
        }
        setUrl('');
        setTitle('');
        setError('');
      }}
    >
      <input
        className="input"
        aria-label="URL"
        placeholder="https://"
        value={url}
        autoFocus
        aria-invalid={error ? true : undefined}
        onChange={(event) => setUrl(event.target.value)}
      />
      <input
        className="input"
        aria-label="Title (optional)"
        placeholder="Title (optional)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button type="submit" className="button">
        Save
      </button>
      {error && (
        <p className="add-form__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
