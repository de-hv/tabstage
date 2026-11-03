import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { MenuItem } from '@/lib/panel-menus';

export type { MenuItem };

interface ContextMenuProps {
  /** Names the menu for screen readers, e.g. "Actions for PR #42". */
  label: string;
  items: MenuItem[];
  /** Viewport point to open at; the menu is kept inside the window. */
  x: number;
  y: number;
  onClose: () => void;
}

interface Level {
  title: string;
  items: MenuItem[];
  /** Index in the parent level to focus when going back. */
  from: number;
}

const MARGIN = 4;

/**
 * A right-click menu, one level at a time (the panel is narrow): a submenu
 * replaces the list, with a back entry on top.
 *
 * Keyboard: ↑/↓ (wrapping), Home/End, Enter or Space runs or opens, → opens a
 * submenu, ← goes back, Escape goes back or closes, Tab closes. On close,
 * focus goes back to where it was when the menu opened.
 */
export function ContextMenu({ label, items, x, y, onClose }: ContextMenuProps) {
  const [levels, setLevels] = useState<Level[]>([{ title: label, items, from: 0 }]);
  const [active, setActive] = useState(() => Math.max(0, items.findIndex((item) => !item.disabled)));
  const [position, setPosition] = useState({ left: x, top: y });
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);

  const level = levels.at(-1)!;
  const nested = levels.length > 1;
  // Index 0 is the back entry in a submenu.
  const entries = nested ? [null, ...level.items] : level.items;
  const enabled = (index: number) => {
    const entry = entries[index];
    return entry === null || (entry !== undefined && !entry.disabled);
  };

  const close = () => {
    onClose();
    const target = returnFocus.current;
    if (target instanceof HTMLElement && target.isConnected) target.focus();
  };

  useEffect(() => {
    returnFocus.current = document.activeElement;
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onBlur = () => onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y, levels]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.focus();
  }, [active, levels]);

  const open = (item: MenuItem, index: number) => {
    const sub = item.submenu ?? [];
    setLevels([...levels, { title: item.label, items: sub, from: index }]);
    const first = sub.findIndex((entry) => !entry.disabled);
    setActive(first === -1 ? 0 : first + 1);
  };

  const back = () => {
    if (!nested) return close();
    setLevels(levels.slice(0, -1));
    setActive(level.from);
  };

  const run = (index: number) => {
    const entry = entries[index];
    if (entry === null) return back();
    if (!entry || entry.disabled) return;
    if (entry.submenu) return open(entry, index);
    entry.onSelect?.();
    close();
  };

  const step = (from: number, delta: 1 | -1) => {
    for (let i = 1; i <= entries.length; i++) {
      const next = (from + delta * i + entries.length) % entries.length;
      if (enabled(next)) return next;
    }
    return from;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const entry = entries[active];
    switch (event.key) {
      case 'ArrowDown':
        setActive(step(active, 1));
        break;
      case 'ArrowUp':
        setActive(step(active, -1));
        break;
      case 'Home':
        setActive(step(entries.length - 1, 1));
        break;
      case 'End':
        setActive(step(0, -1));
        break;
      case 'Enter':
      case ' ':
        run(active);
        break;
      case 'ArrowRight':
        if (entry?.submenu && !entry.disabled) open(entry, active);
        break;
      case 'ArrowLeft':
        if (nested) back();
        break;
      case 'Escape':
        back();
        break;
      case 'Tab':
        close();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={nested ? level.title : label}
      style={{ left: position.left, top: position.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry, index) =>
        entry === null ? (
          <button
            key="back"
            type="button"
            role="menuitem"
            className="context-menu__item context-menu__back"
            data-index={index}
            tabIndex={index === active ? 0 : -1}
            onClick={back}
          >
            <span aria-hidden="true">‹</span> {level.title}
          </button>
        ) : (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            className={`context-menu__item${entry.danger ? ' context-menu__item--danger' : ''}`}
            data-index={index}
            tabIndex={index === active ? 0 : -1}
            aria-disabled={entry.disabled || undefined}
            aria-haspopup={entry.submenu ? 'menu' : undefined}
            onMouseEnter={() => enabled(index) && setActive(index)}
            onClick={() => run(index)}
          >
            {entry.color && <span className="square" data-color={entry.color} aria-hidden="true" />}
            <span className="context-menu__label">{entry.label}</span>
            {entry.submenu && <span className="context-menu__arrow" aria-hidden="true">▸</span>}
          </button>
        ),
      )}
      {entries.length === 0 && <p className="context-menu__empty">Nothing here</p>}
    </div>
  );
}
