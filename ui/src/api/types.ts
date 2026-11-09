// JSON shapes sent by the Rust side (crates/app). They are checked against
// real Rust output by the `ui_fixture_matches_the_rust_snapshot` test, which
// keeps src/test/fixtures/snapshot.json in sync.

export type Uuid = string;
export type BrowserId = string;
export type StatusId = string;

export type AccentColor =
  | 'lavender'
  | 'blue'
  | 'sky'
  | 'teal'
  | 'green'
  | 'yellow'
  | 'peach'
  | 'red'
  | 'pink'
  | 'mauve';

export interface Status {
  id: StatusId;
  label: string;
  color: AccentColor;
}

export interface Tab {
  id: Uuid;
  url: string;
  title: string;
  status?: StatusId;
}

export interface Folder {
  id: Uuid;
  name: string;
  status?: StatusId;
  collapsed: boolean;
  tabs: Tab[];
}

export type Node = ({ type: 'tab' } & Tab) | ({ type: 'folder' } & Folder);

export interface Profile {
  id: Uuid;
  name: string;
  /** Index into the 20 profile colors (see lib/profileColors.ts). */
  color: number;
}

export interface Group {
  id: Uuid;
  name: string;
  color: AccentColor;
  /** Every group belongs to one profile and opens with it. */
  profile: Uuid;
  children: Node[];
}

export interface Workspace {
  statuses: Status[];
  profiles: Profile[];
  groups: Group[];
}

export type BrowserKind = 'chromium' | 'safari' | 'firefox' | 'other';

export interface BrowserInfo {
  id: BrowserId;
  name: string;
  kind: BrowserKind;
  launch: { type: 'macBundle' } | { type: 'desktopExec'; exec: string };
}

export interface BrowserProfile {
  /** What the browser needs to open it (`Profile 1`, or a Firefox profile name). */
  id: string;
  name: string;
}

/** Machine-local: which browser a Tabstage profile opens in here. */
export interface ProfileBinding {
  browser: BrowserId;
  browserProfile?: string;
  newWindow: boolean;
}

export interface ProfileView {
  profile: Uuid;
  binding: ProfileBinding | null;
  /** Browser that opens the profile's groups here. */
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
  browserProfiles: Record<BrowserId, BrowserProfile[]>;
  systemBrowser: BrowserId | null;
  dataPath: string;
  dataLocation: DataLocation;
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

export type Place = { group: Uuid } | { folder: Uuid };
export type Target = { tab: Uuid } | { folder: Uuid };

export type Command =
  | { type: 'addGroup'; profile: Uuid; name: string; color: AccentColor }
  | { type: 'renameGroup'; group: Uuid; name: string }
  | { type: 'setGroupProfile'; group: Uuid; profile: Uuid }
  | { type: 'moveGroup'; group: Uuid; index: number }
  | { type: 'removeGroup'; group: Uuid }
  | { type: 'addFolder'; group: Uuid; name: string }
  | { type: 'renameFolder'; folder: Uuid; name: string }
  | { type: 'setFolderCollapsed'; folder: Uuid; collapsed: boolean }
  | { type: 'moveFolder'; folder: Uuid; group: Uuid; index: number }
  | { type: 'removeFolder'; folder: Uuid }
  | { type: 'addTab'; place: Place; url: string; title: string }
  | { type: 'renameTab'; tab: Uuid; title: string }
  | { type: 'removeTab'; tab: Uuid }
  | { type: 'moveTab'; tab: Uuid; place: Place; index: number }
  | { type: 'setStatus'; target: Target; status: StatusId | null }
  | { type: 'addStatus'; label: string; color: AccentColor }
  | { type: 'renameStatus'; status: StatusId; label: string }
  | { type: 'setStatusColor'; status: StatusId; color: AccentColor }
  | { type: 'moveStatus'; status: StatusId; index: number }
  | { type: 'removeStatus'; status: StatusId; replacement: StatusId | null }
  | { type: 'addProfile'; name: string }
  | { type: 'renameProfile'; profile: Uuid; name: string }
  | { type: 'setProfileColor'; profile: Uuid; color: number }
  | { type: 'moveProfile'; profile: Uuid; index: number }
  | { type: 'removeProfile'; profile: Uuid; moveGroupsTo: Uuid }
  | {
      type: 'bindProfile';
      profile: Uuid;
      browser: BrowserId;
      browserProfile: string | null;
      newWindow: boolean;
    };

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
