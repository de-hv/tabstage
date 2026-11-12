import { Copy, ExternalLink, Link as LinkIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { AppError, Command, Link, LinkOwner } from '../api/types';
import { readableUrl } from '../lib/urls';
import type { ItemActions } from '../state/selection';
import { AddTabForm } from './AddTabForm';
import { useDrag, useDrop } from './DragDrop';
import { IconPicker } from './IconPicker';
import { ItemIcon } from './ItemIcon';
import { UrlEditor } from './UrlEditor';

interface Props {
  owner: LinkOwner;
  links: Link[];
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  notify: (text: string) => void;
  /** Opens the "add link" field whenever this changes to a new non-zero value. */
  addRequest?: number;
}

/** The links of a ticket or note: open, copy, edit, reorder by dragging, add. */
export function LinkList({ owner, links, apply, actions, notify, addRequest = 0 }: Props) {
  const [adding, setAdding] = useState(false);
  const drop = useDrop({ kind: 'linksOf', owner });
  useEffect(() => {
    if (addRequest) setAdding(true);
  }, [addRequest]);

  return (
    <section className="panel" aria-label="Links">
      <header className="panel__bar" {...drop}>
        <LinkIcon className="icon" aria-hidden="true" />
        <span className="panel__label">Links</span>
        <span className="panel__count">{links.length}</span>
        <button type="button" className="button panel__action" onClick={() => setAdding(true)}>
          <Plus className="icon" aria-hidden="true" />
          Add link
        </button>
      </header>
      {adding && (
        <div className="panel__form">
          <AddTabForm
            onCancel={() => setAdding(false)}
            onSubmit={async (url, title) => {
              const failure = await apply({ type: 'addLink', owner, url, title });
              if (!failure) setAdding(false);
              return failure;
            }}
          />
        </div>
      )}
      {links.length === 0 && !adding ? (
        <p className="panel__empty">No links yet. Add one, or drag a link here from the sidebar.</p>
      ) : (
        <ul className="link-list">
          {links.map((link) => (
            <LinkRow key={link.id} link={link} apply={apply} actions={actions} notify={notify} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkRow({ link, apply, actions, notify }: { link: Link } & Pick<Props, 'apply' | 'actions' | 'notify'>) {
  const [editing, setEditing] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const drag = useDrag({ kind: 'link', link: link.id });
  const drop = useDrop({ kind: 'beforeLink', link: link.id });
  const { host } = readableUrl(link.url);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      notify('Address copied');
    } catch {
      notify('Could not copy the address');
    }
  };

  return (
    <li className="link-row" {...(editing ? {} : drag)} {...drop}>
      <IconPicker
        name={link.title}
        icon={link.icon}
        open={iconOpen}
        onOpenChange={setIconOpen}
        onChange={(icon) => actions.setIcon({ link: link.id }, icon)}
      >
        <button type="button" className="row__icon" aria-label={`Icon of ${link.title}`}>
          <ItemIcon icon={link.icon} kind="link" />
        </button>
      </IconPicker>
      {editing ? (
        <UrlEditor
          initial={link.url}
          onSubmit={(url) => apply({ type: 'setLinkUrl', link: link.id, url })}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <span className="link-row__text" title={link.url}>
            <span className="link-row__title">{link.title}</span>
            <span className="link-row__host">{host}</span>
          </span>
          <button type="button" className="icon-button" aria-label={`Open ${link.title}`} title="Open" onClick={() => actions.openLink(link.id)}>
            <ExternalLink className="icon" aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label={`Copy address of ${link.title}`} title="Copy address" onClick={() => void copy()}>
            <Copy className="icon" aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label={`Edit address of ${link.title}`} title="Edit address" onClick={() => setEditing(true)}>
            <Pencil className="icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button link-row__remove"
            aria-label={`Delete ${link.title}`}
            title="Delete"
            onClick={() => void apply({ type: 'removeLink', link: link.id })}
          >
            <Trash2 className="icon" aria-hidden="true" />
          </button>
        </>
      )}
    </li>
  );
}
