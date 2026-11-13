import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, ExternalLink, ListTree, NotebookText, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

import type { AppError, Command, Snapshot, TicketKind } from '../api/types';
import { profileBrowser } from '../lib/browsers';
import { ticketMenu } from '../lib/menus';
import { pressable } from '../lib/pressable';
import { profileColor } from '../lib/profileColors';
import { TICKET_KINDS, kindInfo } from '../lib/ticketKinds';
import { findStatus, findTicket, mentionsOf } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { ActionMenu } from './ActionMenu';
import { useDetails } from './Details';
import { IconPicker } from './IconPicker';
import { InlineInput } from './InlineInput';
import { ItemIcon } from './ItemIcon';
import { ProfileDot } from './ProfileDot';
import { SetupNote } from './SetupNote';
import { StatusPicker, StatusPill } from './StatusPill';

interface Props {
  snapshot: Snapshot;
  ticket: string;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
  notify: (text: string) => void;
  /** Bumped to start editing the note. */
  noteRequest?: number;
}

/** A ticket: its key and link, status, sub-tickets and note, and the notes that mention it. */
export function TicketView({ snapshot, ticket: id, apply, actions, onSelect, noteRequest }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  /** The kind of the sub-ticket being added, while its title field is open. */
  const [addingChild, setAddingChild] = useState<TicketKind | null>(null);
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
      <header className="group__header">
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
            <ItemIcon icon={ticket.icon} kind={ticket.kind ?? 'ticket'} />
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
          <h1 id="view-title" className="group__name">
            <span
              {...pressable(() => setRenaming(true))}
              className="group__name-edit"
              title="Click to rename"
              onClick={() => setRenaming(true)}
            >
              {ticket.title}
              <Pencil className="icon group__name-pencil" aria-hidden="true" />
            </span>
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

      {!parent && (
        <section className="panel" aria-label="Sub-tickets">
          <header className="panel__bar">
            <ListTree className="icon" aria-hidden="true" />
            <span className="panel__label">Sub-tickets</span>
            <span className="panel__count">{children.length}</span>
            <Menu.Root modal={false}>
              <Menu.Trigger asChild>
                <button type="button" className="button panel__action">
                  <Plus className="icon" aria-hidden="true" />
                  Add sub-ticket
                  <ChevronDown className="icon" aria-hidden="true" />
                </button>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className="menu" align="end" sideOffset={4} collisionPadding={8}>
                  {TICKET_KINDS.map(({ kind, label, icon: Icon }) => (
                    <Menu.Item key={kind} className="menu__item" data-kind={kind} onSelect={() => setAddingChild(kind)}>
                      <Icon className="icon" aria-hidden="true" />
                      {label === 'Ticket' ? 'Sub-ticket' : label}
                    </Menu.Item>
                  ))}
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          </header>
          {addingChild && (
            <div className="panel__form">
              <InlineInput
                label={`${kindInfo(addingChild).label} title`}
                placeholder="CAR-6021 Matches legacy money card"
                onCancel={() => setAddingChild(null)}
                onSubmit={async (title) => {
                  const saved = await actions.newTicket({ ticket: id }, title, ticket.status ?? null, addingChild);
                  if (saved) setAddingChild(null);
                  return saved;
                }}
              />
            </div>
          )}
          {children.length === 0 && !addingChild ? (
            <p className="panel__empty">Split the work: sub-tickets keep their own status and link.</p>
          ) : (
            <ul className="sub-list">
              {children.map((child) => {
                const childStatus = findStatus(workspace, child.status);
                const childKind = kindInfo(child.kind);
                return (
                  <li key={child.id}>
                    <div
                      {...pressable(() => onSelect({ kind: 'ticket', id: child.id }))}
                      className="sub-row"
                      onClick={() => onSelect({ kind: 'ticket', id: child.id })}
                    >
                      <span className="sub-row__icon" data-kind={childKind.kind} title={childKind.label}>
                        <ItemIcon icon={child.icon} kind={childKind.kind} />
                      </span>
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
