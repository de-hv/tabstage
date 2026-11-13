import { Bug, Lightbulb, type LucideIcon, SquareCheck, Ticket } from 'lucide-react';

import type { TicketKind } from '../api/types';

/** A kind of ticket with its label and default icon. */
export interface KindInfo {
  kind: TicketKind;
  label: string;
  icon: LucideIcon;
}

/** Every kind, in the order menus show them. */
export const TICKET_KINDS: readonly KindInfo[] = [
  { kind: 'ticket', label: 'Ticket', icon: Ticket },
  { kind: 'task', label: 'Task', icon: SquareCheck },
  { kind: 'bug', label: 'Bug', icon: Bug },
  { kind: 'spike', label: 'Spike', icon: Lightbulb },
];

export function kindInfo(kind: TicketKind | undefined): KindInfo {
  return TICKET_KINDS.find((info) => info.kind === (kind ?? 'ticket')) ?? TICKET_KINDS[0]!;
}
