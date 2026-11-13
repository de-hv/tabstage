import type { Icon, Target, TextOwner, TicketKind, TicketPlace, Uuid } from '../api/types';

/** What the main area shows: a profile's board, a ticket or a note. */
export type Selection = { kind: 'profile'; id: Uuid } | { kind: 'ticket'; id: Uuid } | { kind: 'note'; id: Uuid };

/** Something "Delete" applies to. */
export type AnyTarget = Target | { profile: Uuid };

/** Actions the sidebar and the main area share; the app implements them. */
export interface ItemActions {
  /** Opens a ticket's own address. */
  openTicket: (ticket: Uuid) => void;
  /** Opens a ticket's address and its sub-tickets' addresses. */
  openTicketAll: (ticket: Uuid) => void;
  /** Copies an address to the clipboard and says so. */
  copyLink: (url: string) => void;
  /** Opens an address, such as a link in a note, in a profile's browser. */
  openUrl: (profile: Uuid, url: string) => void;
  /** Adds a ticket and shows it. */
  newTicket: (place: TicketPlace, title: string, status: Uuid | null, kind?: TicketKind) => Promise<boolean>;
  /** Adds a note and shows it. */
  newNote: (profile: Uuid, title: string) => Promise<boolean>;
  /** Deletes, asking first when it holds sub-tickets. */
  requestDelete: (target: AnyTarget) => void;
  setIcon: (target: Target, icon: Icon | null) => void;
  /** Shows a ticket or note and starts editing its text. */
  editText: (owner: TextOwner) => void;
  configureProfile: (profile: Uuid) => void;
  /** Pins an item to the top of the sidebar, or unpins it. */
  togglePin: (target: Target) => void;
  select: (selection: Selection) => void;
  /** Opens Settings at the statuses. */
  editStatuses: () => void;
}
