import {
  ExternalLink,
  FolderInput,
  FolderPlus,
  Globe,
  Layers,
  Link,
  NotebookPen,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Settings,
  Smile,
  Ticket,
  Trash2,
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
  /** Pick a color; profiles, groups and folders only. */
  onColor?: () => void;
  /** Open the item's ticket; only when it has one and its profile a ticket URL. */
  onTicket?: () => void;
  /** Pin to or unpin from the top of the sidebar; groups, folders and tabs only. */
  pin?: { pinned: boolean; onToggle: () => void };
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

const color = (handlers: MenuHandlers): MenuEntry[] =>
  handlers.onColor ? [{ label: 'Change color…', icon: Palette, onSelect: handlers.onColor }] : [];

const pin = (handlers: MenuHandlers): MenuEntry[] =>
  handlers.pin
    ? [
        {
          label: handlers.pin.pinned ? 'Unpin' : 'Pin to top',
          icon: handlers.pin.pinned ? PinOff : Pin,
          onSelect: handlers.pin.onToggle,
        },
      ]
    : [];

const ticket = (handlers: MenuHandlers): MenuEntry[] =>
  handlers.onTicket ? [{ label: 'Open ticket', icon: Ticket, onSelect: handlers.onTicket }] : [];

const details = (handlers: MenuHandlers): MenuEntry[] =>
  handlers.onDetails ? [{ label: 'Edit note', icon: NotebookPen, onSelect: handlers.onDetails }] : [];

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
    ...(handlers.canDelete ? [remove(handlers)] : []),
  ];
}

export function groupMenu(group: string, handlers: MenuHandlers): MenuEntry[] {
  return [
    { label: 'New folder', icon: FolderPlus, keepsFocus: true, onSelect: () => handlers.onNew('folder') },
    { label: 'New tab…', icon: Globe, onSelect: () => handlers.onNew('tab') },
    { label: 'Open all', icon: ExternalLink, separated: true, onSelect: handlers.onOpen },
    ...pin(handlers),
    ...ticket(handlers),
    icon(handlers),
    ...color(handlers),
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
    ...pin(handlers),
    ...ticket(handlers),
    icon(handlers),
    ...color(handlers),
    rename(handlers),
    ...details(handlers),
    moves({ kind: 'folder', folder }, handlers),
    remove(handlers),
  ];
}

export function tabMenu(tab: string, handlers: MenuHandlers): MenuEntry[] {
  return [
    { label: 'Open', icon: ExternalLink, onSelect: handlers.onOpen },
    ...pin(handlers),
    ...ticket(handlers),
    icon(handlers, true),
    rename(handlers),
    ...details(handlers),
    moves({ kind: 'tab', tab }, handlers),
    remove(handlers, 'Delete'),
  ];
}
