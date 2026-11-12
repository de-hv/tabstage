// JSON shapes sent by the Rust side (crates/app). They are checked against
// real Rust output by the `ui_fixture_matches_the_rust_snapshot` test, which
// keeps src/test/fixtures/snapshot.json in sync.

export type Uuid = string;
export type BrowserId = string;
/** Index into the 20 profile colors (see lib/profileColors.ts). */
export type ColorIndex = number;
/** A group's or folder's color: one of the profile colors, its parent's, or none (the default). */
export type ContainerColor = ColorIndex | 'parent' | 'none';

/** A custom icon; without one the UI shows the default of the item's kind. */
export type Icon =
  | { kind: 'emoji'; value: string }
  /** A Lucide icon name, such as `git-pull-request`. */
  | { kind: 'symbol'; value: string }
  /** One to three characters, such as `142` or `★`. */
  | { kind: 'text'; value: string };

export interface Tab {
  id: Uuid;
  url: string;
  title: string;
  icon?: Icon;
  /** Ticket key in Jira or a similar tracker, such as `PROJ-123`. */
  ticketId?: string;
  /** Free-form note; may span several lines. */
  note?: string;
}

export interface Folder {
  id: Uuid;
  name: string;
  /** Its color; none when left out. */
  color?: ContainerColor;
  icon?: Icon;
  /** Ticket key in Jira or a similar tracker, such as `PROJ-123`. */
  ticketId?: string;
  /** Free-form note; may span several lines. */
  note?: string;
  collapsed: boolean;
  tabs: Tab[];
}

/** A direct child of a group. */
export type Node = ({ type: 'tab' } & Tab) | ({ type: 'folder' } & Folder);

export interface Group {
  id: Uuid;
  name: string;
  /** Its color; none when left out. */
  color?: ContainerColor;
  icon?: Icon;
  /** Ticket key in Jira or a similar tracker, such as `PROJ-123`. */
  ticketId?: string;
  /** Free-form note; may span several lines. */
  note?: string;
  children: Node[];
}

/** A direct child of a profile. */
export type Item = ({ type: 'group' } & Group) | Node;

export interface Profile {
  id: Uuid;
  name: string;
  color: ColorIndex;
  /** Address ticket ids link to, with a `{ticket}` placeholder. */
  ticketUrl?: string;
  items: Item[];
}

export interface Workspace {
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
  groups: number;
  tabs: number;
}

/** Something that holds tabs; a folder cannot hold folders. */
export type Place = { profile: Uuid } | { group: Uuid } | { folder: Uuid };
/** A group, folder or tab. */
export type Target = { group: Uuid } | { folder: Uuid } | { tab: Uuid };
/** A group or folder: what can hold others and have a color. */
export type Container = { group: Uuid } | { folder: Uuid };

export type Command =
  | { type: 'addGroup'; profile: Uuid; name: string }
  | { type: 'renameGroup'; group: Uuid; name: string }
  | { type: 'moveGroup'; group: Uuid; profile: Uuid; index: number }
  | { type: 'removeGroup'; group: Uuid }
  | { type: 'addFolder'; place: Place; name: string }
  | { type: 'renameFolder'; folder: Uuid; name: string }
  | { type: 'setFolderCollapsed'; folder: Uuid; collapsed: boolean }
  | { type: 'moveFolder'; folder: Uuid; place: Place; index: number }
  | { type: 'removeFolder'; folder: Uuid }
  | { type: 'addTab'; place: Place; url: string; title: string }
  | { type: 'renameTab'; tab: Uuid; title: string }
  | { type: 'setTabUrl'; tab: Uuid; url: string }
  | { type: 'removeTab'; tab: Uuid }
  | { type: 'moveTab'; tab: Uuid; place: Place; index: number }
  | { type: 'setIcon'; target: Target; icon: Icon | null }
  | { type: 'setColor'; target: Container; color: ContainerColor }
  | { type: 'pin'; target: Target }
  | { type: 'unpin'; target: Target }
  | { type: 'movePinned'; target: Target; index: number }
  | { type: 'setDetails'; target: Target; ticketId: string; note: string }
  | { type: 'setTicketUrl'; profile: Uuid; url: string }
  | { type: 'addProfile'; name: string }
  | { type: 'renameProfile'; profile: Uuid; name: string }
  | { type: 'setProfileColor'; profile: Uuid; color: number }
  | { type: 'moveProfile'; profile: Uuid; index: number }
  | { type: 'removeProfile'; profile: Uuid; moveItemsTo: Uuid }
  | { type: 'bindProfile'; profile: Uuid; browser: BrowserId | null };

export type ErrorCode =
  | 'notFound'
  | 'invalid'
  | 'conflict'
  | 'io'
  | 'badFile'
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
