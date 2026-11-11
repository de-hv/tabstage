import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { open } from '@tauri-apps/plugin-dialog';
import { AlertTriangle, Folder, FolderInput, HardDrive } from 'lucide-react';
import { useState } from 'react';

import type { Command, DataFileInfo, DataLocationKind, Relocate, Snapshot } from '../api/types';
import { ProfilesEditor } from './ProfilesEditor';

interface Props {
  snapshot: Snapshot;
  apply: (command: Command) => void;
  inspectDataFolder: (folder: string) => Promise<DataFileInfo | null>;
  relocate: (folder: string, mode: Relocate) => Promise<void>;
  onRevealDataFile: () => void;
  /** Profile whose browser the user wants to choose. */
  focusProfile?: string | null;
  showUrls: boolean;
  onShowUrls: (show: boolean) => void;
  compact: boolean;
  onCompact: (compact: boolean) => void;
  indentGuides: boolean;
  onIndentGuides: (show: boolean) => void;
}

interface Pending {
  folder: string;
  info: DataFileInfo;
}

export function Settings({
  snapshot,
  apply,
  inspectDataFolder,
  relocate,
  onRevealDataFile,
  focusProfile = null,
  showUrls,
  onShowUrls,
  compact,
  onCompact,
  indentGuides,
  onIndentGuides,
}: Props) {
  const [pending, setPending] = useState<Pending | null>(null);

  const chooseFolder = async () => {
    const folder = await open({ directory: true, title: 'Folder for Tabstage data' });
    if (typeof folder !== 'string') return;
    const info = await inspectDataFolder(folder);
    if (!info) return;
    if (info.exists) setPending({ folder, info });
    else await relocate(folder, 'useExisting');
  };

  return (
    <main className="settings" aria-labelledby="settings-title">
      <h1 id="settings-title" className="group__name">
        Settings
      </h1>

      <section className="settings__section" aria-labelledby="profiles">
        <h2 id="profiles" className="settings__heading">
          Profiles
        </h2>
        <p className="settings__help">
          Profiles keep personal, work and client tabs apart. Each one opens in the browser you choose here.
        </p>
        <ProfilesEditor snapshot={snapshot} apply={apply} focus={focusProfile} />
      </section>

      <section className="settings__section" aria-labelledby="sidebar-settings">
        <h2 id="sidebar-settings" className="settings__heading">
          Sidebar
        </h2>
        <label className="checkbox">
          <input type="checkbox" checked={showUrls} onChange={(event) => onShowUrls(event.target.checked)} />
          Show URLs under tabs in the sidebar
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={indentGuides} onChange={(event) => onIndentGuides(event.target.checked)} />
          Show indent guides
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={compact} onChange={(event) => onCompact(event.target.checked)} />
          Compact sidebar
        </label>
      </section>

      <DataLocationCard snapshot={snapshot} onReveal={onRevealDataFile} onMove={() => void chooseFolder()} />

      <AlertDialog.Root open={pending !== null} onOpenChange={(isOpen) => !isOpen && setPending(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog__overlay" />
          <AlertDialog.Content className="dialog">
            <AlertDialog.Title className="dialog__title">That folder already has Tabstage data</AlertDialog.Title>
            <AlertDialog.Description className="dialog__text">
              It has {pending?.info.groups} groups and {pending?.info.tabs} tabs. Use that data, or replace it with
              the data you have now.
            </AlertDialog.Description>
            <div className="dialog__actions">
              <AlertDialog.Cancel className="button">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action
                className="button"
                onClick={() => pending && void relocate(pending.folder, 'replaceWithMine')}
              >
                Replace with my current data
              </AlertDialog.Action>
              <AlertDialog.Action
                className="button button--accent"
                onClick={() => pending && void relocate(pending.folder, 'useExisting')}
              >
                Use that data
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </main>
  );
}

const SERVICE: Partial<Record<DataLocationKind, string>> = {
  iCloudDrive: 'iCloud Drive',
  dropbox: 'Dropbox',
  oneDrive: 'OneDrive',
  googleDrive: 'Google Drive',
};

const isMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

/** "Where your data lives": plain words first, the path as a detail. */
function DataLocationCard({
  snapshot,
  onReveal,
  onMove,
}: {
  snapshot: Snapshot;
  onReveal: () => void;
  onMove: () => void;
}) {
  const { kind } = snapshot.dataLocation;
  const service = SERVICE[kind];
  const title = kind === 'appData' ? `On this ${isMac() ? 'Mac' : 'computer'}` : service ? `In ${service}` : 'In a folder you chose';
  const detail = service
    ? `Cloud folders are no longer supported. Move the file to a local folder.`
    : 'A local file. Changes save instantly.';
  const Icon = service ? AlertTriangle : kind === 'appData' ? HardDrive : Folder;

  return (
    <section className="settings__section" aria-labelledby="data-location">
      <h2 id="data-location" className="settings__heading">
        Where your data lives
      </h2>
      <div className="data-card" data-warning={service ? true : undefined}>
        <span className="data-card__icon">
          <Icon className="icon" aria-hidden="true" />
        </span>
        <div className="data-card__text">
          <p className="data-card__title">{title}</p>
          <p className="data-card__detail">{detail}</p>
          <p className="data-card__path" title={snapshot.dataPath}>
            {middleEllipsis(snapshot.dataPath, 64)}
          </p>
        </div>
        <div className="data-card__actions">
          <button type="button" className="button" onClick={onReveal}>
            {isMac() ? 'Show in Finder' : 'Show in folder'}
          </button>
          <button type="button" className="button" onClick={onMove}>
            <FolderInput className="icon" aria-hidden="true" />
            Move to another folder…
          </button>
        </div>
      </div>
    </section>
  );
}

/** Keeps both ends of a long path, which carry the meaning. */
function middleEllipsis(text: string, max: number): string {
  if (text.length <= max) return text;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`;
}
