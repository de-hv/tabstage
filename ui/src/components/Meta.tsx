import { Copy, ExternalLink, NotebookText, Pencil, Plus } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { plainText } from '../lib/markdown';
import { Tip } from './Tooltip';

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
  /** The ticket's own address: a click on the chip opens it. */
  link?: string;
  onOpen?: () => void;
  /** Copies the address; shown as a button next to the chip. */
  onCopy?: () => void;
  /**
   * Saves the ticket id and address; blank removes either. Resolves to an
   * error message to show, or `null` once saved.
   */
  onSave: (next: { ticketId: string; link: string }) => Promise<string | null>;
  /** Starts editing whenever this changes to a new non-zero value. */
  editRequest?: number;
}

/**
 * The ticket id and its address in a view's header, edited together in
 * place: "+ Ticket" when there are none, two fields while editing, and a
 * chip that opens the address, with a pencil, once saved.
 */
export function TicketField({ ticketId, link, onOpen, onCopy, onSave, editRequest = 0 }: TicketFieldProps) {
  const [editing, setEditing] = useState(false);
  const [id, setId] = useState(ticketId ?? '');
  const [url, setUrl] = useState(link ?? '');
  const [error, setError] = useState('');
  const saving = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  const start = () => {
    setId(ticketId ?? '');
    setUrl(link ?? '');
    setError('');
    setEditing(true);
  };

  useEffect(() => {
    if (editRequest) start();
    // `start` only reads the latest values; re-run on a new request only.
  }, [editRequest]);

  const commit = async () => {
    if (saving.current) return;
    const next = { ticketId: id.trim(), link: url.trim() };
    if (next.ticketId === (ticketId ?? '') && next.link === (link ?? '')) {
      setEditing(false);
      return;
    }
    saving.current = true;
    const failure = await onSave(next);
    saving.current = false;
    if (failure) setError(failure);
    else setEditing(false);
  };

  if (editing) {
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setEditing(false);
      }
    };
    return (
      <form
        ref={form}
        className="ticket-form"
        aria-label="Ticket ID and link"
        onSubmit={(event) => {
          event.preventDefault();
          void commit();
        }}
        onBlur={(event) => {
          // Leaving both fields saves, like the old single field did.
          if (!form.current?.contains(event.relatedTarget as Node | null)) void commit();
        }}
      >
        <label className="ticket-form__row">
          <span className="ticket-form__label">ID</span>
          <input
            className="ticket-form__input ticket-form__input--id"
            aria-label="Ticket ID"
            value={id}
            maxLength={64}
            placeholder="PROJ-123"
            spellCheck={false}
            autoComplete="off"
            autoFocus
            onFocus={(event) => event.target.select()}
            onChange={(event) => setId(event.target.value)}
            onKeyDown={keys}
          />
        </label>
        <label className="ticket-form__row">
          <span className="ticket-form__label">Link</span>
          <input
            className="ticket-form__input"
            aria-label="Ticket link"
            value={url}
            placeholder="https://… (its page in Jira, Linear…)"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setUrl(event.target.value);
              setError('');
            }}
            onKeyDown={keys}
          />
        </label>
        {error && (
          <p className="add-form__error ticket-form__error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" hidden>
          Save
        </button>
      </form>
    );
  }

  if (!ticketId && !link) {
    return (
      <Tip label="Add a ticket ID and link" keys="T">
        <button type="button" className="ticket-field ticket-field--empty" onClick={start}>
          <Plus className="icon" aria-hidden="true" />
          Ticket
        </button>
      </Tip>
    );
  }

  const label = ticketId || hostOf(link!);
  return (
    <span className="ticket-field__group">
      {link && onOpen ? (
        <button
          type="button"
          className="ticket-field ticket-field--link"
          title={`${link}\nDouble-click to edit`}
          aria-label={`Open ticket ${label}`}
          onClick={onOpen}
          onDoubleClick={start}
        >
          {label}
          <ExternalLink className="icon" aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="ticket-field" aria-label={`Edit ticket ${label}`} onClick={start}>
          {label}
        </button>
      )}
      <Tip label="Edit ticket ID and link" keys="T">
        <button
          type="button"
          className="icon-button ticket-field__edit"
          aria-label="Edit ticket ID and link"
          onClick={start}
        >
          <Pencil className="icon" aria-hidden="true" />
        </button>
      </Tip>
      {link && onCopy && (
        <Tip label="Copy link">
          <button type="button" className="icon-button ticket-field__copy" aria-label="Copy ticket link" onClick={onCopy}>
            <Copy className="icon" aria-hidden="true" />
          </button>
        </Tip>
      )}
    </span>
  );
}

/** The host of an address, for a chip without a ticket id. */
function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
