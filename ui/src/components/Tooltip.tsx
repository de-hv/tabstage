import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

/** Shares the delay: once one tooltip shows, the next ones show right away. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}

interface Props {
  label: string;
  /** Keyboard shortcut shown after the label, e.g. "⌘K". */
  keys?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** One element that takes a ref, usually an icon button. */
  children: ReactNode;
}

/** A themed tooltip for an icon button; it also shows on keyboard focus. */
export function Tip({ label, keys, side = 'bottom', children }: Props) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip" side={side} sideOffset={6} collisionPadding={8}>
          {label}
          {keys && <kbd className="tooltip__keys">{keys}</kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
