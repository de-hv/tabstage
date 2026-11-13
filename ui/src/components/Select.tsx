import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  /** Drawn before the label, in the list and on the button. */
  leading?: ReactNode;
  /** Set as `data-kind` on the item and, when chosen, on the button (colors kind icons). */
  kind?: string;
}

interface Props {
  /** Accessible name, e.g. "Browser for Work". */
  label: string;
  value: string | undefined;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/** A themed replacement for `<select>`: same keyboard use, drawn like the app's menus. */
export function Select({ label, value, options, onChange, placeholder, className = '', autoFocus }: Props) {
  const chosen = options.find((option) => option.value === value);
  return (
    <RadixSelect.Root value={value} onValueChange={onChange}>
      <RadixSelect.Trigger
        className={`select__trigger ${className}`}
        aria-label={label}
        autoFocus={autoFocus}
        data-kind={chosen?.kind}
      >
        <span className="select__value">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon asChild>
          <ChevronsUpDown className="icon select__icon" aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="menu select__content" position="popper" sideOffset={4} collisionPadding={8}>
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item key={option.value} value={option.value} className="menu__item" data-kind={option.kind}>
                <RadixSelect.ItemText className="select__item-text">
                  {option.leading}
                  <span className="menu__item-label">{option.label}</span>
                </RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="menu__chevron">
                  <Check className="icon" aria-hidden="true" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
