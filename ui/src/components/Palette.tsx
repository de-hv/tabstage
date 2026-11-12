import { listen } from '@tauri-apps/api/event';
import { Command } from 'cmdk';
import { Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Folder, Group, Profile, Snapshot, Target } from '../api/types';
import { profileBrowser } from '../lib/browsers';
import { allTabs } from '../lib/workspace';
import { BrowserBadge } from './BrowserBadge';
import { ItemIcon } from './ItemIcon';
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
  openTab: (tab: string) => void;
  openFolder: (folder: string) => void;
  /** Opens an item's ticket with its profile's ticket URL. */
  openTicket: (target: Target) => void;
}

interface TicketEntry {
  ticketId: string;
  name: string;
  target: Target;
  profile: Profile;
}

/** Every group, folder and tab whose ticket can open: it has one and its profile a ticket URL. */
function allTickets(snapshot: Snapshot): TicketEntry[] {
  const entries: TicketEntry[] = [];
  for (const profile of snapshot.workspace.profiles) {
    if (!profile.ticketUrl) continue;
    const add = (ticketId: string | undefined, name: string, target: Target) => {
      if (ticketId) entries.push({ ticketId, name, target, profile });
    };
    const visit = (item: Folder | Group | { type: 'tab'; id: string; title: string; ticketId?: string }) => {
      if ('title' in item) add(item.ticketId, item.title, { tab: item.id });
      else if ('children' in item) {
        add(item.ticketId, item.name, { group: item.id });
        item.children.forEach(visit);
      } else {
        add(item.ticketId, item.name, { folder: item.id });
        item.tabs.forEach((tab) => add(tab.ticketId, tab.title, { tab: tab.id }));
      }
    };
    profile.items.forEach(visit);
  }
  return entries;
}

/** Every folder with its profile and group, for the search. */
function allFolders(snapshot: Snapshot): { folder: Folder; profile: Profile; group?: Group }[] {
  return snapshot.workspace.profiles.flatMap((profile) =>
    profile.items.flatMap((item) => {
      if (item.type === 'folder') return [{ folder: item, profile }];
      if (item.type === 'group') {
        return item.children.flatMap((node) => (node.type === 'folder' ? [{ folder: node, profile, group: item }] : []));
      }
      return [];
    }),
  );
}

/** Search across every profile; Enter opens the tab in its profile's browser. */
export function Palette({ snapshot, openTab, openFolder, openTicket }: Props) {
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

  const meta = (profile: Profile, group?: Group, folder?: Folder) => {
    const browser = profileBrowser(snapshot, profile.id);
    return (
      <span className="palette__meta">
        {[profile.name, group?.name, folder?.name].filter(Boolean).join(' / ')}
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
      label="Search tabs"
      className="palette"
      overlayClassName="dialog__overlay"
      contentClassName="palette__content"
    >
      <Command.Input className="palette__input" placeholder="Search tabs, folders and ticket:IDs" aria-label="Search tabs" />
      <Command.List className="palette__list">
        <Command.Empty className="palette__empty">No tab matches.</Command.Empty>
        {allTickets(snapshot).map(({ ticketId, name, target, profile }) => (
          <Command.Item
            key={`ticket-${Object.values(target)[0]}`}
            value={`ticket:${ticketId} ${ticketId} ${name} ${profile.name} ${Object.values(target)[0]}`}
            className="palette__item"
            onSelect={() => run(() => openTicket(target))}
          >
            <Ticket className="icon" aria-hidden="true" />
            <span className="palette__title">
              Open ticket {ticketId} · {name}
            </span>
            {meta(profile)}
          </Command.Item>
        ))}
        {allFolders(snapshot).map(({ folder, profile, group }) => (
          <Command.Item
            key={folder.id}
            value={`folder ${folder.name} ${group?.name ?? ''} ${profile.name} ${folder.id}`}
            className="palette__item"
            onSelect={() => run(() => openFolder(folder.id))}
          >
            <ItemIcon icon={folder.icon} kind="folder" />
            <span className="palette__title">
              Folder {folder.name} · {folder.tabs.length} tabs
            </span>
            {meta(profile, group)}
          </Command.Item>
        ))}
        {allTabs(snapshot.workspace).map(({ tab, profile, group, folder }) => (
          <Command.Item
            key={tab.id}
            value={`${tab.title} ${tab.url} ${group?.name ?? ''} ${folder?.name ?? ''} ${profile.name} ${tab.id}`}
            className="palette__item"
            onSelect={() => run(() => openTab(tab.id))}
          >
            <ItemIcon icon={tab.icon} kind="tab" />
            <span className="palette__title palette__title--tab">
              {tab.title}
              <TabUrl url={tab.url} />
            </span>
            {meta(profile, group, folder)}
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
