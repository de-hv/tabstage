import { listen } from '@tauri-apps/api/event';
import { Command } from 'cmdk';
import { useEffect, useState } from 'react';

import type { Folder, Group, Profile, Snapshot } from '../api/types';
import { profileBrowser } from '../lib/browsers';
import { allTabs } from '../lib/workspace';
import { BrowserBadge } from './BrowserBadge';
import { ItemIcon } from './ItemIcon';
import { TabUrl } from './TabUrl';

/** Emitted by the shell for the global shortcut. */
export const OPEN_PALETTE_EVENT = 'open-palette';

interface Props {
  snapshot: Snapshot;
  openTab: (tab: string) => void;
  openFolder: (folder: string) => void;
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
export function Palette({ snapshot, openTab, openFolder }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unlisten = listen(OPEN_PALETTE_EVENT, () => setIsOpen(true));
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
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
      <Command.Input className="palette__input" placeholder="Search tabs and folders" aria-label="Search tabs" />
      <Command.List className="palette__list">
        <Command.Empty className="palette__empty">No tab matches.</Command.Empty>
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
