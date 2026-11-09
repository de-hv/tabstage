import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';

import type { AppError, Command, Group, Profile } from '../api/types';
import type { CreateKind } from './Sidebar';

const MESSAGES: Partial<Record<AppError['code'], string>> = {
  invalidUrl: 'Enter a web address that starts with http:// or https://',
};

export interface CreateRequest {
  profile: Profile;
  kind: CreateKind;
}

interface Props {
  request: CreateRequest | null;
  /** Groups of the requested profile, in sidebar order. */
  groups: Group[];
  apply: (command: Command) => Promise<AppError | null>;
  onClose: () => void;
}

/** "Nueva carpeta" and "Nuevo tab" inside a profile, choosing the group (and folder). */
export function CreateDialog({ request, groups, apply, onClose }: Props) {
  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog__overlay" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          {request && (
            <>
              <Dialog.Title className="dialog__title">
                {request.kind === 'tab' ? 'New tab' : 'New folder'} in {request.profile.name}
              </Dialog.Title>
              {request.kind === 'tab' ? (
                <TabForm groups={groups} apply={apply} onDone={onClose} />
              ) : (
                <FolderForm groups={groups} apply={apply} onDone={onClose} />
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface FormProps {
  groups: Group[];
  apply: (command: Command) => Promise<AppError | null>;
  onDone: () => void;
}

function FolderForm({ groups, apply, onDone }: FormProps) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState(groups[0]?.id ?? '');
  const [error, setError] = useState('');

  return (
    <form
      className="dialog__form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) {
          setError('Enter a folder name');
          return;
        }
        const failure = await apply({ type: 'addFolder', group, name: name.trim() });
        if (failure) setError(failure.message);
        else onDone();
      }}
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input className="input" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
      </label>
      <GroupSelect groups={groups} value={group} onChange={setGroup} />
      {error && (
        <p className="add-form__error" role="alert">
          {error}
        </p>
      )}
      <Actions submit="Create folder" />
    </form>
  );
}

function TabForm({ groups, apply, onDone }: FormProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState(groups[0]?.id ?? '');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState('');
  const folders = groups
    .find((candidate) => candidate.id === group)
    ?.children.flatMap((node) => (node.type === 'folder' ? [node] : [])) ?? [];

  return (
    <form
      className="dialog__form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!url.trim()) {
          setError("Enter the tab's address");
          return;
        }
        const place = folder ? { folder } : { group };
        const failure = await apply({ type: 'addTab', place, url: url.trim(), title: title.trim() });
        if (failure) setError(MESSAGES[failure.code] ?? failure.message);
        else onDone();
      }}
    >
      <label className="field">
        <span className="field__label">URL</span>
        <input
          className="input"
          placeholder="https://"
          value={url}
          autoFocus
          aria-invalid={error ? true : undefined}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Title (optional)</span>
        <input
          className="input"
          placeholder="The URL is used when this is empty"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="field-row">
        <GroupSelect
          groups={groups}
          value={group}
          onChange={(next) => {
            setGroup(next);
            setFolder('');
          }}
        />
        <label className="field">
          <span className="field__label">Folder</span>
          <select className="input" value={folder} onChange={(event) => setFolder(event.target.value)}>
            <option value="">No folder</option>
            {folders.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="add-form__error" role="alert">
          {error}
        </p>
      )}
      <Actions submit="Add tab" />
    </form>
  );
}

function GroupSelect({ groups, value, onChange }: { groups: Group[]; value: string; onChange: (group: string) => void }) {
  return (
    <label className="field">
      <span className="field__label">Group</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Actions({ submit }: { submit: string }) {
  return (
    <div className="dialog__actions">
      <Dialog.Close className="button">Cancel</Dialog.Close>
      <button type="submit" className="button button--accent">
        {submit}
      </button>
    </div>
  );
}
