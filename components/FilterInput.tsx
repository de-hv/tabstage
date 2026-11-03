interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
}

/** The search box on top of the panel. Escape clears it. */
export function FilterInput({ value, onChange }: FilterInputProps) {
  return (
    <input
      type="search"
      className="filter-input"
      aria-label="Filter groups"
      placeholder="Filter by ticket, name or tab"
      value={value}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && value) {
          event.preventDefault();
          onChange('');
        }
      }}
    />
  );
}
