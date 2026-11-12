import * as Dialog from '@radix-ui/react-dialog';
import { Folder, Globe, Layers, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { AppError, ImportPreview, LegacyItem, Role } from '../api/types';
import { lanes } from '../lib/workspace';
import { ProfileDot } from './ProfileDot';
import { StatusPill } from './StatusPill';

interface Props {
  /** The file to import; `null` is the one set aside at startup, `undefined` keeps the assistant closed. */
  path: string | null | undefined;
  onClose: () => void;
  previewImport: (path: string | null, roles: Record<string, Role>) => Promise<ImportPreview | AppError>;
  importLegacy: (path: string | null, roles: Record<string, Role>) => Promise<AppError | null>;
}

const CONTAINER_ROLES: { role: Role; label: string }[] = [
  { role: 'status', label: 'Status' },
  { role: 'ticket', label: 'Ticket' },
  { role: 'subTicket', label: 'Sub-ticket' },
  { role: 'note', label: 'Note' },
  { role: 'unwrap', label: 'Just unwrap' },
];

const TAB_ROLES: { role: Role; label: string }[] = [
  { role: 'ticket', label: 'Ticket' },
  { role: 'subTicket', label: 'Sub-ticket' },
  { role: 'ownLink', label: "Ticket's own link" },
  { role: 'link', label: 'Link' },
];

const KIND_ICONS = { group: Layers, folder: Folder, tab: Globe } as const;

/**
 * Turns a data file from before tickets into statuses, tickets and notes.
 * Each group, folder and tab gets a suggested destination that can be
 * changed; the preview follows every change.
 */
export function ImportWizard({ path, onClose, previewImport, importLegacy }: Props) {
  const open = path !== undefined;
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [result, setResult] = useState<ImportPreview | AppError | null>(null);
  const [error, setError] = useState('');
  // The function changes on every render of the app; the preview only
  // depends on the file and the chosen roles.
  const previewRef = useRef(previewImport);
  previewRef.current = previewImport;

  // Start afresh each time it opens.
  useEffect(() => {
    if (!open) {
      setRoles({});
      setResult(null);
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    void previewRef.current(path, roles).then((next) => {
      if (current) setResult(next);
    });
    return () => {
      current = false;
    };
  }, [open, path, roles]);

  const preview = result && 'preview' in result ? result : null;
  const failure = result && 'code' in result ? result : null;

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog__overlay" />
        <Dialog.Content className="dialog import" aria-describedby="import-help">
          <Dialog.Title className="dialog__title">Bring in your previous data</Dialog.Title>
          <p id="import-help" className="dialog__text">
            Tabstage now works with tickets and statuses. Choose what each group, folder and tab becomes; ticket ids, titles,
            icons and notes come along.
          </p>
          {failure && (
            <p className="add-form__error" role="alert">
              {failure.code === 'notFound' ? 'That file is no longer there.' : `This file can't be imported: ${failure.message}`}
            </p>
          )}
          {preview && (
            <div className="import__grid">
              <section className="import__map" aria-label="Your groups, folders and tabs">
                {preview.tree.profiles.map((profile) => (
                  <div key={profile.id} className="import__profile">
                    <h3 className="import__profile-name">
                      <ProfileDot color={profile.color} />
                      {profile.name}
                    </h3>
                    <ul className="import__items">
                      {profile.items.map((item) => (
                        <ImportItem
                          key={item.id}
                          item={item}
                          depth={0}
                          role={(id) => roles[id] ?? preview.summary.roles[id]}
                          onChange={(id, role) => setRoles((current) => ({ ...current, [id]: role }))}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
              <section className="import__preview" aria-label="Preview">
                <p className="import__totals">
                  {preview.summary.statuses} statuses · {preview.summary.tickets} tickets · {preview.summary.notes} notes ·{' '}
                  {preview.summary.links} links
                </p>
                {preview.preview.profiles.map((profile) => (
                  <div key={profile.id} className="import__profile">
                    <h3 className="import__profile-name">
                      <ProfileDot color={profile.color} />
                      {profile.name}
                    </h3>
                    {lanes(preview.preview, profile)
                      .filter((lane) => lane.tickets.length > 0)
                      .map((lane) => (
                        <div key={lane.status?.id ?? 'none'} className="import__lane">
                          <StatusPill name={lane.status?.name ?? 'No status'} color={lane.status?.color} />
                          <ul className="import__tickets">
                            {lane.tickets.map((ticket) => (
                              <li key={ticket.id}>
                                <span className="import__ticket">
                                  {ticket.key && <span className="ticket">{ticket.key}</span>}
                                  {ticket.title}
                                </span>
                                {(ticket.children?.length ?? 0) > 0 && (
                                  <ul className="import__children">
                                    {ticket.children!.map((child) => (
                                      <li key={child.id} className="import__ticket">
                                        {child.key && <span className="ticket">{child.key}</span>}
                                        {child.title}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    {profile.notes.length > 0 && (
                      <div className="import__lane">
                        <span className="lane__label">Notes</span>
                        <ul className="import__tickets">
                          {profile.notes.map((note) => (
                            <li key={note.id} className="import__ticket">
                              {note.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            </div>
          )}
          {error && (
            <p className="add-form__error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog__actions import__footer">
            {preview && (
              <span className="import__safe">
                <ShieldCheck className="icon" aria-hidden="true" />
                The file itself is not changed: {preview.path}
              </span>
            )}
            <Dialog.Close className="button">Later</Dialog.Close>
            <button
              type="button"
              className="button button--accent"
              disabled={!preview}
              onClick={async () => {
                const failed = await importLegacy(path ?? null, roles);
                if (failed) setError(failed.message);
                else onClose();
              }}
            >
              Import
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ItemProps {
  item: LegacyItem;
  depth: number;
  role: (id: string) => Role | undefined;
  onChange: (id: string, role: Role) => void;
}

function ImportItem({ item, depth, role, onChange }: ItemProps) {
  const Icon = KIND_ICONS[item.kind];
  const options = item.kind === 'tab' ? TAB_ROLES : CONTAINER_ROLES;
  const value = role(item.id);
  return (
    <li>
      <div className="import__row" style={{ paddingLeft: depth * 16 }}>
        <Icon className="icon" aria-hidden="true" />
        <span className="import__name" title={item.url ?? item.name}>
          {item.key && <span className="ticket">{item.key}</span>}
          {item.name || item.url}
        </span>
        <select
          className="input import__role"
          aria-label={`What ${item.name || item.url} becomes`}
          value={value}
          onChange={(event) => onChange(item.id, event.target.value as Role)}
        >
          {options.map((option) => (
            <option key={option.role} value={option.role}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {item.children.length > 0 && (
        <ul className="import__items">
          {item.children.map((child) => (
            <ImportItem key={child.id} item={child} depth={depth + 1} role={role} onChange={onChange} />
          ))}
        </ul>
      )}
    </li>
  );
}
