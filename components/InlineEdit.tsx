import { useState, type KeyboardEvent } from 'react';

interface InlineEditProps {
  value: string;
  /** Names the field, e.g. "Rename To do". */
  label: string;
  className?: string;
  /** Called with the trimmed text on Enter or blur, when it changed. */
  onCommit: (value: string) => void;
  onCancel: () => void;
}

/** A text field that replaces a label while renaming. Escape cancels. */
export function InlineEdit({ value, label, className, onCommit, onCancel }: InlineEditProps) {
  const [draft, setDraft] = useState(value);
  const [done, setDone] = useState(false);

  const commit = () => {
    if (done) return;
    setDone(true);
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else onCancel();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDone(true);
      onCancel();
    }
  };

  return (
    <input
      className={`inline-edit ${className ?? ''}`.trim()}
      aria-label={label}
      value={draft}
      autoFocus
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}
