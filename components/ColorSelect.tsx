import { ACCENT_COLORS, type AccentColor } from '@/lib/colors';

interface ColorSelectProps {
  value: AccentColor;
  onChange: (color: AccentColor) => void;
  /** Names the group for screen readers, e.g. "Color of In dev". */
  label: string;
}

/** The 10 accent colors as swatches; one is checked. */
export function ColorSelect({ value, onChange, label }: ColorSelectProps) {
  return (
    <div className="color-select" role="radiogroup" aria-label={label}>
      {ACCENT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={color}
          title={color}
          className="color-select__swatch"
          data-color={color}
          onClick={() => {
            if (color !== value) onChange(color);
          }}
        />
      ))}
    </div>
  );
}
