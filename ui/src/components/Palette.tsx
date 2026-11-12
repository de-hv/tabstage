import { listen } from '@tauri-apps/api/event';
import { Command } from 'cmdk';
import { useEffect, useState } from 'react';

import type { Link, Profile, Snapshot } from '../api/types';
import { profileBrowser } from '../lib/browsers';
import { allTickets, findStatus } from '../lib/workspace';
import type { Selection } from '../state/selection';
import { BrowserBadge } from './BrowserBadge';
import { ItemIcon } from './ItemIcon';
import { StatusPill } from './StatusPill';
import { TabUrl } from './TabUrl';

/** Emitted by the shell for the global shortcut. */
export const OPEN_PALETTE_EVENT = 'open-palette';

/** Window event the app's own buttons send to open the search. */
const OPEN_PALETTE_WINDOW_EVENT = 'tabstage:open-palette';

export function openPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_WINDOW_EVENT));
}

interface Props {
  snapshot: Snapshot;
  /** Shows a ticket or note. */
  onSelect: (selection: Selection) => void;
  /** Opens a link in its profile's browser. */
  openLink: (link: string) => void;
}

/** Every link with the profile and the ticket or note that holds it. */
function allLinks(snapshot: Snapshot): { link: Link; profile: Profile; owner: string }[] {
  return snapshot.workspace.profiles.flatMap((profile) => [
    ...profile.tickets.flatMap((ticket) =>
      [ticket, ...(ticket.children ?? [])].flatMap((holder) =>
        (holder.links ?? []).map((link) => ({ link, profile, owner: holder.key ? `${holder.key} ${holder.title}` : holder.title })),
      ),
    ),
    ...profile.notes.flatMap((note) => (note.links ?? []).map((link) => ({ link, profile, owner: note.title }))),
  ]);
}

/** Search across every profile: tickets (also by key and status), notes and links. */
export function Palette({ snapshot, onSelect, openLink }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unlisten = listen(OPEN_PALETTE_EVENT, () => setIsOpen(true));
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
    };
    const onOpen = () => setIsOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_PALETTE_WINDOW_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_PALETTE_WINDOW_EVENT, onOpen);
      void unlisten.then((stop) => stop());
    };
  }, []);

  const run = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const meta = (profile: Profile, ...path: (string | undefined)[]) => {
    const browser = profileBrowser(snapshot, profile.id);
    return (
      <span className="palette__meta">
        {[profile.name, ...path].filter(Boolean).join(' / ')}
        {browser && (
          <>
            <BrowserBadge name={browser.name} kind={browser.kind} />
            {browser.name}
          </>
        )}
      </span>
    );
  };

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={setIsOpen}
      label="Search"
      className="palette"
      overlayClassName="dialog__overlay"
      contentClassName="palette__content"
    >
      <Command.Input className="palette__input" placeholder="Search tickets, notes and links" aria-label="Search" />
      <Command.List className="palette__list">
        <Command.Empty className="palette__empty">Nothing matches.</Command.Empty>
        {allTickets(snapshot.workspace).map(({ ticket, parent, profile }) => {
          const status = findStatus(snapshot.workspace, ticket.status);
          return (
            <Command.Item
              key={ticket.id}
              value={`${ticket.key ?? ''} ${ticket.title} ${status?.name ?? ''} ${parent?.title ?? ''} ${profile.name} ${ticket.id}`}
              className="palette__item"
              onSelect={() => run(() => onSelect({ kind: 'ticket', id: ticket.id }))}
            >
              <ItemIcon icon={ticket.icon} kind="ticket" />
              <span className="palette__title">
                {ticket.key && <span className="ticket">{ticket.key}</span>}
                {ticket.title}
              </span>
              {status && <StatusPill name={status.name} color={status.color} />}
              {meta(profile, parent?.title)}
            </Command.Item>
          );
        })}
        {snapshot.workspace.profiles.flatMap((profile) =>
          profile.notes.map((note) => (
            <Command.Item
              key={note.id}
              value={`note ${note.title} ${profile.name} ${note.id}`}
              className="palette__item"
              onSelect={() => run(() => onSelect({ kind: 'note', id: note.id }))}
            >
              <ItemIcon icon={note.icon} kind="note" />
              <span className="palette__title">{note.title}</span>
              {meta(profile, 'Notes')}
            </Command.Item>
          )),
        )}
        {allLinks(snapshot).map(({ link, profile, owner }) => (
          <Command.Item
            key={link.id}
            value={`${link.title} ${link.url} ${owner} ${profile.name} ${link.id}`}
            className="palette__item"
            onSelect={() => run(() => openLink(link.id))}
          >
            <ItemIcon icon={link.icon} kind="link" />
            <span className="palette__title palette__title--tab">
              {link.title}
              <TabUrl url={link.url} />
            </span>
            {meta(profile, owner)}
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
