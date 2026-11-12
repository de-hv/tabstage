import { useState } from 'react';

import type { AppError, Command, Profile, Target } from '../api/types';
import { ticketLink } from '../lib/urls';
import type { ItemActions } from '../state/selection';
import { useItemShortcuts } from '../state/useItemShortcuts';
import { TicketField } from './Meta';
import { NoteEditor } from './NoteEditor';

interface Options {
  target: Target;
  ticketId: string | undefined;
  note: string | undefined;
  /** The profile it belongs to; `undefined` while it is not found. */
  profile: Profile | undefined;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  /** Bumped by the app (e.g. "Edit details…" in a menu) to start editing the note. */
  noteRequest?: number;
}

/**
 * The ticket field for a view's header and the note editor for its body,
 * edited in place and saved together, with the T and E shortcuts.
 */
export function useDetails({ target, ticketId, note, profile, apply, actions, noteRequest = 0 }: Options) {
  const [ticketRequest, setTicketRequest] = useState(0);
  const [ownNoteRequest, setOwnNoteRequest] = useState(0);
  useItemShortcuts({
    onTicket: () => setTicketRequest((count) => count + 1),
    onNote: () => setOwnNoteRequest((count) => count + 1),
  });

  const save = async (nextTicket: string, nextNote: string) =>
    !(await apply({ type: 'setDetails', target, ticketId: nextTicket, note: nextNote }));
  const link = ticketLink(profile?.ticketUrl, ticketId);

  const ticket = (
    <TicketField
      ticketId={ticketId}
      link={link}
      onOpen={link ? () => actions.openTicket(target) : undefined}
      onSave={(next) => save(next, note ?? '')}
      editRequest={ticketRequest}
    />
  );
  const noteEditor = (
    <NoteEditor
      note={note}
      onSave={(next) => save(ticketId ?? '', next)}
      onOpenLink={(url) => profile && actions.openUrl(profile.id, url)}
      // Either request starts editing; both only grow, so their sum changes with each.
      editRequest={noteRequest + ownNoteRequest}
    />
  );
  return { ticket, noteEditor };
}
