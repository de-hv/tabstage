import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen } from 'lucide-react';
import { useState } from 'react';

import type { Command, DataFileInfo, Relocate, Snapshot } from '../api/types';
import { BrowserBadge } from './BrowserBadge';
import { StatusEditor } from './StatusEditor';

interface Props {
  snapshot: Snapshot;
  apply: (command: Command) => void;
  inspectDataFolder: (folder: string) => Promise<DataFileInfo | null>;
  relocate: (folder: string, mode: Relocate) => Promise<void>;
}

interface Pending {
  folder: string;
  info: DataFileInfo;
}

export function Settings({ snapshot, apply, inspectDataFolder, relocate }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);

  const chooseFolder = async () => {
    const folder = await open({ directory: true, title: 'Carpeta para los datos de Tabstage' });
    if (typeof folder !== 'string') return;
    const info = await inspectDataFolder(folder);
    if (!info) return;
    if (info.exists) setPending({ folder, info });
    else await relocate(folder, 'useExisting');
  };

  return (
    <main className="settings" aria-labelledby="settings-title">
      <h1 id="settings-title" className="group__name">
        Ajustes
      </h1>

      <section className="settings__section" aria-labelledby="default-browser">
        <h2 id="default-browser" className="settings__heading">
          Navegador por defecto
        </h2>
        <p className="settings__help">Lo usan los grupos que no tienen un navegador asignado.</p>
        <div className="choices" role="radiogroup" aria-labelledby="default-browser">
          {snapshot.browsers.map((browser) => (
            <label key={browser.id} className="choice">
              <input
                type="radio"
                name="default-browser"
                checked={snapshot.defaultBrowser === browser.id}
                onChange={() => apply({ type: 'setDefaultBrowser', browser: browser.id })}
              />
              <BrowserBadge name={browser.name} kind={browser.kind} />
              {browser.name}
            </label>
          ))}
        </div>
      </section>

      <section className="settings__section" aria-labelledby="data-file">
        <h2 id="data-file" className="settings__heading">
          Archivo de datos
        </h2>
        <div className="settings__path">
          <code className="path">{snapshot.dataPath}</code>
          <button type="button" className="button" onClick={() => void chooseFolder()}>
            <FolderOpen className="icon" aria-hidden="true" />
            Cambiar ubicación…
          </button>
        </div>
        <p className="settings__help">
          Si eliges una carpeta sincronizada (iCloud Drive, Dropbox, Syncthing o un repo git), tus otros equipos verán
          los mismos grupos. Cada cambio se guarda al momento.
        </p>
      </section>

      <section className="settings__section" aria-labelledby="statuses">
        <h2 id="statuses" className="settings__heading">
          Estados
        </h2>
        <StatusEditor statuses={snapshot.workspace.statuses} apply={apply} />
      </section>

      <AlertDialog.Root open={pending !== null} onOpenChange={(isOpen) => !isOpen && setPending(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog__overlay" />
          <AlertDialog.Content className="dialog">
            <AlertDialog.Title className="dialog__title">Ya hay datos de Tabstage en esa carpeta</AlertDialog.Title>
            <AlertDialog.Description className="dialog__text">
              Tienen {pending?.info.groups} grupos y {pending?.info.tabs} tabs. Puedes usarlos en este equipo o
              reemplazarlos con los de aquí.
            </AlertDialog.Description>
            <div className="dialog__actions">
              <AlertDialog.Cancel className="button">Cancelar</AlertDialog.Cancel>
              <AlertDialog.Action
                className="button"
                onClick={() => pending && void relocate(pending.folder, 'replaceWithMine')}
              >
                Reemplazar con los de este equipo
              </AlertDialog.Action>
              <AlertDialog.Action
                className="button button--accent"
                onClick={() => pending && void relocate(pending.folder, 'useExisting')}
              >
                Usar esos datos
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </main>
  );
}
