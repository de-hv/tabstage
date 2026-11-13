import * as Toast from '@radix-ui/react-toast';
import { X } from 'lucide-react';

import type { Notice } from '../state/useWorkspace';

/** How long a notice stays, unless the pointer rests on it. */
const NOTICE_MS = 3000;
/** Older notices beyond this are dropped from view. */
const MAX_VISIBLE = 3;

interface Props {
  notices: Notice[];
  onDismiss: (id: number) => void;
}

/** Short notices at the bottom right; new ones stack on top of older ones. */
export function Toasts({ notices, onDismiss }: Props) {
  return (
    <Toast.Provider duration={NOTICE_MS} swipeDirection="right" label="Notification">
      {notices.slice(-MAX_VISIBLE).map((notice) => (
        <Toast.Root key={notice.id} className="toast" onOpenChange={(open) => !open && onDismiss(notice.id)}>
          <Toast.Title className="toast__text">{notice.text}</Toast.Title>
          <Toast.Close className="icon-button toast__close" aria-label="Dismiss">
            <X className="icon" aria-hidden="true" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="toasts" />
    </Toast.Provider>
  );
}
