import { ExternalLink, FolderPlus, Plus } from 'lucide-react';
import { useState } from 'react';

import type { AppError, Command, Group, Snapshot } from '../api/types';
import { findProfile, profileBrowser, profileView } from '../lib/browsers';
import { moveDestinations } from '../lib/dnd';
import { AddTabForm } from './AddTabForm';
import { Board } from './Board';
import { ConfirmDelete, type PendingDelete } from './ConfirmDelete';
import { InlineInput } from './InlineInput';
import { ProfilePicker } from './ProfilePicker';
import { RowMenu } from './RowMenu';
import type { RowActions } from './Rows';
import { Tree } from './Tree';

export type View = 'list' | 'board';

interface Props {
  snapshot: Snapshot;
  group: Group;
  view: View;
  onViewChange: (view: View) => void;
  apply: (command: Command) => Promise<AppError | null>;
  openTab: (tab: string, browserName: string) => void;
  openFolder: (folder: string) => void;
  openGroup: (group: string) => void;
  onOpenSettings: () => void;
}

type Adding = 'tab' | 'folder' | null;

function tabCount(group: Group): number {
  return group.children.reduce((total, node) => total + (node.type === 'folder' ? node.tabs.length : 1), 0);
}

export function GroupView({
  snapshot,
  group,
  view,
  onViewChange,
  apply,
  openTab,
  openFolder,
  openGroup,
  onOpenSettings,
}: Props) {
  const [adding, setAdding] = useState<Adding>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const resolved = profileView(snapshot, group.profile);
  const profileName = findProfile(snapshot, group.profile)?.name ?? '';
  const browserName = profileBrowser(snapshot, group.profile)?.name ?? '';

  const saved = async (command: Command) => {
    const failure = await apply(command);
    if (!failure) setEditing(null);
    return !failure;
  };

  const actions: RowActions = {
    statuses: snapshot.workspace.statuses,
    editing,
    canFocusTabs: resolved?.canFocusTabs ?? false,
    onStartRename: setEditing,
    onCancelRename: () => setEditing(null),
    onRenameTab: (tab, title) => saved({ type: 'renameTab', tab: tab.id, title }),
    onRenameFolder: (folder, name) => saved({ type: 'renameFolder', folder: folder.id, name }),
    onSetTabStatus: (tab, status) => void apply({ type: 'setStatus', target: { tab: tab.id }, status }),
    onSetFolderStatus: (folder, status) =>
      void apply({ type: 'setStatus', target: { folder: folder.id }, status }),
    onDeleteTab: (tab) => void apply({ type: 'removeTab', tab: tab.id }),
    onDeleteFolder: (folder) => {
      const remove = () => void apply({ type: 'removeFolder', folder: folder.id });
      if (folder.tabs.length === 0) remove();
      else setPendingDelete({ name: folder.name, tabCount: folder.tabs.length, run: remove });
    },
    onOpenTab: (tab) => openTab(tab.id, browserName),
    onOpenFolder: (folder) => openFolder(folder.id),
    onToggleFolder: (folder) =>
      void apply({ type: 'setFolderCollapsed', folder: folder.id, collapsed: !folder.collapsed }),
    inBoard: view === 'board',
    moveDestinations: (item) => moveDestinations(item, snapshot.workspace),
    onCommand: (command) => void apply(command),
  };

  return (
    <main className="group" aria-labelledby="group-name">
      <header className="group__header" data-color={group.color}>
        <span className="square" />
        {editing === group.id ? (
          <InlineInput
            label="New name"
            initial={group.name}
            onCancel={() => setEditing(null)}
            onSubmit={(name) => saved({ type: 'renameGroup', group: group.id, name })}
          />
        ) : (
          <h1 id="group-name" className="group__name">
            {group.name}
          </h1>
        )}
        <ProfilePicker
          snapshot={snapshot}
          group={group}
          onChange={(profile) => void apply({ type: 'setGroupProfile', group: group.id, profile })}
          onManage={onOpenSettings}
        />
        <RowMenu
          label="Group options"
          deleteLabel="Delete group"
          moves={actions.moveDestinations({ kind: 'group', group: group.id })}
          onMove={actions.onCommand}
          onRename={() => setEditing(group.id)}
          onDelete={() => {
            const remove = () => void apply({ type: 'removeGroup', group: group.id });
            const count = tabCount(group);
            if (count === 0) remove();
            else setPendingDelete({ name: group.name, tabCount: count, run: remove });
          }}
        />
        <div className="group__actions">
          <div className="segmented" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'list'} onClick={() => onViewChange('list')}>
              List
            </button>
            <button type="button" aria-pressed={view === 'board'} onClick={() => onViewChange('board')}>
              By status
            </button>
          </div>
          <button type="button" className="button" onClick={() => setAdding('tab')}>
            <Plus className="icon" aria-hidden="true" />
            Add tab
          </button>
          <button type="button" className="button" onClick={() => setAdding('folder')}>
            <FolderPlus className="icon" aria-hidden="true" />
            Add folder
          </button>
          <button type="button" className="button" onClick={() => openGroup(group.id)}>
            <ExternalLink className="icon" aria-hidden="true" />
            Open all
          </button>
        </div>
      </header>

      {resolved && (!resolved.isBound || resolved.isFallback) && (
        <div className="group__note" role="note">
          <p className="group__note-text">
            {resolved.isFallback
              ? `The browser of the “${profileName}” profile is not installed on this computer. For now its tabs open in ${browserName}.`
              : `The “${profileName}” profile is not set up on this computer. For now its tabs open in ${browserName}.`}
          </p>
          <button type="button" className="button" onClick={onOpenSettings}>
            Configure profile
          </button>
        </div>
      )}

      {adding === 'tab' && (
        <AddTabForm
          onCancel={() => setAdding(null)}
          onSubmit={async (url, title) => {
            const failure = await apply({ type: 'addTab', place: { group: group.id }, url, title });
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
            const failure = await apply({ type: 'addFolder', group: group.id, name });
            if (!failure) setAdding(null);
            return !failure;
          }}
        />
      )}

      {group.children.length === 0 ? (
        <p className="group__empty">
          Add the first tab of this group with “Add tab”. It will open in {browserName || 'its browser'}.
        </p>
      ) : view === 'board' ? (
        <Board group={group} actions={actions} />
      ) : (
        <Tree group={group.id} nodes={group.children} actions={actions} />
      )}

      <ConfirmDelete pending={pendingDelete} onClose={() => setPendingDelete(null)} />
    </main>
  );
}
