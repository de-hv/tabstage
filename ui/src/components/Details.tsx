import { useMemo, useState } from 'react';

import type { AppError, Command, LinkOwner, Profile, Workspace } from '../api/types';
import { ticketsByKey } from '../lib/workspace';
import type { ItemActions } from '../state/selection';
import { useItemShortcuts } from '../state/useItemShortcuts';
import { TicketField } from './Meta';
import { NoteEditor } from './NoteEditor';

interface Options {
  workspace: Workspace;
  owner: LinkOwner;
  /** A ticket's key and address; a note has neither. */
  ticketKey?: string;
  ticketUrl?: string;
  text: string | undefined;
  profile: Profile | undefined;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  /** Bumped by the app (e.g. "Edit note" in a menu) to start editing the text. */
  noteRequest?: number;
  /** Creates a ticket from a line of a note. */
  onCreateTicket?: (text: string) => void;
}

/**
 * The key field for a ticket's header and the Markdown editor for the body
 * of a ticket or note, edited in place, with the T and E shortcuts. Keys of
 * known tickets in the text show as links to them.
 */
export function useDetails(options: Options) {
  const { workspace, owner, ticketKey, ticketUrl, text, profile, apply, actions, noteRequest = 0 } = options;
  const [keyRequest, setKeyRequest] = useState(0);
  const [ownNoteRequest, setOwnNoteRequest] = useState(0);
  const isTicket = 'ticket' in owner;
  useItemShortcuts({
    onTicket: () => isTicket && setKeyRequest((count) => count + 1),
    onNote: () => setOwnNoteRequest((count) => count + 1),
  });
  const keys = useMemo(
    () => new Map([...ticketsByKey(workspace)].map(([key, ticket]) => [key, ticket.id])),
    [workspace],
  );

  const keyField =
    'ticket' in owner ? (
      <TicketField
        ticketId={ticketKey}
        link={ticketUrl}
        onOpen={ticketUrl ? () => actions.openTicket(owner.ticket) : undefined}
        onSave={async (key) => !(await apply({ type: 'setTicketKey', ticket: owner.ticket, key }))}
        editRequest={keyRequest}
      />
    ) : null;
  const textEditor = (
    <NoteEditor
      note={text}
      label={isTicket ? 'Note' : 'Notes'}
      onSave={async (next) => !(await apply({ type: 'setText', owner, text: next }))}
      onOpenLink={(url) => profile && actions.openUrl(profile.id, url)}
      ticketKeys={keys}
      onOpenTicket={(ticket) => actions.select({ kind: 'ticket', id: ticket })}
      onCreateTicket={options.onCreateTicket}
      // Either request starts editing; both only grow, so their sum changes with each.
      editRequest={noteRequest + ownNoteRequest}
    />
  );
  return { keyField, textEditor };
}
