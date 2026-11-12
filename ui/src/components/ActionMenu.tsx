import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, type LucideIcon, MoreHorizontal } from 'lucide-react';
import { useRef } from 'react';

/** One line of an item's menu. */
export interface MenuEntry {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  danger?: boolean;
  /** Draw a line above this entry. */
  separated?: boolean;
  /** The entry opens an inline field; focus stays there when the menu closes. */
  keepsFocus?: boolean;
  /** A submenu, e.g. "Move to…". Hidden when empty. */
  items?: { label: string; onSelect: () => void }[];
}

interface Props {
  /** Accessible name of the "⋯" button, e.g. "Options for In TEST". */
  label: string;
  entries: MenuEntry[];
  /** Controlled, so a right-click on the row can open it too. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

/** The "⋯" menu of a profile, group, folder or tab. */
export function ActionMenu({ label, entries, open, onOpenChange, className = '' }: Props) {
  // Renaming swaps the row for an input; returning focus to the trigger
  // would pull focus out of that input.
  const keepFocus = useRef(false);

  return (
    <Menu.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger asChild>
        <button type="button" className={`icon-button row-menu__trigger ${className}`} aria-label={label}>
          <MoreHorizontal className="icon" aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="menu"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onCloseAutoFocus={(event) => {
            if (keepFocus.current) event.preventDefault();
            keepFocus.current = false;
          }}
        >
          {entries.map((entry) => {
            const Icon = entry.icon;
            const content = (
              <>
                {Icon && <Icon className="icon" aria-hidden="true" />}
                {entry.label}
              </>
            );
            if (entry.items) {
              if (entry.items.length === 0) return null;
              return (
                <Menu.Sub key={entry.label}>
                  {entry.separated && <Menu.Separator className="separator" />}
                  <Menu.SubTrigger className="menu__item">
                    {content}
                    <ChevronRight className="icon menu__chevron" aria-hidden="true" />
                  </Menu.SubTrigger>
                  <Menu.Portal>
                    <Menu.SubContent className="menu" sideOffset={4} collisionPadding={8}>
                      {entry.items.map((item) => (
                        <Menu.Item key={item.label} className="menu__item" title={item.label} onSelect={item.onSelect}>
                          <span className="menu__item-label">{item.label}</span>
                        </Menu.Item>
                      ))}
                    </Menu.SubContent>
                  </Menu.Portal>
                </Menu.Sub>
              );
            }
            return (
              <div key={entry.label} className="menu__group">
                {entry.separated && <Menu.Separator className="separator" />}
                <Menu.Item
                  className={`menu__item${entry.danger ? ' menu__item--danger' : ''}`}
                  onSelect={() => {
                    if (entry.keepsFocus) keepFocus.current = true;
                    entry.onSelect?.();
                  }}
                >
                  {content}
                </Menu.Item>
              </div>
            );
          })}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
