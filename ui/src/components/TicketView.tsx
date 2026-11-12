import { Copy, ExternalLink, Link2, ListTree, NotebookText, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';

import type { AppError, Command, Snapshot } from '../api/types';
import { profileBrowser } from '../lib/browsers';
import { ticketMenu } from '../lib/menus';
import { pressable } from '../lib/pressable';
import { profileColor } from '../lib/profileColors';
import { findStatus, findTicket, mentionsOf } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { ActionMenu } from './ActionMenu';
import { useDetails } from './Details';
import { IconPicker } from './IconPicker';
import { InlineInput } from './InlineInput';
import { ItemIcon } from './ItemIcon';
import { LinkList } from './LinkList';
import { ProfileDot } from './ProfileDot';
import { SetupNote } from './SetupNote';
import { StatusPicker, StatusPill } from './StatusPill';
import { UrlEditor } from './UrlEditor';

interface Props {
  snapshot: Snapshot;
  ticket: string;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
  notify: (text: string) => void;
  /** Bumped to start editing the note. */
  noteRequest?: number;
  /** Bumped to open the "add link" field. */
  linkRequest?: number;
}

/** A ticket: its key, status and link, its links, sub-tickets and note, and the notes that mention it. */
export function TicketView({ snapshot, ticket: id, apply, actions, onSelect, notify, noteRequest, linkRequest }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const { workspace } = snapshot;
  const found = findTicket(workspace, id);
  const details = useDetails({
    workspace,
    owner: { ticket: id },
    ticketKey: found?.ticket.key,
    ticketUrl: found?.ticket.url,
    text: found?.ticket.note,
    profile: found?.profile,
    apply,
    actions,
    noteRequest,
  });
  if (!found) return null;
  const { profile, parent, ticket } = found;
  const status = findStatus(workspace, ticket.status);
  const browser = profileBrowser(snapshot, profile.id)?.name;
  const children = ticket.children ?? [];
  const mentions = mentionsOf(workspace, ticket.key);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Address copied');
    } catch {
      notify('Could not copy the address');
    }
  };

  return (
    <main className="group ticket-view" aria-labelledby="view-title">
      <nav className="crumbs" aria-label="Path">
        <button type="button" className="crumbs__link" onClick={() => onSelect({ kind: 'profile', id: profile.id })}>
          <ProfileDot color={profile.color} />
          {profile.name}
        </button>
        {parent && (
          <>
            <span aria-hidden="true">/</span>
            <button type="button" className="crumbs__link" onClick={() => onSelect({ kind: 'ticket', id: parent.id })}>
              {parent.key ? `${parent.key} ${parent.title}` : parent.title}
            </button>
          </>
        )}
      </nav>
      <header
        className="group__header"
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
        }}
      >
        <IconPicker
          name={ticket.title}
          icon={ticket.icon}
          open={iconOpen}
          onOpenChange={setIconOpen}
          onChange={(icon) => actions.setIcon({ ticket: id }, icon)}
        >
          <button
            type="button"
            className="group__icon"
            aria-label={`Icon of ${ticket.title}`}
            style={status ? { color: profileColor(status.color) } : undefined}
          >
            <ItemIcon icon={ticket.icon} kind="ticket" />
          </button>
        </IconPicker>
        {renaming ? (
          <InlineInput
            label="New name"
            initial={ticket.title}
            onCancel={() => setRenaming(false)}
            onSubmit={async (name) => {
              const saved = !(await apply({ type: 'rename', target: { ticket: id }, name }));
              if (saved) setRenaming(false);
              return saved;
            }}
          />
        ) : (
          <h1 id="view-title" className="group__name" onDoubleClick={() => setRenaming(true)}>
            {ticket.title}
          </h1>
        )}
        <div className="ticket-view__meta">
          {details.keyField}
          <StatusPicker
            statuses={workspace.statuses}
            value={status}
            onChange={(next) => void apply({ type: 'setTicketStatus', ticket: id, status: next })}
            onEditStatuses={actions.editStatuses}
          />
        </div>
        <div className="group__actions">
          {ticket.url && (
            <button type="button" className="button button--accent" onClick={() => actions.openTicket(id)}>
              <ExternalLink className="icon" aria-hidden="true" />
              {browser ? `Open in ${browser}` : 'Open'}
            </button>
          )}
          <button type="button" className="button" onClick={() => actions.openTicketAll(id)}>
            <ExternalLink className="icon" aria-hidden="true" />
            Open all
          </button>
          <ActionMenu
            label={`Options for ${ticket.title}`}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            entries={ticketMenu(id, { rename: () => setRenaming(true), openLeading: () => setIconOpen(true) }, {
              workspace,
              actions,
              apply: (command) => void apply(command),
            })}
          />
        </div>
      </header>

      <SetupNote snapshot={snapshot} profile={profile} onConfigure={() => actions.configureProfile(profile.id)} />

      <section className="ticket-link" aria-label="Ticket link">
        <Link2 className="icon" aria-hidden="true" />
        {editingUrl ? (
          <UrlEditor
            initial={ticket.url ?? ''}
            onSubmit={(url) => apply({ type: 'setTicketUrl', ticket: id, url })}
            onDone={() => setEditingUrl(false)}
          />
        ) : ticket.url ? (
          <>
            <span className="ticket-link__url" title={ticket.url}>
              {ticket.url}
            </span>
            <button type="button" className="icon-button" aria-label="Edit the ticket's link" title="Edit link" onClick={() => setEditingUrl(true)}>
              <Pencil className="icon" aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" aria-label="Copy the ticket's link" title="Copy link" onClick={() => void copy(ticket.url!)}>
              <Copy className="icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove the ticket's link"
              title="Remove link"
              onClick={() => void apply({ type: 'setTicketUrl', ticket: id, url: '' })}
            >
              <X className="icon" aria-hidden="true" />
            </button>
          </>
        ) : (
          <button type="button" className="link-button" onClick={() => setEditingUrl(true)}>
            Add the ticket's link (its page in Jira, Linear…)
          </button>
        )}
      </section>

      <LinkList owner={{ ticket: id }} links={ticket.links ?? []} apply={apply} actions={actions} notify={notify} addRequest={linkRequest} />

      {!parent && (
        <section className="panel" aria-label="Sub-tickets">
          <header className="panel__bar">
            <ListTree className="icon" aria-hidden="true" />
            <span className="panel__label">Sub-tickets</span>
            <span className="panel__count">{children.length}</span>
            <button type="button" className="button panel__action" onClick={() => setAddingChild(true)}>
              <Plus className="icon" aria-hidden="true" />
              Add sub-ticket
            </button>
          </header>
          {addingChild && (
            <div className="panel__form">
              <InlineInput
                label="Sub-ticket title"
                placeholder="CAR-6021 Matches legacy money card"
                onCancel={() => setAddingChild(false)}
                onSubmit={async (title) => {
                  const saved = await actions.newTicket({ ticket: id }, title, ticket.status ?? null);
                  if (saved) setAddingChild(false);
                  return saved;
                }}
              />
            </div>
          )}
          {children.length === 0 && !addingChild ? (
            <p className="panel__empty">Split the work: sub-tickets keep their own status and links.</p>
          ) : (
            <ul className="sub-list">
              {children.map((child) => {
                const childStatus = findStatus(workspace, child.status);
                return (
                  <li key={child.id}>
                    <div
                      {...pressable(() => onSelect({ kind: 'ticket', id: child.id }))}
                      className="sub-row"
                      onClick={() => onSelect({ kind: 'ticket', id: child.id })}
                    >
                      <StatusPill name={childStatus?.name ?? 'No status'} color={childStatus?.color} />
                      {child.key && <span className="ticket">{child.key}</span>}
                      <span className="sub-row__title">{child.title}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {details.textEditor}

      {mentions.length > 0 && (
        <section className="mentions" aria-label="Mentioned in">
          <span className="mentions__label">Mentioned in</span>
          {mentions.map(({ note }) => (
            <button key={note.id} type="button" className="mention" onClick={() => onSelect({ kind: 'note', id: note.id })}>
              <NotebookText className="icon" aria-hidden="true" />
              {note.title}
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
