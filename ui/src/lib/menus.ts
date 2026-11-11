import {
  ExternalLink,
  FolderInput,
  FolderPlus,
  FoldVertical,
  Globe,
  Layers,
  Link,
  NotebookPen,
  Palette,
  Pencil,
  Settings,
  Smile,
  Trash2,
  UnfoldVertical,
} from 'lucide-react';

import type { Command, Workspace } from '../api/types';
import type { MenuEntry } from '../components/ActionMenu';
import { type DragItem, moveDestinations } from './dnd';

export type NewKind = 'group' | 'folder' | 'tab';

/** What a menu needs to act; each view supplies its own. */
export interface MenuHandlers {
  workspace: Workspace;
  onNew: (kind: NewKind) => void;
  onOpen: () => void;
  onRename: () => void;
  onIcon: () => void;
  /** Edit the name, ticket id and note; groups, folders and tabs only. */
  onDetails?: () => void;
  onMove: (command: Command) => void;
  onDelete: () => void;
}

function moves(item: DragItem, handlers: MenuHandlers): MenuEntry {
  return {
    label: 'Move to…',
    icon: FolderInput,
    items: moveDestinations(item, handlers.workspace).map((move) => ({
      label: move.label,
      onSelect: () => handlers.onMove(move.command),
    })),
  };
}

const rename = (handlers: MenuHandlers): MenuEntry => ({
  label: 'Rename',
  icon: Pencil,
  keepsFocus: true,
  onSelect: handlers.onRename,
});

const icon = (handlers: MenuHandlers, separated = false): MenuEntry => ({
  label: 'Change icon…',
  icon: Smile,
  separated,
  onSelect: handlers.onIcon,
});

const details = (handlers: MenuHandlers): MenuEntry[] =>
  handlers.onDetails ? [{ label: 'Edit details…', icon: NotebookPen, onSelect: handlers.onDetails }] : [];

const remove = (handlers: MenuHandlers, label = 'Delete…'): MenuEntry => ({
  label,
  icon: Trash2,
  danger: true,
  separated: true,
  onSelect: handlers.onDelete,
});

export function profileMenu(
  handlers: MenuHandlers & {
    onColor: () => void;
    onConfigure: () => void;
    canDelete: boolean;
    /** Whether the sidebar shows URLs under tabs, and how to flip it. */
    showsUrls: boolean;
    onToggleUrls: () => void;
    /** Whether the sidebar is compact, and how to flip it. */
    isCompact: boolean;
    onToggleCompact: () => void;
  },
): MenuEntry[] {
  return [
    { label: 'New group', icon: Layers, keepsFocus: true, onSelect: () => handlers.onNew('group') },
    { label: 'New folder', icon: FolderPlus, keepsFocus: true, onSelect: () => handlers.onNew('folder') },
    { label: 'New tab…', icon: Globe, onSelect: () => handlers.onNew('tab') },
    { label: 'Open all', icon: ExternalLink, separated: true, onSelect: handlers.onOpen },
    rename(handlers),
    { label: 'Change color…', icon: Palette, onSelect: handlers.onColor },
    { label: 'Choose browser…', icon: Settings, onSelect: handlers.onConfigure },
    { label: handlers.showsUrls ? 'Hide URLs' : 'Show URLs', icon: Link, onSelect: handlers.onToggleUrls },
    {
      label: handlers.isCompact ? 'Comfortable sidebar' : 'Compact sidebar',
      icon: handlers.isCompact ? UnfoldVertical : FoldVertical,
      onSelect: handlers.onToggleCompact,
    },
    ...(handlers.canDelete ? [remove(handlers)] : []),
  ];
}

export function groupMenu(group: string, handlers: MenuHandlers): MenuEntry[] {
  return [
    { label: 'New folder', icon: FolderPlus, keepsFocus: true, onSelect: () => handlers.onNew('folder') },
    { label: 'New tab…', icon: Globe, onSelect: () => handlers.onNew('tab') },
    { label: 'Open all', icon: ExternalLink, separated: true, onSelect: handlers.onOpen },
    icon(handlers),
    rename(handlers),
    ...details(handlers),
    moves({ kind: 'group', group }, handlers),
    remove(handlers),
  ];
}

export function folderMenu(folder: string, handlers: MenuHandlers): MenuEntry[] {
  return [
    { label: 'New tab…', icon: Globe, onSelect: () => handlers.onNew('tab') },
    { label: 'Open all', icon: ExternalLink, separated: true, onSelect: handlers.onOpen },
    icon(handlers),
    rename(handlers),
    ...details(handlers),
    moves({ kind: 'folder', folder }, handlers),
    remove(handlers),
  ];
}

export function tabMenu(tab: string, handlers: MenuHandlers): MenuEntry[] {
  return [
    { label: 'Open', icon: ExternalLink, onSelect: handlers.onOpen },
    icon(handlers, true),
    rename(handlers),
    ...details(handlers),
    moves({ kind: 'tab', tab }, handlers),
    remove(handlers, 'Delete'),
  ];
}
