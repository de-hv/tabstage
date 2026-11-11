import type { Icon, Place, Target, Uuid } from '../api/types';

/** What the main area shows: a profile's board, a group or folder list, or a tab's detail. */
export type Selection =
  | { kind: 'profile'; id: Uuid }
  | { kind: 'group'; id: Uuid }
  | { kind: 'folder'; id: Uuid }
  | { kind: 'tab'; id: Uuid };

/** Something "Open all" or "Delete" applies to. */
export type AnyTarget = Target | { profile: Uuid };

/** Actions the sidebar and the main area share; the app implements them. */
export interface ItemActions {
  open: (target: AnyTarget) => void;
  /** Asks for a URL, then adds the tab to `place`. */
  newTab: (place: Place) => void;
  /** Deletes, asking first when it holds tabs. */
  requestDelete: (target: AnyTarget) => void;
  setIcon: (target: Target, icon: Icon | null) => void;
  /** Opens the dialog for the name, ticket id and note of a group, folder or tab. */
  editDetails: (target: Target) => void;
  configureProfile: (profile: Uuid) => void;
}
