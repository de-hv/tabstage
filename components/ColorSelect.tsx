import { GROUP_COLORS, type GroupColor } from '@/lib/colors';

interface ColorSelectProps {
  value: GroupColor;
  onChange: (color: GroupColor) => void;
  /** Names the group for screen readers, e.g. "Color of Dev". */
  label: string;
}

/** The 9 native tab group colors as swatches; one is checked. */
export function ColorSelect({ value, onChange, label }: ColorSelectProps) {
  return (
    <div className="color-select" role="radiogroup" aria-label={label}>
      {GROUP_COLORS.map((color) => (
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
