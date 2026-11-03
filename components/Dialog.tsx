import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  /** `alertdialog` for a question that needs an answer. */
  role?: 'dialog' | 'alertdialog';
  className?: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';

/**
 * A modal layer over the panel. It focuses its first control, keeps Tab
 * inside, closes on Escape or a click on the backdrop, and gives focus back
 * on close.
 */
export function Dialog({ title, role = 'dialog', className, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    const panel = ref.current;
    const first = panel?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ??
      panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    // An inner control (the palette input, a rename field) handled it.
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !ref.current) return;
    const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-label={title}
        className={`dialog ${className ?? ''}`.trim()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
