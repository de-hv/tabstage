import { ExternalLink, FolderPlus, Plus } from 'lucide-react';
import { useState } from 'react';

import type { AppError, Command, Folder, Group, Node, Place, Snapshot } from '../api/types';
import { profileOpensIn, profileView } from '../lib/browsers';
import { folderMenu, groupMenu } from '../lib/menus';
import { profileColor } from '../lib/profileColors';
import { countTabs, effectiveColor, hasTicketLink, locate, pinnedIndex } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { ActionMenu } from './ActionMenu';
import { AddTabForm } from './AddTabForm';
import { IconPicker } from './IconPicker';
import { InlineInput } from './InlineInput';
import { ItemIcon } from './ItemIcon';
import { ProfileDot } from './ProfileDot';
import type { RowContext } from './Rows';
import { useDetails } from './Details';
import { SetupNote } from './SetupNote';
import { Tree } from './Tree';

type Shown = { kind: 'group'; item: Group } | { kind: 'folder'; item: Folder };

interface Props {
  snapshot: Snapshot;
  shown: Shown;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
  /** Bumped to start editing the note. */
  noteRequest?: number;
}

/** A group or folder as a list, with its path, actions and menu. */
export function ContainerView({ snapshot, shown, apply, actions, onSelect, noteRequest }: Props) {
  const [adding, setAdding] = useState<'tab' | 'folder' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const { workspace } = snapshot;
  const { item } = shown;
  const at = locate(workspace, item.id);
  const profile = at?.profile;
  const place: Place = shown.kind === 'group' ? { group: item.id } : { folder: item.id };
  const target = shown.kind === 'group' ? { group: item.id } : { folder: item.id };
  const nodes: Node[] = shown.kind === 'group' ? shown.item.children : shown.item.tabs.map((tab) => ({ type: 'tab', ...tab }));
  const tabCount = countTabs(item);
  const color = effectiveColor(workspace, item.id);
  const details = useDetails({
    target,
    ticketId: item.ticketId,
    note: item.note,
    profile,
    apply,
    actions,
    noteRequest,
  });

  const done = async (command: Command) => !(await apply(command));
  const row: RowContext = {
    workspace,
    actions,
    canFocusTabs: (profile && profileView(snapshot, profile.id)?.canFocusTabs) ?? false,
    apply: done,
    onSelectFolder: (folder) => onSelect({ kind: 'folder', id: folder }),
    onSelectTab: (tab) => onSelect({ kind: 'tab', id: tab }),
  };
  const menuHandlers = {
    workspace,
    onNew: (kind: 'group' | 'folder' | 'tab') => (kind === 'tab' ? setAdding('tab') : setAdding('folder')),
    onOpen: () => actions.open(target),
    onRename: () => setRenaming(true),
    onIcon: () => setIconOpen(true),
    onDetails: () => actions.editDetails(target),
    onTicket: hasTicketLink(workspace, item.id, item.ticketId) ? () => actions.openTicket(target) : undefined,
    pin: { pinned: pinnedIndex(workspace, target) !== -1, onToggle: () => actions.togglePin(target) },
    onMove: (command: Command) => void apply(command),
    onDelete: () => actions.requestDelete(target),
  };

  return (
    <main className="group" aria-labelledby="view-title">
      <nav className="crumbs" aria-label="Path">
        {profile && (
          <button type="button" className="crumbs__link" onClick={() => onSelect({ kind: 'profile', id: profile.id })}>
            <ProfileDot color={profile.color} />
            {profile.name}
          </button>
        )}
        {shown.kind === 'folder' && at?.group && (
          <>
            <span aria-hidden="true">/</span>
            <button type="button" className="crumbs__link" onClick={() => at.group && onSelect({ kind: 'group', id: at.group.id })}>
              {at.group.name}
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
          name={item.name}
          icon={item.icon}
          open={iconOpen}
          onOpenChange={setIconOpen}
          onChange={(icon) => actions.setIcon(target, icon)}
        >
          <button
            type="button"
            className="group__icon"
            aria-label={`Icon of ${item.name}`}
            style={color === undefined ? undefined : { color: profileColor(color) }}
          >
            <ItemIcon icon={item.icon} kind={shown.kind} />
          </button>
        </IconPicker>
        {renaming ? (
          <InlineInput
            label="New name"
            initial={item.name}
            onCancel={() => setRenaming(false)}
            onSubmit={async (name) => {
              const saved = await done(
                shown.kind === 'group'
                  ? { type: 'renameGroup', group: item.id, name }
                  : { type: 'renameFolder', folder: item.id, name },
              );
              if (saved) setRenaming(false);
              return saved;
            }}
          />
        ) : (
          <h1 id="view-title" className="group__name">
            {item.name}
          </h1>
        )}
        {details.ticket}
        <span className="group__meta">
          {tabCount} {tabCount === 1 ? 'tab' : 'tabs'}
          {profile && ` · opens in ${profileOpensIn(snapshot, profile.id)}`}
        </span>
        <ActionMenu
          label={`Options for ${item.name}`}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          entries={shown.kind === 'group' ? groupMenu(item.id, menuHandlers) : folderMenu(item.id, menuHandlers)}
        />
        <div className="group__actions">
          <button type="button" className="button" onClick={() => setAdding('tab')}>
            <Plus className="icon" aria-hidden="true" />
            Add tab
          </button>
          {shown.kind === 'group' && (
            <button type="button" className="button" onClick={() => setAdding('folder')}>
              <FolderPlus className="icon" aria-hidden="true" />
              Add folder
            </button>
          )}
          <button type="button" className="button" onClick={() => actions.open(target)}>
            <ExternalLink className="icon" aria-hidden="true" />
            Open all
          </button>
        </div>
      </header>

      {profile && <SetupNote snapshot={snapshot} profile={profile} onConfigure={() => actions.configureProfile(profile.id)} />}

      {details.noteEditor}

      {adding === 'tab' && (
        <AddTabForm
          onCancel={() => setAdding(null)}
          onSubmit={async (url, title) => {
            const failure = await apply({ type: 'addTab', place, url, title });
            if (!failure) setAdding(null);
            return failure;
          }}
        />
      )}
      {adding === 'folder' && (
        <InlineInput
          label="Folder name"
          placeholder="Sprint, Reading…"
          onCancel={() => setAdding(null)}
          onSubmit={async (name) => {
            const saved = await done({ type: 'addFolder', place, name });
            if (saved) setAdding(null);
            return saved;
          }}
        />
      )}

      {nodes.length === 0 ? (
        <p className="group__empty">
          {shown.kind === 'group'
            ? 'Add a tab or a folder with the buttons above, or drag tabs here.'
            : 'Add a tab with “Add tab”, or drag tabs onto this folder.'}
        </p>
      ) : (
        <Tree place={place} nodes={nodes} row={row} />
      )}
    </main>
  );
}
