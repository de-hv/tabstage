import * as Dialog from '@radix-ui/react-dialog';
import { open } from '@tauri-apps/plugin-dialog';
import { Folder, HardDrive } from 'lucide-react';
import { useState } from 'react';

import type { AppError } from '../api/types';

const CLOUD_MESSAGE = 'Cloud folders such as iCloud Drive, Dropbox, OneDrive or Google Drive can’t be used. Pick a local folder.';

interface Props {
  /** Where the file goes when the user keeps the default. */
  defaultPath: string;
  /** `null` keeps the default location. Resolves to the error, if any. */
  choose: (folder: string | null) => Promise<AppError | null>;
}

/** First run: where to keep the data file. The default is preselected. */
export function DataFileDialog({ defaultPath, choose }: Props) {
  const [folder, setFolder] = useState<string | null>(null);
  const [useDefault, setUseDefault] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const pick = async () => {
    const picked = await open({ directory: true, title: 'Folder for Tabstage data' });
    if (typeof picked !== 'string') return;
    setFolder(picked);
    setUseDefault(false);
    setError('');
  };

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog__overlay" />
        <Dialog.Content
          className="dialog dialog--wide"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <Dialog.Title className="dialog__title">Where should Tabstage save your data?</Dialog.Title>
          <Dialog.Description className="dialog__text">
            One JSON file on this computer. Every change is saved to it right away.
          </Dialog.Description>
          <form
            className="dialog__form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!useDefault && !folder) {
                setError('Choose a folder first');
                return;
              }
              setSaving(true);
              const failure = await choose(useDefault ? null : folder);
              setSaving(false);
              if (failure) setError(failure.code === 'cloudFolder' ? CLOUD_MESSAGE : failure.message);
            }}
          >
            <fieldset className="dialog__choices">
              <legend className="visually-hidden">Data file location</legend>
              <label className="choice choice--card">
                <input type="radio" name="data-location" checked={useDefault} onChange={() => setUseDefault(true)} />
                <HardDrive className="icon" aria-hidden="true" />
                <span>
                  <span className="choice__title">Default location</span>
                  <span className="choice__path">{defaultPath}</span>
                </span>
              </label>
              <div className="choice choice--card">
                <label className="choice__label">
                  <input type="radio" name="data-location" checked={!useDefault} onChange={() => setUseDefault(false)} />
                  <Folder className="icon" aria-hidden="true" />
                  <span>
                    <span className="choice__title">A folder you choose</span>
                    {folder ? <span className="choice__path">{folder}</span> : <span className="choice__hint">Local folders only</span>}
                  </span>
                </label>
                <button type="button" className="button" onClick={() => void pick()}>
                  Choose…
                </button>
              </div>
            </fieldset>
            {error && (
              <p className="add-form__error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog__actions">
              <button type="submit" className="button button--accent" disabled={saving}>
                Continue
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
