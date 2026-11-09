import { useState } from 'react';

interface Props {
  label: string;
  placeholder?: string;
  /** Starting text, selected so typing replaces it. */
  initial?: string;
  onSubmit: (value: string) => Promise<boolean>;
  onCancel: () => void;
}

/** One-field form for names: Enter saves, Escape or leaving unchanged cancels. */
export function InlineInput({ label, placeholder, initial = '', onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initial);

  return (
    <form
      className="inline-input"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        if (trimmed === initial) {
          onCancel();
          return;
        }
        if ((await onSubmit(trimmed)) && !initial) setValue('');
      }}
    >
      <input
        className="input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          }
        }}
        onBlur={() => {
          const trimmed = value.trim();
          if (!trimmed || trimmed === initial) onCancel();
        }}
      />
    </form>
  );
}
