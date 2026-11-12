import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import type { AppError, Command, Snapshot } from '../api/types';
import { parseTicketLine } from '../lib/markdown';
import { noteMenu } from '../lib/menus';
import { findNote } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { ActionMenu } from './ActionMenu';
import { useDetails } from './Details';
import { IconPicker } from './IconPicker';
import { InlineInput } from './InlineInput';
import { ItemIcon } from './ItemIcon';
import { LinkList } from './LinkList';
import { ProfileDot } from './ProfileDot';

interface Props {
  snapshot: Snapshot;
  note: string;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
  notify: (text: string) => void;
  /** Bumped to start editing the text. */
  noteRequest?: number;
  /** Bumped to open the "add link" field. */
  linkRequest?: number;
}

/**
 * A note: Markdown for what is not a ticket (standups, plans) and its links.
 * Ticket keys in it link to their tickets, and a line can become a ticket.
 */
export function NoteView({ snapshot, note: id, apply, actions, onSelect, notify, noteRequest, linkRequest }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const { workspace } = snapshot;
  const found = findNote(workspace, id);
  const details = useDetails({
    workspace,
    owner: { note: id },
    text: found?.note.body,
    profile: found?.profile,
    apply,
    actions,
    noteRequest,
    onCreateTicket: (text) => {
      if (!found) return;
      const { key, title } = parseTicketLine(text);
      void actions.newTicket({ profile: found.profile.id }, key ? `${key} ${title}` : title, null);
    },
  });
  if (!found) return null;
  const { profile, note } = found;

  return (
    <main className="group note-view" aria-labelledby="view-title">
      <nav className="crumbs" aria-label="Path">
        <button type="button" className="crumbs__link" onClick={() => onSelect({ kind: 'profile', id: profile.id })}>
          <ProfileDot color={profile.color} />
          {profile.name}
        </button>
        <span aria-hidden="true">/</span>
        <span>Notes</span>
      </nav>
      <header
        className="group__header"
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
        }}
      >
        <IconPicker name={note.title} icon={note.icon} open={iconOpen} onOpenChange={setIconOpen} onChange={(icon) => actions.setIcon({ note: id }, icon)}>
          <button type="button" className="group__icon" aria-label={`Icon of ${note.title}`}>
            <ItemIcon icon={note.icon} kind="note" />
          </button>
        </IconPicker>
        {renaming ? (
          <InlineInput
            label="New name"
            initial={note.title}
            onCancel={() => setRenaming(false)}
            onSubmit={async (name) => {
              const saved = !(await apply({ type: 'rename', target: { note: id }, name }));
              if (saved) setRenaming(false);
              return saved;
            }}
          />
        ) : (
          <h1 id="view-title" className="group__name" onDoubleClick={() => setRenaming(true)}>
            {note.title}
          </h1>
        )}
        <div className="group__actions">
          {(note.links?.length ?? 0) > 0 && (
            <button type="button" className="button" onClick={() => actions.openNote(id)}>
              <ExternalLink className="icon" aria-hidden="true" />
              Open all links
            </button>
          )}
          <ActionMenu
            label={`Options for ${note.title}`}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            entries={noteMenu(id, { rename: () => setRenaming(true), openLeading: () => setIconOpen(true) }, {
              workspace,
              actions,
              apply: (command) => void apply(command),
            })}
          />
        </div>
      </header>

      {details.textEditor}

      <LinkList owner={{ note: id }} links={note.links ?? []} apply={apply} actions={actions} notify={notify} addRequest={linkRequest} />
    </main>
  );
}
