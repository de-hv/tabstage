import type { KeyboardEvent } from 'react';

interface PaletteInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  /** Id of the results listbox. */
  listId: string;
  /** Id of the selected option, if any. */
  activeId?: string;
}

/** The palette's command box. It has focus as soon as the popup opens. */
export function PaletteInput({ value, onChange, onKeyDown, listId, activeId }: PaletteInputProps) {
  return (
    <input
      type="text"
      role="combobox"
      className="palette-input"
      aria-label="Command"
      aria-expanded="true"
      aria-controls={listId}
      aria-activedescendant={activeId}
      aria-autocomplete="list"
      placeholder="Search groups and tabs, or type “6115 dev”"
      value={value}
      autoFocus
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
