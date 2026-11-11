import { NotebookPen } from 'lucide-react';

interface Props {
  ticketId?: string;
  note?: string;
  onEdit: () => void;
}

/** The ticket id and note of a group, folder or tab, with a button to edit them. */
export function DetailsSummary({ ticketId, note, onEdit }: Props) {
  return (
    <section className="details-summary" aria-label="Details">
      {ticketId || note ? (
        <dl className="details-summary__list">
          {ticketId && (
            <div className="details-summary__item">
              <dt className="tab-detail__label">Ticket</dt>
              <dd className="details-summary__ticket">{ticketId}</dd>
            </div>
          )}
          {note && (
            <div className="details-summary__item">
              <dt className="tab-detail__label">Note</dt>
              <dd className="details-summary__note">{note}</dd>
            </div>
          )}
        </dl>
      ) : null}
      <button type="button" className="button details-summary__edit" onClick={onEdit}>
        <NotebookPen className="icon" aria-hidden="true" />
        {ticketId || note ? 'Edit details' : 'Add ticket or note'}
      </button>
    </section>
  );
}
