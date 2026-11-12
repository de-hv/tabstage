import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import type { Command, Folder, Tab, Workspace } from '../api/types';
import { folderMenu, type MenuHandlers, tabMenu } from '../lib/menus';
import type { ItemActions } from '../state/selection';
import { pressable } from '../lib/pressable';
import { useClickOrDoubleClick } from '../state/useClickOrDoubleClick';
import { ActionMenu } from './ActionMenu';
import { useDrag, useDrop } from './DragDrop';
import { IconPicker } from './IconPicker';
import { InlineInput } from './InlineInput';
import { ItemIcon } from './ItemIcon';
import { TabUrl } from './TabUrl';

/** What list rows need from the view that shows them. */
export interface RowContext {
  workspace: Workspace;
  actions: ItemActions;
  canFocusTabs: boolean;
  apply: (command: Command) => Promise<boolean>;
  onSelectFolder: (folder: string) => void;
  onSelectTab: (tab: string) => void;
}

function handlers(row: RowContext, own: Omit<MenuHandlers, 'workspace' | 'onMove'>): MenuHandlers {
  return { ...own, workspace: row.workspace, onMove: (command) => void row.apply(command) };
}

export function TabItem({ tab, row }: { tab: Tab; row: RowContext }) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const drag = useDrag({ kind: 'tab', tab: tab.id });
  const drop = useDrop({ kind: 'before', node: tab.id });
  const clicks = useClickOrDoubleClick(
    () => row.onSelectTab(tab.id),
    () => row.actions.open({ tab: tab.id }),
  );
  if (renaming) {
    return (
      <InlineInput
        label="New name"
        initial={tab.title}
        onCancel={() => setRenaming(false)}
        onSubmit={async (title) => {
          const saved = await row.apply({ type: 'renameTab', tab: tab.id, title });
          if (saved) setRenaming(false);
          return saved;
        }}
      />
    );
  }
  return (
    <div
      className="row-wrap"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
      {...drag}
      {...drop}
    >
      <IconPicker
        name={tab.title}
        icon={tab.icon}
        open={iconOpen}
        onOpenChange={setIconOpen}
        onChange={(icon) => row.actions.setIcon({ tab: tab.id }, icon)}
      >
        <button type="button" className="row__icon" aria-label={`Icon of ${tab.title}`}>
          <ItemIcon icon={tab.icon} kind="tab" />
        </button>
      </IconPicker>
      <div {...pressable(() => row.onSelectTab(tab.id))} className="row" title={tab.url} {...clicks}>
        <span className="row__title row__title--tab">{tab.title}</span>
        <TabUrl url={tab.url} />
        <span className="row__hint" aria-hidden="true">
          Double-click to open
        </span>
      </div>
      <ActionMenu
        label={`Options for ${tab.title}`}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        entries={tabMenu(
          tab.id,
          handlers(row, {
            onNew: () => undefined,
            onOpen: () => row.actions.open({ tab: tab.id }),
            onRename: () => setRenaming(true),
            onIcon: () => setIconOpen(true),
            onDetails: () => row.actions.editDetails({ tab: tab.id }),
            onDelete: () => row.actions.requestDelete({ tab: tab.id }),
          }),
        )}
      />
    </div>
  );
}

export function FolderHeader({ folder, row }: { folder: Folder; row: RowContext }) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const drag = useDrag({ kind: 'folder', folder: folder.id });
  const drop = useDrop((item) =>
    item.kind === 'tab' ? { kind: 'into', place: { folder: folder.id } } : { kind: 'before', node: folder.id },
  );
  if (renaming) {
    return (
      <InlineInput
        label="New name"
        initial={folder.name}
        onCancel={() => setRenaming(false)}
        onSubmit={async (name) => {
          const saved = await row.apply({ type: 'renameFolder', folder: folder.id, name });
          if (saved) setRenaming(false);
          return saved;
        }}
      />
    );
  }
  return (
    <div
      className="row-wrap"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
      {...drag}
      {...drop}
    >
      <button
        type="button"
        className="icon-button row__toggle"
        aria-expanded={!folder.collapsed}
        aria-label={`${folder.collapsed ? 'Expand' : 'Collapse'} ${folder.name}`}
        onClick={() => void row.apply({ type: 'setFolderCollapsed', folder: folder.id, collapsed: !folder.collapsed })}
      >
        {folder.collapsed ? <ChevronRight className="icon" aria-hidden="true" /> : <ChevronDown className="icon" aria-hidden="true" />}
      </button>
      <IconPicker
        name={folder.name}
        icon={folder.icon}
        open={iconOpen}
        onOpenChange={setIconOpen}
        onChange={(icon) => row.actions.setIcon({ folder: folder.id }, icon)}
      >
        <button type="button" className="row__icon" aria-label={`Icon of ${folder.name}`}>
          <ItemIcon icon={folder.icon} kind="folder" />
        </button>
      </IconPicker>
      <div {...pressable(() => row.onSelectFolder(folder.id))} className="row" onClick={() => row.onSelectFolder(folder.id)}>
        <span className="row__title folder__name">{folder.name}</span>
        <span className="row__count">{folder.tabs.length}</span>
      </div>
      <button
        type="button"
        className="icon-button"
        title="Open the folder's tabs"
        aria-label={`Open the tabs of ${folder.name}`}
        onClick={() => row.actions.open({ folder: folder.id })}
      >
        <ExternalLink className="icon" aria-hidden="true" />
      </button>
      <ActionMenu
        label={`Options for ${folder.name}`}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        entries={folderMenu(
          folder.id,
          handlers(row, {
            onNew: () => row.actions.newTab({ folder: folder.id }),
            onOpen: () => row.actions.open({ folder: folder.id }),
            onRename: () => setRenaming(true),
            onIcon: () => setIconOpen(true),
            onDetails: () => row.actions.editDetails({ folder: folder.id }),
            onDelete: () => row.actions.requestDelete({ folder: folder.id }),
          }),
        )}
      />
    </div>
  );
}
