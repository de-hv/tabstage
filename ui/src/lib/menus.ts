import {
  CircleDot,
  Copy,
  CornerLeftUp,
  ExternalLink,
  FolderInput,
  Layers,
  ListTree,
  NotebookPen,
  NotebookText,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Settings,
  Smile,
  Ticket,
  Trash2,
} from 'lucide-react';

import type { Command, Ticket as TicketData, Workspace } from '../api/types';
import { TICKET_KINDS } from './ticketKinds';
import type { MenuEntry } from '../components/ActionMenu';
import type { ItemActions } from '../state/selection';
import { findNote, findTicket, pinnedIndex } from './workspace';

/** What a row's menu can ask the row it belongs to. */
export interface RowControls {
  rename: () => void;
  /** Opens the icon (or color) picker on the row's leading button. */
  openLeading: () => void;
}

interface Context {
  workspace: Workspace;
  actions: ItemActions;
  apply: (command: Command) => void;
}

const icon = (row: RowControls): MenuEntry => ({ label: 'Change icon…', icon: Smile, separated: true, onSelect: row.openLeading });
const rename = (row: RowControls): MenuEntry => ({ label: 'Rename', icon: Pencil, keepsFocus: true, onSelect: row.rename });
const remove = (onSelect: () => void, label = 'Delete…'): MenuEntry => ({
  label,
  icon: Trash2,
  danger: true,
  separated: true,
  onSelect,
});

function pin(context: Context, target: Parameters<ItemActions['togglePin']>[0]): MenuEntry {
  const pinned = pinnedIndex(context.workspace, target) !== -1;
  return { label: pinned ? 'Unpin' : 'Pin to top', icon: pinned ? PinOff : Pin, onSelect: () => context.actions.togglePin(target) };
}

function moveToProfile(context: Context, from: string, move: (profile: string) => Command): MenuEntry {
  return {
    label: 'Move to profile',
    icon: FolderInput,
    items: context.workspace.profiles
      .filter((profile) => profile.id !== from)
      .map((profile) => ({ label: profile.name, onSelect: () => context.apply(move(profile.id)) })),
  };
}

export function ticketMenu(id: string, row: RowControls, context: Context): MenuEntry[] {
  const found = findTicket(context.workspace, id);
  if (!found) return [];
  const { profile, parent, ticket } = found;
  const { actions, apply, workspace } = context;
  const current = ticket.status ?? null;
  const entries: MenuEntry[] = [];
  if (ticket.url) {
    const url = ticket.url;
    entries.push(
      { label: 'Open', icon: ExternalLink, onSelect: () => actions.openTicket(id) },
      { label: 'Copy link', icon: Copy, onSelect: () => actions.copyLink(url) },
    );
  }
  const kind = ticket.kind ?? 'ticket';
  entries.push(
    { label: 'Open all', icon: ExternalLink, onSelect: () => actions.openTicketAll(id) },
    pin(context, { ticket: id }),
    {
      label: 'Status',
      icon: CircleDot,
      separated: true,
      items: [
        ...workspace.statuses.map((status) => ({
          label: `${status.id === current ? '✓ ' : ''}${status.name}`,
          onSelect: () => apply({ type: 'setTicketStatus', ticket: id, status: status.id }),
        })),
        { label: `${current === null ? '✓ ' : ''}No status`, onSelect: () => apply({ type: 'setTicketStatus', ticket: id, status: null }) },
        { label: 'Edit statuses…', onSelect: actions.editStatuses },
      ],
    },
    {
      label: 'Type',
      icon: Layers,
      items: TICKET_KINDS.map((option) => ({
        label: `${option.kind === kind ? '✓ ' : ''}${option.label}`,
        onSelect: () => apply({ type: 'setTicketKind', ticket: id, kind: option.kind }),
      })),
    },
  );
  if (parent) {
    entries.push({
      label: `Move out of “${parent.title}”`,
      icon: CornerLeftUp,
      onSelect: () =>
        apply({
          type: 'moveTicket',
          ticket: id,
          place: { profile: profile.id },
          index: profile.tickets.findIndex((candidate) => candidate.id === parent.id) + 1,
        }),
    });
  } else if (!(ticket.children?.length ?? 0)) {
    entries.push({
      label: 'Make sub-ticket of',
      icon: ListTree,
      items: profile.tickets
        .filter((candidate: TicketData) => candidate.id !== id)
        .map((candidate) => ({
          label: candidate.key ? `${candidate.key} ${candidate.title}` : candidate.title,
          onSelect: () =>
            apply({ type: 'moveTicket', ticket: id, place: { ticket: candidate.id }, index: candidate.children?.length ?? 0 }),
        })),
    });
  }
  if (!parent) {
    entries.push(moveToProfile(context, profile.id, (to) => ({ type: 'moveTicket', ticket: id, place: { profile: to }, index: Number.MAX_SAFE_INTEGER })));
  }
  entries.push(
    icon(row),
    rename(row),
    { label: 'Edit note', icon: NotebookPen, onSelect: () => actions.editText({ ticket: id }) },
    remove(() => actions.requestDelete({ ticket: id })),
  );
  return entries;
}

export function noteMenu(id: string, row: RowControls, context: Context): MenuEntry[] {
  const found = findNote(context.workspace, id);
  if (!found) return [];
  const { actions } = context;
  return [
    pin(context, { note: id }),
    icon(row),
    rename(row),
    { label: 'Edit note', icon: NotebookPen, onSelect: () => actions.editText({ note: id }) },
    moveToProfile(context, found.profile.id, (to) => ({ type: 'moveNote', note: id, profile: to, index: Number.MAX_SAFE_INTEGER })),
    remove(() => actions.requestDelete({ note: id })),
  ];
}

export function profileMenu(
  id: string,
  row: RowControls,
  context: Context & {
    onNewTicket: () => void;
    onNewNote: () => void;
    canDelete: boolean;
  },
): MenuEntry[] {
  const { actions } = context;
  return [
    { label: 'New ticket', icon: Ticket, keepsFocus: true, onSelect: context.onNewTicket },
    { label: 'New note', icon: NotebookText, keepsFocus: true, onSelect: context.onNewNote },
    rename(row),
    { label: 'Change color…', icon: Palette, separated: true, onSelect: row.openLeading },
    { label: 'Choose browser…', icon: Settings, onSelect: () => actions.configureProfile(id) },
    ...(context.canDelete ? [remove(() => actions.requestDelete({ profile: id }))] : []),
  ];
}
