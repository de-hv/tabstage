import { listen } from '@tauri-apps/api/event';
import { Command } from 'cmdk';
import { Folder as FolderIcon, Globe } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Snapshot } from '../api/types';
import { findProfile, profileBrowser } from '../lib/browsers';
import { BrowserBadge } from './BrowserBadge';

/** Emitted by the shell for the global shortcut and the tray item. */
export const OPEN_PALETTE_EVENT = 'open-palette';

interface Props {
  snapshot: Snapshot;
  openTab: (tab: string, browserName: string) => void;
  openFolder: (folder: string) => void;
}

/** Search across every group; Enter opens the tab in its group's browser. */
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
        {snapshot.workspace.groups.map((group) => {
          const browser = profileBrowser(snapshot, group.profile);
          const browserName = browser?.name ?? '';
          const meta = (
            <span className="palette__meta">
              {findProfile(snapshot, group.profile)?.name} · {group.name}
              {browser && (
                <>
                  <BrowserBadge name={browser.name} kind={browser.kind} />
                  {browser.name}
                </>
              )}
            </span>
          );
          return group.children.flatMap((node) => {
            const tabs = node.type === 'folder' ? node.tabs : [node];
            const folderItem =
              node.type === 'folder' ? (
                <Command.Item
                  key={node.id}
                  value={`folder ${node.name} ${group.name} ${node.id}`}
                  className="palette__item"
                  onSelect={() => run(() => openFolder(node.id))}
                >
                  <FolderIcon className="icon" aria-hidden="true" />
                  <span className="palette__title">
                    Folder {node.name} · {node.tabs.length} tabs
                  </span>
                  {meta}
                </Command.Item>
              ) : null;
            return [
              folderItem,
              ...tabs.map((tab) => (
                <Command.Item
                  key={tab.id}
                  value={`${tab.title} ${tab.url} ${group.name} ${findProfile(snapshot, group.profile)?.name ?? ''} ${tab.id}`}
                  className="palette__item"
                  onSelect={() => run(() => openTab(tab.id, browserName))}
                >
                  <Globe className="icon" aria-hidden="true" />
                  <span className="palette__title">{tab.title}</span>
                  {meta}
                </Command.Item>
              )),
            ];
          });
        })}
      </Command.List>
    </Command.Dialog>
  );
}
