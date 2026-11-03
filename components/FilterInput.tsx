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
      aria-label="Filter tabs"
      placeholder="Filter tabs and groups"
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
