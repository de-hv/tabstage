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

export type BrowserChoice = { kind: 'default' } | { kind: 'specific'; browser: BrowserId };

export interface Group {
  id: Uuid;
  name: string;
  color: AccentColor;
  browser: BrowserChoice;
  children: Node[];
}

export interface Workspace {
  statuses: Status[];
  groups: Group[];
}

export type BrowserKind = 'chromium' | 'safari' | 'firefox' | 'other';

export interface BrowserInfo {
  id: BrowserId;
  name: string;
  kind: BrowserKind;
  launch: { type: 'macBundle' } | { type: 'desktopExec'; exec: string };
}

export interface GroupBrowser {
  group: Uuid;
  browser: BrowserId | null;
  followsDefault: boolean;
  isFallback: boolean;
  canFocusTabs: boolean;
}

export interface Snapshot {
  workspace: Workspace;
  settings: { defaultBrowser?: BrowserId };
  browsers: BrowserInfo[];
  defaultBrowser: BrowserId | null;
  dataPath: string;
  groups: GroupBrowser[];
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
  | { type: 'addGroup'; name: string; color: AccentColor }
  | { type: 'renameGroup'; group: Uuid; name: string }
  | { type: 'setGroupBrowser'; group: Uuid; browser: BrowserChoice }
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
  | { type: 'setDefaultBrowser'; browser: BrowserId };

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
