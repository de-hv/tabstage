import { ExternalLink, NotebookText, Pencil, Plus, Ticket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { plainText } from '../lib/markdown';

/** The ticket id shown before a name, such as `PROJ-123`. */
export function TicketChip({ ticketId }: { ticketId?: string }) {
  if (!ticketId) return null;
  return (
    <span className="ticket" title={`Ticket ${ticketId}`}>
      {ticketId}
    </span>
  );
}

/** A note marker; the start of the note, as plain text, shows as a tooltip on hover. */
export function NoteIcon({ note }: { note?: string }) {
  if (!note) return null;
  const text = plainText(note);
  return (
    <span className="note-icon" role="img" aria-label={`Note: ${text}`} title={text}>
      <NotebookText className="icon" aria-hidden="true" />
    </span>
  );
}

/** A name with its ticket in front, for accessible labels. */
export function withTicket(name: string, ticketId?: string): string {
  return ticketId ? `${ticketId} ${name}` : name;
}

interface TicketFieldProps {
  ticketId?: string;
  /** Where the ticket opens; without one a click on the chip edits it. */
  link?: string;
  onOpen?: () => void;
  /** Saves the ticket id; blank removes it. Resolves to whether it was saved. */
  onSave: (ticketId: string) => Promise<boolean>;
  /** Starts editing whenever this changes to a new non-zero value. */
  editRequest?: number;
}

/**
 * The ticket id in a view's header, edited in place: "+ Ticket" when there
 * is none, an input while editing, and a chip (a link when the profile has
 * a ticket URL) with a pencil once saved.
 */
export function TicketField({ ticketId, link, onOpen, onSave, editRequest = 0 }: TicketFieldProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ticketId ?? '');
  const saving = useRef(false);

  const start = () => {
    setValue(ticketId ?? '');
    setEditing(true);
  };

  useEffect(() => {
    if (editRequest) start();
    // `start` only reads the latest ticket id; re-run on a new request only.
  }, [editRequest]);

  const commit = async () => {
    if (saving.current) return;
    const next = value.trim();
    if (next === (ticketId ?? '')) {
      setEditing(false);
      return;
    }
    saving.current = true;
    const saved = await onSave(next);
    saving.current = false;
    if (saved) setEditing(false);
  };

  if (editing) {
    return (
      <span className="ticket-field ticket-field--editing">
        <Ticket className="icon" aria-hidden="true" />
        <input
          className="ticket-field__input"
          aria-label="Ticket ID"
          value={value}
          maxLength={64}
          placeholder="PROJ-123"
          spellCheck={false}
          autoComplete="off"
          size={Math.max(8, value.length + 1)}
          ref={(input) => {
            if (input && document.activeElement !== input) {
              input.focus();
              input.select();
            }
          }}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setEditing(false);
            }
          }}
        />
      </span>
    );
  }

  if (!ticketId) {
    return (
      <button type="button" className="ticket-field ticket-field--empty" onClick={start} title="Add a ticket ID (T)">
        <Plus className="icon" aria-hidden="true" />
        Ticket
      </button>
    );
  }

  return (
    <span className="ticket-field__group">
      {link && onOpen ? (
        <button
          type="button"
          className="ticket-field ticket-field--link"
          title={link}
          aria-label={`Open ticket ${ticketId}`}
          onClick={onOpen}
          onDoubleClick={start}
        >
          {ticketId}
          <ExternalLink className="icon" aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="ticket-field" aria-label={`Edit ticket ${ticketId}`} onClick={start}>
          {ticketId}
        </button>
      )}
      <button type="button" className="icon-button ticket-field__edit" aria-label="Edit ticket ID" title="Edit ticket ID (T)" onClick={start}>
        <Pencil className="icon" aria-hidden="true" />
      </button>
    </span>
  );
}
