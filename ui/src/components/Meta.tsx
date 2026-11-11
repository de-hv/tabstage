import { NotebookText } from 'lucide-react';

/** The ticket id shown before a name, such as `PROJ-123`. */
export function TicketChip({ ticketId }: { ticketId?: string }) {
  if (!ticketId) return null;
  return (
    <span className="ticket" title={`Ticket ${ticketId}`}>
      {ticketId}
    </span>
  );
}

/** A note marker; the full note shows as a tooltip on hover. */
export function NoteIcon({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <span className="note-icon" role="img" aria-label={`Note: ${note}`} title={note}>
      <NotebookText className="icon" aria-hidden="true" />
    </span>
  );
}

/** A name with its ticket in front, for accessible labels. */
export function withTicket(name: string, ticketId?: string): string {
  return ticketId ? `${ticketId} ${name}` : name;
}
