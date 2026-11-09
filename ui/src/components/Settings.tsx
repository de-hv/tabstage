import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { open } from '@tauri-apps/plugin-dialog';
import { Cloud, Folder, FolderInput, HardDrive } from 'lucide-react';
import { useState } from 'react';

import type { Command, DataFileInfo, DataLocationKind, Relocate, Snapshot } from '../api/types';
import { ProfilesEditor } from './ProfilesEditor';
import { StatusEditor } from './StatusEditor';

interface Props {
  snapshot: Snapshot;
  apply: (command: Command) => void;
  inspectDataFolder: (folder: string) => Promise<DataFileInfo | null>;
  relocate: (folder: string, mode: Relocate) => Promise<void>;
  onRevealDataFile: () => void;
}

interface Pending {
  folder: string;
  info: DataFileInfo;
}

export function Settings({ snapshot, apply, inspectDataFolder, relocate, onRevealDataFile }: Props) {
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
          Each group opens with its profile. Profile names are shared between your computers; the browser and its
          profile are chosen on each computer.
        </p>
        <ProfilesEditor snapshot={snapshot} apply={apply} />
      </section>

      <DataLocationCard snapshot={snapshot} onReveal={onRevealDataFile} onMove={() => void chooseFolder()} />

      <section className="settings__section" aria-labelledby="statuses">
        <h2 id="statuses" className="settings__heading">
          Statuses
        </h2>
        <StatusEditor statuses={snapshot.workspace.statuses} apply={apply} />
      </section>

      <AlertDialog.Root open={pending !== null} onOpenChange={(isOpen) => !isOpen && setPending(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog__overlay" />
          <AlertDialog.Content className="dialog">
            <AlertDialog.Title className="dialog__title">That folder already has Tabstage data</AlertDialog.Title>
            <AlertDialog.Description className="dialog__text">
              It has {pending?.info.groups} groups and {pending?.info.tabs} tabs. Use them on this computer, or
              replace them with the data from here.
            </AlertDialog.Description>
            <div className="dialog__actions">
              <AlertDialog.Cancel className="button">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action
                className="button"
                onClick={() => pending && void relocate(pending.folder, 'replaceWithMine')}
              >
                Replace with this computer's data
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
  const title =
    kind === 'appData'
      ? `On this ${isMac() ? 'Mac' : 'computer'} only`
      : service
        ? `Synced through ${service}`
        : 'In a folder you chose';
  const detail =
    kind === 'appData'
      ? 'Not shared with other computers. Changes save instantly.'
      : service
        ? 'Your other computers with the same folder see the same groups. Changes save instantly.'
        : 'Shared with any computer that syncs this folder. Changes save instantly.';
  const Icon = kind === 'appData' ? HardDrive : service ? Cloud : Folder;

  return (
    <section className="settings__section" aria-labelledby="data-location">
      <h2 id="data-location" className="settings__heading">
        Where your data lives
      </h2>
      <div className="data-card">
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
            {kind === 'appData' ? 'Move to a synced folder…' : 'Move to another folder…'}
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
