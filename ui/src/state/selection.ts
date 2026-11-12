import type { Icon, LinkOwner, Target, TicketPlace, Uuid } from '../api/types';

/** What the main area shows: a profile's board, a ticket or a note. */
export type Selection = { kind: 'profile'; id: Uuid } | { kind: 'ticket'; id: Uuid } | { kind: 'note'; id: Uuid };

/** Something "Delete" applies to. */
export type AnyTarget = Target | { profile: Uuid };

/** Actions the sidebar and the main area share; the app implements them. */
export interface ItemActions {
  /** Opens a link in its profile's browser. */
  openLink: (link: Uuid) => void;
  /** Opens a ticket's own address. */
  openTicket: (ticket: Uuid) => void;
  /** Opens a ticket's address, links and sub-tickets. */
  openTicketAll: (ticket: Uuid) => void;
  /** Opens every link of a note. */
  openNote: (note: Uuid) => void;
  /** Opens an address, such as a link in a note, in a profile's browser. */
  openUrl: (profile: Uuid, url: string) => void;
  /** Adds a ticket and shows it. */
  newTicket: (place: TicketPlace, title: string, status: Uuid | null) => Promise<boolean>;
  /** Adds a note and shows it. */
  newNote: (profile: Uuid, title: string) => Promise<boolean>;
  /** Shows a ticket or note with the field to add a link open. */
  addLink: (owner: LinkOwner) => void;
  /** Deletes, asking first when it holds sub-tickets or links. */
  requestDelete: (target: AnyTarget) => void;
  setIcon: (target: Target, icon: Icon | null) => void;
  /** Shows a ticket or note and starts editing its text. */
  editText: (owner: LinkOwner) => void;
  configureProfile: (profile: Uuid) => void;
  /** Pins an item to the top of the sidebar, or unpins it. */
  togglePin: (target: Target) => void;
  select: (selection: Selection) => void;
  /** Opens Settings at the statuses. */
  editStatuses: () => void;
}
