import { ChevronDown, ChevronRight, ExternalLink, Folder as FolderIcon, Globe } from 'lucide-react';

import type { Command, Folder, Status, Tab } from '../api/types';
import type { DragItem, MoveDestination } from '../lib/dnd';
import { useDrag, useDrop } from './DragDrop';
import { InlineInput } from './InlineInput';
import { RowMenu } from './RowMenu';

/** What a row needs to show its menu and rename itself. */
export interface RowActions {
  statuses: Status[];
  editing: string | null;
  canFocusTabs: boolean;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onRenameTab: (tab: Tab, title: string) => Promise<boolean>;
  onRenameFolder: (folder: Folder, name: string) => Promise<boolean>;
  onSetTabStatus: (tab: Tab, status: string | null) => void;
  onSetFolderStatus: (folder: Folder, status: string | null) => void;
  onDeleteTab: (tab: Tab) => void;
  onDeleteFolder: (folder: Folder) => void;
  onOpenTab: (tab: Tab) => void;
  onOpenFolder: (folder: Folder) => void;
  onToggleFolder: (folder: Folder) => void;
  /** On the board, rows drag but tiles take the drops. */
  inBoard: boolean;
  moveDestinations: (item: DragItem) => MoveDestination[];
  onCommand: (command: Command) => void;
}

interface TabItemProps {
  tab: Tab;
  /** Status chip to show; hidden when a folder status applies. */
  status: Status | undefined;
  /** Folder name shown before the title on the board. */
  prefix?: string;
  actions: RowActions;
}

export function TabItem({ tab, status, prefix, actions }: TabItemProps) {
  const item: DragItem = { kind: 'tab', tab: tab.id };
  const drag = useDrag(item);
  const drop = useDrop(actions.inBoard ? null : { kind: 'before', node: tab.id });
  if (actions.editing === tab.id) {
    return (
      <InlineInput
        label="Nuevo nombre"
        initial={tab.title}
        onCancel={actions.onCancelRename}
        onSubmit={(title) => actions.onRenameTab(tab, title)}
      />
    );
  }
  return (
    <div className="row-wrap" {...drag} {...drop}>
      <button type="button" className="row" title={tab.url} onClick={() => actions.onOpenTab(tab)}>
        <Globe className="icon" aria-hidden="true" />
        <span className="row__title">
          {prefix && <span className="row__prefix">{prefix} / </span>}
          {tab.title} <span className="row__host">{hostOf(tab.url)}</span>
        </span>
        <span className="row__hint" aria-hidden="true">
          {actions.canFocusTabs ? 'Abrir o ir al tab' : 'Abrir'}
        </span>
        <StatusChip status={status} />
      </button>
      <RowMenu
        label={`Opciones de ${tab.title}`}
        status={{
          statuses: actions.statuses,
          current: tab.status,
          onChange: (next) => actions.onSetTabStatus(tab, next),
        }}
        moves={actions.moveDestinations(item)}
        onMove={actions.onCommand}
        onRename={() => actions.onStartRename(tab.id)}
        onDelete={() => actions.onDeleteTab(tab)}
      />
    </div>
  );
}

interface FolderHeaderProps {
  folder: Folder;
  status: Status | undefined;
  /** On the board folders always show their tabs, so there is no toggle. */
  toggle: boolean;
  actions: RowActions;
}

export function FolderHeader({ folder, status, toggle, actions }: FolderHeaderProps) {
  const item: DragItem = { kind: 'folder', folder: folder.id };
  const drag = useDrag(item);
  const drop = useDrop(actions.inBoard ? null : { kind: 'folder', folder: folder.id });
  if (actions.editing === folder.id) {
    return (
      <InlineInput
        label="Nuevo nombre"
        initial={folder.name}
        onCancel={actions.onCancelRename}
        onSubmit={(name) => actions.onRenameFolder(folder, name)}
      />
    );
  }
  const content = (
    <>
      <FolderIcon className="icon" aria-hidden="true" />
      <span className="row__title folder__name">{folder.name}</span>
      <span className="row__count">{folder.tabs.length}</span>
      <StatusChip status={status} />
    </>
  );
  return (
    <div className="row-wrap" {...drag} {...drop}>
      {toggle ? (
        <button
          type="button"
          className="row"
          aria-expanded={!folder.collapsed}
          aria-label={`${folder.collapsed ? 'Expandir' : 'Contraer'} ${folder.name}`}
          onClick={() => actions.onToggleFolder(folder)}
        >
          {folder.collapsed ? (
            <ChevronRight className="icon" aria-hidden="true" />
          ) : (
            <ChevronDown className="icon" aria-hidden="true" />
          )}
          {content}
        </button>
      ) : (
        <div className="row row--static">{content}</div>
      )}
      <button
        type="button"
        className="icon-button"
        title="Abrir los tabs de la carpeta"
        aria-label="Abrir los tabs de la carpeta"
        onClick={() => actions.onOpenFolder(folder)}
      >
        <ExternalLink className="icon" aria-hidden="true" />
      </button>
      <RowMenu
        label={`Opciones de la carpeta ${folder.name}`}
        status={{
          statuses: actions.statuses,
          current: folder.status,
          onChange: (next) => actions.onSetFolderStatus(folder, next),
        }}
        moves={actions.moveDestinations(item)}
        onMove={actions.onCommand}
        onRename={() => actions.onStartRename(folder.id)}
        onDelete={() => actions.onDeleteFolder(folder)}
      />
    </div>
  );
}

export function StatusChip({ status }: { status: Status | undefined }) {
  if (!status) return null;
  return (
    <span className="chip" data-color={status.color}>
      {status.label}
    </span>
  );
}

export function findStatus(statuses: Status[], id: string | undefined): Status | undefined {
  return statuses.find((status) => status.id === id);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
