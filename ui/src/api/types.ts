// JSON shapes sent by the Rust side (crates/app). They are checked against
// real Rust output by the `ui_fixture_matches_the_rust_snapshot` test, which
// keeps src/test/fixtures/snapshot.json in sync.

export type Uuid = string;
export type BrowserId = string;
/** Index into the 20 profile colors (see lib/profileColors.ts). */
export type ColorIndex = number;

/** A custom icon; without one the UI shows the default of the item's kind. */
export type Icon =
  | { kind: 'emoji'; value: string }
  /** A Lucide icon name, such as `git-pull-request`. */
  | { kind: 'symbol'; value: string }
  /** One to three characters, such as `142` or `★`. */
  | { kind: 'text'; value: string };

/** A saved tab of a ticket or a note. */
export interface Link {
  id: Uuid;
  url: string;
  title: string;
  icon?: Icon;
}

/** A piece of work, such as a Jira issue. A sub-ticket has no `children`. */
export interface Ticket {
  id: Uuid;
  title: string;
  /** Key in Jira or a similar tracker, such as `PROJ-123`. */
  key?: string;
  /** The ticket's own address. */
  url?: string;
  status?: Uuid;
  icon?: Icon;
  /** Markdown. */
  note?: string;
  links?: Link[];
  children?: Ticket[];
}

/** Something that is not a ticket, such as standup notes. */
export interface Note {
  id: Uuid;
  title: string;
  icon?: Icon;
  /** Markdown. */
  body?: string;
  links?: Link[];
}

/** A step of the workflow, shared by every profile. */
export interface Status {
  id: Uuid;
  name: string;
  color: ColorIndex;
}

export interface Profile {
  id: Uuid;
  name: string;
  color: ColorIndex;
  tickets: Ticket[];
  notes: Note[];
}

export interface Workspace {
  /** The workflow, in order. */
  statuses: Status[];
  profiles: Profile[];
  /** Items in the sidebar's "Pinned" section, in order. */
  pinned?: Target[];
}

export type BrowserKind = 'chromium' | 'safari' | 'firefox' | 'other';

export interface BrowserInfo {
  id: BrowserId;
  name: string;
  kind: BrowserKind;
  launch: { type: 'macBundle' } | { type: 'desktopExec'; exec: string };
}

/** Machine-local: which browser a Tabstage profile opens in here. */
export interface ProfileBinding {
  browser: BrowserId;
}

export interface ProfileView {
  profile: Uuid;
  binding: ProfileBinding | null;
  /** Browser that opens the profile's tabs here. */
  browser: BrowserId | null;
  isBound: boolean;
  /** The bound browser is not installed here, so the system one is used. */
  isFallback: boolean;
  canFocusTabs: boolean;
}

export interface Snapshot {
  workspace: Workspace;
  /** A file from before tickets, set aside and not imported yet. */
  legacyBackup: string | null;
  settings: Record<string, never>;
  browsers: BrowserInfo[];
  systemBrowser: BrowserId | null;
  dataPath: string;
  dataLocation: DataLocation;
  /** First run: no data file yet, so the app asks where to keep it. */
  needsDataFile: boolean;
  profiles: ProfileView[];
}

export type DataLocationKind = 'appData' | 'iCloudDrive' | 'dropbox' | 'oneDrive' | 'googleDrive' | 'folder';

export interface DataLocation {
  kind: DataLocationKind;
  /** Folder that holds the data file. */
  folder: string;
}

export type Relocate = 'useExisting' | 'replaceWithMine';

export interface DataFileInfo {
  path: string;
  exists: boolean;
  tickets: number;
  notes: number;
}

/** A ticket, note or link. */
export type Target = { ticket: Uuid } | { note: Uuid } | { link: Uuid };
/** What holds links. */
export type LinkOwner = { ticket: Uuid } | { note: Uuid };
/** Where a ticket goes: a profile, or under a ticket as a sub-ticket. */
export type TicketPlace = { profile: Uuid } | { ticket: Uuid };

export type Command =
  | { type: 'addTicket'; id?: Uuid; place: TicketPlace; title: string; key?: string; status: Uuid | null }
  | { type: 'setTicketKey'; ticket: Uuid; key: string }
  | { type: 'setTicketUrl'; ticket: Uuid; url: string }
  | { type: 'setTicketStatus'; ticket: Uuid; status: Uuid | null }
  | { type: 'moveTicket'; ticket: Uuid; place: TicketPlace; index: number; lane?: { status: Uuid | null } }
  | { type: 'removeTicket'; ticket: Uuid }
  | { type: 'addNote'; id?: Uuid; profile: Uuid; title: string }
  | { type: 'moveNote'; note: Uuid; profile: Uuid; index: number }
  | { type: 'removeNote'; note: Uuid }
  | { type: 'setText'; owner: LinkOwner; text: string }
  | { type: 'addLink'; owner: LinkOwner; url: string; title: string }
  | { type: 'setLinkUrl'; link: Uuid; url: string }
  | { type: 'moveLink'; link: Uuid; owner: LinkOwner; index: number }
  | { type: 'removeLink'; link: Uuid }
  | { type: 'rename'; target: Target; name: string }
  | { type: 'setIcon'; target: Target; icon: Icon | null }
  | { type: 'pin'; target: Target }
  | { type: 'unpin'; target: Target }
  | { type: 'movePinned'; target: Target; index: number }
  | { type: 'addStatus'; name: string; color: ColorIndex }
  | { type: 'renameStatus'; status: Uuid; name: string }
  | { type: 'setStatusColor'; status: Uuid; color: ColorIndex }
  | { type: 'moveStatus'; status: Uuid; index: number }
  | { type: 'removeStatus'; status: Uuid }
  | { type: 'addProfile'; name: string }
  | { type: 'renameProfile'; profile: Uuid; name: string }
  | { type: 'setProfileColor'; profile: Uuid; color: ColorIndex }
  | { type: 'moveProfile'; profile: Uuid; index: number }
  | { type: 'removeProfile'; profile: Uuid; moveItemsTo: Uuid }
  | { type: 'bindProfile'; profile: Uuid; browser: BrowserId | null };

export type ErrorCode =
  | 'notFound'
  | 'invalid'
  | 'conflict'
  | 'io'
  | 'badFile'
  | 'legacyFile'
  | 'browser'
  | 'invalidUrl'
  | 'unknownBrowser'
  | 'noBrowser'
  | 'cloudFolder'
  | 'internal';

export interface AppError {
  code: ErrorCode;
  message: string;
}

export type Opened = 'focusedExisting' | 'openedNew';

export interface OpenSummary {
  opened: number;
  focused: number;
}

// ---- importing a file from before tickets ----------------------------------

/** What an old group, folder or tab becomes. */
export type Role = 'status' | 'ticket' | 'subTicket' | 'ownLink' | 'link' | 'note' | 'unwrap';

export interface LegacyItem {
  id: string;
  kind: 'group' | 'folder' | 'tab';
  name: string;
  url?: string;
  key?: string;
  note?: string;
  icon?: Icon;
  color?: ColorIndex;
  children: LegacyItem[];
}

export interface LegacyProfile {
  id: Uuid;
  name: string;
  color: ColorIndex;
  items: LegacyItem[];
}

export interface ImportPreview {
  path: string;
  tree: { version: number; profiles: LegacyProfile[] };
  summary: { roles: Record<string, Role>; statuses: number; tickets: number; notes: number; links: number };
  /** What the import would create. */
  preview: Workspace;
}
