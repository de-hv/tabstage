import { Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import type { AppError, Command, Snapshot, Tab } from '../api/types';
import { profileBrowser, profileView } from '../lib/browsers';
import { tabMenu } from '../lib/menus';
import { locate } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { ActionMenu } from './ActionMenu';
import { IconPicker } from './IconPicker';
import { InlineInput } from './InlineInput';
import { ItemIcon } from './ItemIcon';
import { ProfileDot } from './ProfileDot';
import { SetupNote } from './SetupNote';

interface Props {
  snapshot: Snapshot;
  tab: string;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
  notify: (text: string) => void;
}

/** A tab's details: where it lives, its full address and a button to open it. */
export function TabDetail({ snapshot, tab: id, apply, actions, onSelect, notify }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const { workspace } = snapshot;
  const at = locate(workspace, id);
  const container = at?.folder ? at.folder.tabs : at?.group ? at.group.children : at?.profile.items;
  const tab = container?.find((item) => item.id === id) as Tab | undefined;
  if (!at || !tab) return null;
  const { profile, group, folder } = at;
  const browser = profileBrowser(snapshot, profile.id)?.name;
  const canFocus = profileView(snapshot, profile.id)?.canFocusTabs ?? false;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tab.url);
      notify('Address copied');
    } catch {
      notify('Could not copy the address');
    }
  };

  return (
    <main className="group tab-detail" aria-labelledby="view-title">
      <nav className="crumbs" aria-label="Path">
        <button type="button" className="crumbs__link" onClick={() => onSelect({ kind: 'profile', id: profile.id })}>
          <ProfileDot color={profile.color} />
          {profile.name}
        </button>
        {group && (
          <>
            <span aria-hidden="true">/</span>
            <button type="button" className="crumbs__link" onClick={() => onSelect({ kind: 'group', id: group.id })}>
              {group.name}
            </button>
          </>
        )}
        {folder && (
          <>
            <span aria-hidden="true">/</span>
            <button type="button" className="crumbs__link" onClick={() => onSelect({ kind: 'folder', id: folder.id })}>
              {folder.name}
            </button>
          </>
        )}
      </nav>
      <header
        className="group__header"
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
        }}
      >
        <IconPicker
          name={tab.title}
          icon={tab.icon}
          open={iconOpen}
          onOpenChange={setIconOpen}
          onChange={(icon) => actions.setIcon({ tab: tab.id }, icon)}
        >
          <button type="button" className="group__icon" aria-label={`Icon of ${tab.title}`}>
            <ItemIcon icon={tab.icon} kind="tab" />
          </button>
        </IconPicker>
        {renaming ? (
          <InlineInput
            label="New name"
            initial={tab.title}
            onCancel={() => setRenaming(false)}
            onSubmit={async (title) => {
              const saved = !(await apply({ type: 'renameTab', tab: tab.id, title }));
              if (saved) setRenaming(false);
              return saved;
            }}
          />
        ) : (
          <h1 id="view-title" className="group__name tab-detail__title">
            {tab.title}
          </h1>
        )}
        <div className="group__actions">
          <button type="button" className="button button--accent" onClick={() => actions.open({ tab: tab.id })}>
            <ExternalLink className="icon" aria-hidden="true" />
            {browser ? `Open in ${browser}` : 'Open'}
          </button>
          <ActionMenu
            label={`Options for ${tab.title}`}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            entries={tabMenu(tab.id, {
              workspace,
              onNew: () => undefined,
              onOpen: () => actions.open({ tab: tab.id }),
              onRename: () => setRenaming(true),
              onIcon: () => setIconOpen(true),
              onMove: (command) => void apply(command),
              onDelete: () => actions.requestDelete({ tab: tab.id }),
            })}
          />
        </div>
      </header>

      <SetupNote snapshot={snapshot} profile={profile} onConfigure={() => actions.configureProfile(profile.id)} />

      <section className="tab-detail__section" aria-labelledby="tab-address">
        <h2 id="tab-address" className="tab-detail__label">
          Address
        </h2>
        <div className="tab-detail__url">
          <span className="tab-detail__url-text">{tab.url}</span>
          <button type="button" className="icon-button" aria-label="Copy address" title="Copy address" onClick={() => void copy()}>
            <Copy className="icon" aria-hidden="true" />
          </button>
        </div>
        <p className="tab-detail__hint">
          {canFocus ? "If it's already open, Open takes you to that tab. " : ''}A double-click on the tab anywhere opens
          it too.
        </p>
      </section>
    </main>
  );
}
