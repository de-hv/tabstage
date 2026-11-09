//! Application service for Tabstage Desktop.
//!
//! [`AppService`] owns the document, saves every change and opens tabs in
//! the right browser. It does not know about Tauri: the shell forwards IPC
//! calls to it, and tests drive it with a fake [`System`].

pub mod config;
pub mod tray;

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tabstage_browsers::{
    BrowserError, BrowserInfo, Catalog, Launcher, Opened, Platform, TabFocuser, can_focus_tabs,
    find_installed, open_tab,
};
use tabstage_core::{
    AccentColor, BrowserChoice, BrowserId, FolderId, Group, GroupId, Node, Place, Resolved,
    StatusId, Tab, TabId, TabUrl, TabUrlError, Target, Workspace, WorkspaceError,
    effective_browser,
};
use tabstage_store::{Document, FileStore, Settings, StoreError};
use thiserror::Error;

/// Everything the service needs from the OS.
pub trait System: Catalog + Launcher + TabFocuser {}

impl<T: Catalog + Launcher + TabFocuser> System for T {}

/// A change requested by the UI.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Command {
    /// Add a group at the end.
    AddGroup {
        /// Group name.
        name: String,
        /// Accent color.
        color: AccentColor,
    },
    /// Rename a group.
    RenameGroup {
        /// Group to rename.
        group: GroupId,
        /// New name.
        name: String,
    },
    /// Choose the browser a group opens in.
    SetGroupBrowser {
        /// Group to change.
        group: GroupId,
        /// Default or a specific installed browser.
        browser: BrowserChoice,
    },
    /// Move a group in the sidebar.
    MoveGroup {
        /// Group to move.
        group: GroupId,
        /// New position.
        index: usize,
    },
    /// Remove a group and everything in it.
    RemoveGroup {
        /// Group to remove.
        group: GroupId,
    },
    /// Add a folder at the end of a group.
    AddFolder {
        /// Group that gets the folder.
        group: GroupId,
        /// Folder name.
        name: String,
    },
    /// Rename a folder.
    RenameFolder {
        /// Folder to rename.
        folder: FolderId,
        /// New name.
        name: String,
    },
    /// Collapse or expand a folder.
    SetFolderCollapsed {
        /// Folder to change.
        folder: FolderId,
        /// Whether it is collapsed.
        collapsed: bool,
    },
    /// Move a folder, within its group or to another one.
    MoveFolder {
        /// Folder to move.
        folder: FolderId,
        /// Destination group.
        group: GroupId,
        /// Position among the group's children.
        index: usize,
    },
    /// Remove a folder and its tabs.
    RemoveFolder {
        /// Folder to remove.
        folder: FolderId,
    },
    /// Save a link.
    AddTab {
        /// Where to put it.
        place: Place,
        /// URL as typed by the user.
        url: String,
        /// Title; the URL is used when blank.
        title: String,
    },
    /// Change a tab's title.
    RenameTab {
        /// Tab to rename.
        tab: TabId,
        /// New title; the URL is used when blank.
        title: String,
    },
    /// Remove a tab.
    RemoveTab {
        /// Tab to remove.
        tab: TabId,
    },
    /// Move a tab.
    MoveTab {
        /// Tab to move.
        tab: TabId,
        /// Destination.
        place: Place,
        /// Position in the destination.
        index: usize,
    },
    /// Set or clear a status.
    SetStatus {
        /// Tab or folder.
        target: Target,
        /// New status, or `None` to clear it.
        status: Option<StatusId>,
    },
    /// Add a status at the end.
    AddStatus {
        /// Name shown in the UI.
        label: String,
        /// Accent color.
        color: AccentColor,
    },
    /// Rename a status.
    RenameStatus {
        /// Status to rename.
        status: StatusId,
        /// New name.
        label: String,
    },
    /// Change a status color.
    SetStatusColor {
        /// Status to change.
        status: StatusId,
        /// New color.
        color: AccentColor,
    },
    /// Move a status.
    MoveStatus {
        /// Status to move.
        status: StatusId,
        /// New position.
        index: usize,
    },
    /// Remove a status, moving its tabs to another one or to none.
    RemoveStatus {
        /// Status to remove.
        status: StatusId,
        /// Status that takes its tabs and folders.
        replacement: Option<StatusId>,
    },
    /// Choose the default browser.
    SetDefaultBrowser {
        /// An installed browser.
        browser: BrowserId,
    },
}

/// Which browser a group opens in, as shown in the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupBrowser {
    /// The group.
    pub group: GroupId,
    /// Browser that will open its tabs, if any browser is installed.
    pub browser: Option<BrowserId>,
    /// The group follows the default browser.
    pub follows_default: bool,
    /// The group's browser is not installed here, so the default is used.
    pub is_fallback: bool,
    /// Open tabs can be focused instead of opened again.
    pub can_focus_tabs: bool,
}

/// Everything the UI renders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Groups, folders, tabs and statuses.
    pub workspace: Workspace,
    /// Saved settings.
    pub settings: Settings,
    /// Browsers installed on this machine.
    pub browsers: Vec<BrowserInfo>,
    /// The browser groups that follow the default actually use here.
    pub default_browser: Option<BrowserId>,
    /// Path of the data file on this machine.
    pub data_path: String,
    /// Resolved browser of each group, in group order.
    pub groups: Vec<GroupBrowser>,
}

/// What opening several tabs did.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSummary {
    /// Tabs opened in a new tab.
    pub opened: usize,
    /// Tabs that were already open and got focused.
    pub focused: usize,
}

/// Errors returned to the UI.
#[derive(Debug, Error)]
pub enum AppError {
    /// A workspace rule was broken (unknown id, blank name…).
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),
    /// Reading or writing the data file failed, or it changed elsewhere.
    #[error(transparent)]
    Store(#[from] StoreError),
    /// A browser could not be listed or opened.
    #[error(transparent)]
    Browser(#[from] BrowserError),
    /// The typed URL is not a web address.
    #[error(transparent)]
    Url(#[from] TabUrlError),
    /// The browser is not installed on this machine.
    #[error("browser {0} is not installed")]
    UnknownBrowser(BrowserId),
    /// No browser is installed at all.
    #[error("no browser is installed")]
    NoBrowser,
}

impl AppError {
    /// Stable code the UI switches on.
    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::Workspace(
                WorkspaceError::GroupNotFound(_)
                | WorkspaceError::FolderNotFound(_)
                | WorkspaceError::TabNotFound(_)
                | WorkspaceError::StatusNotFound(_),
            ) => "notFound",
            Self::Workspace(_) => "invalid",
            Self::Store(StoreError::Conflict) => "conflict",
            Self::Store(StoreError::Io { .. }) => "io",
            Self::Store(_) => "badFile",
            Self::Browser(_) => "browser",
            Self::Url(_) => "invalidUrl",
            Self::UnknownBrowser(_) => "unknownBrowser",
            Self::NoBrowser => "noBrowser",
        }
    }
}

/// Serializable form of an [`AppError`] for the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ErrorPayload {
    /// See [`AppError::code`].
    pub code: &'static str,
    /// Human readable message, with its causes.
    pub message: String,
}

impl From<&AppError> for ErrorPayload {
    fn from(error: &AppError) -> Self {
        let mut message = error.to_string();
        let mut source = std::error::Error::source(error);
        while let Some(cause) = source {
            message.push_str(": ");
            message.push_str(&cause.to_string());
            source = cause.source();
        }
        Self {
            code: error.code(),
            message,
        }
    }
}

/// Result type for the service.
pub type Result<T> = std::result::Result<T, AppError>;

/// What to do when the new data file location already has Tabstage data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Relocate {
    /// Load the data already there (another machine's).
    UseExisting,
    /// Overwrite it with this machine's data.
    ReplaceWithMine,
}

/// What a candidate data file location holds, so the UI can ask before
/// replacing anything.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataFileInfo {
    /// Full path of the data file.
    pub path: String,
    /// A Tabstage data file is already there.
    pub exists: bool,
    /// Number of groups in it.
    pub groups: usize,
    /// Number of tabs in it, folders included.
    pub tabs: usize,
}

/// Looks at the data file at `path` without changing anything.
///
/// # Errors
///
/// When the file exists but cannot be read or is not a valid data file.
pub fn inspect_data_file(path: &Path) -> Result<DataFileInfo> {
    let document = FileStore::new(path).load()?;
    let (groups, tabs) = document.map_or((0, 0), |document| {
        let groups = document.workspace.groups();
        let tabs = groups
            .iter()
            .flat_map(|group| &group.children)
            .map(|node| match node {
                Node::Tab(_) => 1,
                Node::Folder(folder) => folder.tabs.len(),
            })
            .sum();
        (groups.len(), tabs)
    });
    Ok(DataFileInfo {
        path: path.display().to_string(),
        exists: path.exists(),
        groups,
        tabs,
    })
}

/// Owns the document and talks to the store and the browsers.
#[derive(Debug)]
pub struct AppService<S> {
    system: S,
    store: FileStore,
    document: Document,
    browsers: Vec<BrowserInfo>,
    system_default: Option<BrowserId>,
    platform: Platform,
}

impl<S: System> AppService<S> {
    /// Loads the data file (or starts a new one) and lists the browsers.
    /// On first run the default browser is the system's.
    ///
    /// # Errors
    ///
    /// When the file cannot be read or written, or browsers cannot be listed.
    pub fn start(system: S, mut store: FileStore, platform: Platform) -> Result<Self> {
        let browsers = system.installed()?;
        let system_default = system
            .system_default()?
            .and_then(|id| find_installed(&browsers, &id))
            .map(|browser| browser.id.clone());
        let loaded = store.load()?;
        let is_new = loaded.is_none();
        let mut document = loaded.unwrap_or_default();

        let mut changed = is_new;
        if document.settings.default_browser.is_none() {
            let detected = system_default
                .clone()
                .or_else(|| browsers.first().map(|browser| browser.id.clone()));
            changed |= detected.is_some();
            document.settings.default_browser = detected;
        }
        if changed {
            store.save(&document)?;
        }
        Ok(Self {
            system,
            store,
            document,
            browsers,
            system_default,
            platform,
        })
    }

    /// The system adapter.
    pub const fn system(&self) -> &S {
        &self.system
    }

    /// Current state for the UI.
    #[must_use]
    pub fn snapshot(&self) -> Snapshot {
        let default = self.default_browser();
        let installed: BTreeSet<BrowserId> = self
            .browsers
            .iter()
            .map(|browser| browser.id.clone())
            .collect();
        let groups = self
            .document
            .workspace
            .groups()
            .iter()
            .map(|group| self.resolve_group(group, default, &installed))
            .collect();
        Snapshot {
            workspace: self.document.workspace.clone(),
            settings: self.document.settings.clone(),
            browsers: self.browsers.clone(),
            default_browser: default.map(|browser| browser.id.clone()),
            data_path: self.store.path().display().to_string(),
            groups,
        }
    }

    /// Applies a change and saves it. Nothing changes when it fails.
    ///
    /// # Errors
    ///
    /// When the change is invalid or the file cannot be saved, including
    /// [`StoreError::Conflict`] when another device changed it.
    pub fn apply(&mut self, command: Command) -> Result<Snapshot> {
        let mut next = self.document.clone();
        self.execute(&mut next, command)?;
        self.store.save(&next)?;
        self.document = next;
        Ok(self.snapshot())
    }

    /// Reads the file again, dropping unsaved state. Used after a change on
    /// another device.
    ///
    /// # Errors
    ///
    /// When the file cannot be read.
    pub fn reload(&mut self) -> Result<Snapshot> {
        if let Some(document) = self.store.load()? {
            self.document = document;
        }
        Ok(self.snapshot())
    }

    /// Overwrites the file with this window's state after a conflict.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn force_save(&mut self) -> Result<Snapshot> {
        self.store.force_save(&self.document)?;
        Ok(self.snapshot())
    }

    /// Path of the data file.
    #[must_use]
    pub fn data_path(&self) -> &Path {
        self.store.path()
    }

    /// Moves the data file to `path`, for example into a synced folder.
    /// When a Tabstage file is already there, `mode` decides whether to load
    /// it or overwrite it with this machine's data. Later saves go to `path`;
    /// the old file is left untouched.
    ///
    /// # Errors
    ///
    /// When the file at `path` cannot be read or written.
    pub fn relocate(&mut self, path: PathBuf, mode: Relocate) -> Result<Snapshot> {
        let mut store = FileStore::new(path);
        match (store.load()?, mode) {
            (Some(existing), Relocate::UseExisting) => self.document = existing,
            _ => store.force_save(&self.document)?,
        }
        self.store = store;
        Ok(self.snapshot())
    }

    /// Whether the file changed on disk since it was last read or written.
    ///
    /// # Errors
    ///
    /// When the file cannot be read.
    pub fn has_external_change(&self) -> Result<bool> {
        Ok(self.store.has_external_change()?)
    }

    /// Lists the installed browsers again.
    ///
    /// # Errors
    ///
    /// When browsers cannot be listed.
    pub fn refresh_browsers(&mut self) -> Result<Snapshot> {
        self.browsers = self.system.installed()?;
        Ok(self.snapshot())
    }

    /// Opens a tab in its group's browser, focusing it if already open.
    ///
    /// # Errors
    ///
    /// When the tab is unknown, no browser is installed or opening fails.
    pub fn open_tab(&self, tab: TabId) -> Result<Opened> {
        let found = self
            .document
            .workspace
            .find_tab(tab)
            .ok_or(WorkspaceError::TabNotFound(tab))?;
        let browser = self.browser_for(found.group)?;
        Ok(open_tab(
            browser,
            &found.tab.url,
            self.platform,
            &self.system,
            &self.system,
        )?)
    }

    /// Opens every tab of a folder, in order.
    ///
    /// # Errors
    ///
    /// When the folder is unknown, no browser is installed or opening fails.
    pub fn open_folder(&self, folder: FolderId) -> Result<OpenSummary> {
        let (group, tabs) = self
            .document
            .workspace
            .groups()
            .iter()
            .find_map(|group| {
                group.children.iter().find_map(|node| match node {
                    Node::Folder(found) if found.id == folder => Some((group, &found.tabs)),
                    _ => None,
                })
            })
            .ok_or(WorkspaceError::FolderNotFound(folder))?;
        self.open_all(group, tabs.iter())
    }

    /// Opens every tab of a group, folders included, in order.
    ///
    /// # Errors
    ///
    /// When the group is unknown, no browser is installed or opening fails.
    pub fn open_group(&self, group: GroupId) -> Result<OpenSummary> {
        let group = self
            .document
            .workspace
            .group(group)
            .ok_or(WorkspaceError::GroupNotFound(group))?;
        let tabs = group.children.iter().flat_map(|node| match node {
            Node::Tab(tab) => std::slice::from_ref(tab).iter(),
            Node::Folder(folder) => folder.tabs.iter(),
        });
        self.open_all(group, tabs)
    }

    fn open_all<'a>(
        &self,
        group: &Group,
        tabs: impl Iterator<Item = &'a Tab>,
    ) -> Result<OpenSummary> {
        let browser = self.browser_for(group)?;
        let mut summary = OpenSummary::default();
        for tab in tabs {
            match open_tab(browser, &tab.url, self.platform, &self.system, &self.system)? {
                Opened::OpenedNew => summary.opened += 1,
                Opened::FocusedExisting => summary.focused += 1,
            }
        }
        Ok(summary)
    }

    /// The browser groups that follow the default use here: the saved one
    /// when installed (it may come from another OS through sync), else the
    /// system default, else the first installed browser.
    fn default_browser(&self) -> Option<&BrowserInfo> {
        let saved = self.document.settings.default_browser.as_ref();
        saved
            .and_then(|id| find_installed(&self.browsers, id))
            .or_else(|| {
                self.system_default
                    .as_ref()
                    .and_then(|id| find_installed(&self.browsers, id))
            })
            .or_else(|| self.browsers.first())
    }

    fn browser_for(&self, group: &Group) -> Result<&BrowserInfo> {
        let default = self.default_browser().ok_or(AppError::NoBrowser)?;
        let installed: BTreeSet<BrowserId> = self
            .browsers
            .iter()
            .map(|browser| browser.id.clone())
            .collect();
        let resolved = effective_browser(&group.browser, &default.id, &installed);
        find_installed(&self.browsers, resolved.browser()).ok_or(AppError::NoBrowser)
    }

    fn resolve_group(
        &self,
        group: &Group,
        default: Option<&BrowserInfo>,
        installed: &BTreeSet<BrowserId>,
    ) -> GroupBrowser {
        let Some(default) = default else {
            return GroupBrowser {
                group: group.id,
                browser: None,
                follows_default: group.browser == BrowserChoice::Default,
                is_fallback: false,
                can_focus_tabs: false,
            };
        };
        let resolved = effective_browser(&group.browser, &default.id, installed);
        let can_focus = find_installed(&self.browsers, resolved.browser())
            .is_some_and(|browser| can_focus_tabs(browser.kind, self.platform));
        GroupBrowser {
            group: group.id,
            browser: Some(resolved.browser().clone()),
            follows_default: matches!(resolved, Resolved::Default(_)),
            is_fallback: resolved.is_fallback(),
            can_focus_tabs: can_focus,
        }
    }

    /// The installed browser with this id, with the casing it has here.
    fn installed(&self, id: &BrowserId) -> Result<BrowserId> {
        find_installed(&self.browsers, id)
            .map(|browser| browser.id.clone())
            .ok_or_else(|| AppError::UnknownBrowser(id.clone()))
    }

    fn execute(&self, document: &mut Document, command: Command) -> Result<()> {
        let workspace = &mut document.workspace;
        match command {
            Command::AddGroup { name, color } => workspace.add_group(&name, color).map(drop)?,
            Command::RenameGroup { group, name } => workspace.rename_group(group, &name)?,
            Command::SetGroupBrowser { group, browser } => {
                let browser = match browser {
                    BrowserChoice::Default => BrowserChoice::Default,
                    BrowserChoice::Specific(id) => BrowserChoice::Specific(self.installed(&id)?),
                };
                workspace.set_group_browser(group, browser)?;
            }
            Command::MoveGroup { group, index } => workspace.move_group(group, index)?,
            Command::RemoveGroup { group } => workspace.remove_group(group).map(drop)?,
            Command::AddFolder { group, name } => workspace.add_folder(group, &name).map(drop)?,
            Command::RenameFolder { folder, name } => workspace.rename_folder(folder, &name)?,
            Command::SetFolderCollapsed { folder, collapsed } => {
                workspace.set_folder_collapsed(folder, collapsed)?;
            }
            Command::MoveFolder {
                folder,
                group,
                index,
            } => workspace.move_folder(folder, group, index)?,
            Command::RemoveFolder { folder } => workspace.remove_folder(folder).map(drop)?,
            Command::AddTab { place, url, title } => {
                let url = TabUrl::parse(&url)?;
                workspace.add_tab(place, url, &title).map(drop)?;
            }
            Command::RenameTab { tab, title } => workspace.rename_tab(tab, &title)?,
            Command::RemoveTab { tab } => workspace.remove_tab(tab).map(drop)?,
            Command::MoveTab { tab, place, index } => workspace.move_tab(tab, place, index)?,
            Command::SetStatus { target, status } => workspace.set_status(target, status)?,
            Command::AddStatus { label, color } => workspace.add_status(&label, color).map(drop)?,
            Command::RenameStatus { status, label } => workspace.rename_status(&status, &label)?,
            Command::SetStatusColor { status, color } => {
                workspace.set_status_color(&status, color)?;
            }
            Command::MoveStatus { status, index } => workspace.move_status(&status, index)?,
            Command::RemoveStatus {
                status,
                replacement,
            } => workspace
                .remove_status(&status, replacement.as_ref())
                .map(drop)?,
            Command::SetDefaultBrowser { browser } => {
                document.settings.default_browser = Some(self.installed(&browser)?);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::fs;

    use tabstage_browsers::{BrowserKind, Focus, Launch};

    use super::*;

    fn id(raw: &str) -> BrowserId {
        BrowserId::parse(raw).expect("id")
    }

    fn browser(raw: &str, name: &str) -> BrowserInfo {
        let id = id(raw);
        BrowserInfo {
            kind: BrowserKind::from_id(&id),
            id,
            name: name.to_owned(),
            launch: Launch::MacBundle,
        }
    }

    struct FakeSystem {
        installed: Vec<BrowserInfo>,
        default: Option<BrowserId>,
        focus: Focus,
        opened: RefCell<Vec<String>>,
    }

    impl FakeSystem {
        fn new(default: Option<&str>) -> Self {
            Self {
                installed: vec![
                    browser("com.google.Chrome", "Google Chrome"),
                    browser("org.mozilla.firefox", "Firefox"),
                    browser("com.apple.Safari", "Safari"),
                ],
                default: default.map(id),
                focus: Focus::NotFound,
                opened: RefCell::default(),
            }
        }

        fn without(mut self, raw: &str) -> Self {
            self.installed.retain(|browser| browser.id.as_str() != raw);
            self
        }
    }

    impl Catalog for FakeSystem {
        fn installed(&self) -> tabstage_browsers::Result<Vec<BrowserInfo>> {
            Ok(self.installed.clone())
        }

        fn system_default(&self) -> tabstage_browsers::Result<Option<BrowserId>> {
            Ok(self.default.clone())
        }
    }

    impl Launcher for FakeSystem {
        fn open(&self, browser: &BrowserInfo, url: &TabUrl) -> tabstage_browsers::Result<()> {
            self.opened
                .borrow_mut()
                .push(format!("{} {url}", browser.id));
            Ok(())
        }
    }

    impl TabFocuser for FakeSystem {
        fn focus(&self, _: &BrowserInfo, _: &TabUrl) -> tabstage_browsers::Result<Focus> {
            Ok(self.focus)
        }
    }

    struct Fixture {
        dir: tempfile::TempDir,
    }

    impl Fixture {
        fn new() -> Self {
            Self {
                dir: tempfile::tempdir().expect("tempdir"),
            }
        }

        fn path(&self) -> std::path::PathBuf {
            self.dir.path().join("workspace.json")
        }

        fn start(&self, system: FakeSystem) -> AppService<FakeSystem> {
            self.start_on(system, Platform::Linux)
        }

        fn start_on(&self, system: FakeSystem, platform: Platform) -> AppService<FakeSystem> {
            AppService::start(system, FileStore::new(self.path()), platform).expect("start")
        }
    }

    fn add_group(service: &mut AppService<FakeSystem>, name: &str) -> GroupId {
        let snapshot = service
            .apply(Command::AddGroup {
                name: name.to_owned(),
                color: AccentColor::Blue,
            })
            .expect("add group");
        snapshot
            .workspace
            .groups()
            .iter()
            .find(|group| group.name == name)
            .expect("group")
            .id
    }

    fn add_tab(service: &mut AppService<FakeSystem>, place: Place, url: &str) -> TabId {
        service
            .apply(Command::AddTab {
                place,
                url: url.to_owned(),
                title: String::new(),
            })
            .expect("add tab");
        let found = service
            .document
            .workspace
            .groups()
            .iter()
            .find_map(|group| {
                group.children.iter().find_map(|node| match node {
                    Node::Tab(tab) if tab.url.as_str() == url => Some(tab.id),
                    Node::Folder(folder) => folder
                        .tabs
                        .iter()
                        .find(|tab| tab.url.as_str() == url)
                        .map(|tab| tab.id),
                    Node::Tab(_) => None,
                })
            });
        found.expect("tab")
    }

    #[test]
    fn first_start_saves_the_system_default_with_installed_casing() {
        let fixture = Fixture::new();

        let service = fixture.start(FakeSystem::new(Some("com.google.chrome")));

        assert_eq!(
            service.snapshot().settings.default_browser,
            Some(id("com.google.Chrome"))
        );
        assert!(fixture.path().exists());
    }

    #[test]
    fn unknown_system_default_falls_back_to_first_installed() {
        let fixture = Fixture::new();

        let service = fixture.start(FakeSystem::new(Some("org.gnome.Epiphany")));

        assert_eq!(
            service.snapshot().default_browser,
            Some(id("com.google.Chrome"))
        );
    }

    #[test]
    fn changes_are_saved_and_survive_a_restart() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));

        add_group(&mut service, "Work");
        drop(service);
        let restarted = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));

        assert_eq!(restarted.snapshot().workspace.groups()[0].name, "Work");
    }

    #[test]
    fn invalid_url_is_rejected_and_nothing_changes() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(None));
        let group = add_group(&mut service, "Work");
        let before = fs::read_to_string(fixture.path()).expect("file");

        let result = service.apply(Command::AddTab {
            place: Place::Group(group),
            url: "not a url".into(),
            title: String::new(),
        });

        assert_eq!(result.map(drop).map_err(|e| e.code()), Err("invalidUrl"));
        assert_eq!(fs::read_to_string(fixture.path()).expect("file"), before);
    }

    #[test]
    fn group_browser_must_be_installed() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(None));
        let group = add_group(&mut service, "Work");

        let result = service.apply(Command::SetGroupBrowser {
            group,
            browser: BrowserChoice::Specific(id("com.brave.Browser")),
        });

        assert_eq!(
            result.map(drop).map_err(|e| e.code()),
            Err("unknownBrowser")
        );
    }

    #[test]
    fn tab_opens_in_the_default_browser_when_group_follows_it() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
        let group = add_group(&mut service, "Work");
        let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");

        let opened = service.open_tab(tab).expect("open");

        assert_eq!(opened, Opened::OpenedNew);
        assert_eq!(
            *service.system().opened.borrow(),
            ["org.mozilla.firefox https://a.dev/"]
        );
    }

    #[test]
    fn tab_opens_in_the_groups_own_browser() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
        let group = add_group(&mut service, "Work");
        service
            .apply(Command::SetGroupBrowser {
                group,
                browser: BrowserChoice::Specific(id("com.google.Chrome")),
            })
            .expect("set browser");
        let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");

        service.open_tab(tab).expect("open");

        assert_eq!(
            *service.system().opened.borrow(),
            ["com.google.Chrome https://a.dev/"]
        );
    }

    #[test]
    fn missing_group_browser_falls_back_and_is_flagged() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
        let group = add_group(&mut service, "Work");
        service
            .apply(Command::SetGroupBrowser {
                group,
                browser: BrowserChoice::Specific(id("com.google.Chrome")),
            })
            .expect("set browser");
        let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");
        drop(service);

        let service = fixture
            .start(FakeSystem::new(Some("org.mozilla.firefox")).without("com.google.Chrome"));
        service.open_tab(tab).expect("open");

        assert_eq!(
            *service.system().opened.borrow(),
            ["org.mozilla.firefox https://a.dev/"]
        );
        let resolved = &service.snapshot().groups[0];
        assert!(resolved.is_fallback);
        assert!(!resolved.follows_default);
    }

    #[test]
    fn open_tab_focuses_an_existing_tab_on_macos() {
        let fixture = Fixture::new();
        let mut system = FakeSystem::new(Some("com.google.Chrome"));
        system.focus = Focus::Focused;
        let mut service = fixture.start_on(system, Platform::MacOs);
        let group = add_group(&mut service, "Work");
        let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");

        let opened = service.open_tab(tab).expect("open");

        assert_eq!(opened, Opened::FocusedExisting);
        assert!(service.system().opened.borrow().is_empty());
        assert!(service.snapshot().groups[0].can_focus_tabs);
    }

    #[test]
    fn open_group_opens_loose_tabs_and_folder_tabs_in_order() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
        let group = add_group(&mut service, "Work");
        add_tab(&mut service, Place::Group(group), "https://a.dev/");
        let snapshot = service
            .apply(Command::AddFolder {
                group,
                name: "Sprint".into(),
            })
            .expect("folder");
        let folder = match &snapshot.workspace.groups()[0].children[1] {
            Node::Folder(folder) => folder.id,
            Node::Tab(_) => panic!("expected folder"),
        };
        add_tab(&mut service, Place::Folder(folder), "https://b.dev/");
        add_tab(&mut service, Place::Folder(folder), "https://c.dev/");

        let all = service.open_group(group).expect("open group");
        let only_folder = service.open_folder(folder).expect("open folder");

        assert_eq!(
            all,
            OpenSummary {
                opened: 3,
                focused: 0
            }
        );
        assert_eq!(only_folder.opened, 2);
        assert_eq!(
            *service.system().opened.borrow(),
            [
                "org.mozilla.firefox https://a.dev/",
                "org.mozilla.firefox https://b.dev/",
                "org.mozilla.firefox https://c.dev/",
                "org.mozilla.firefox https://b.dev/",
                "org.mozilla.firefox https://c.dev/",
            ]
        );
    }

    #[test]
    fn change_from_another_device_is_a_conflict_until_reload_or_force() {
        let fixture = Fixture::new();
        let mut laptop = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
        add_group(&mut laptop, "Mine");
        let mut other = Document::default();
        other
            .workspace
            .add_group("Theirs", AccentColor::Green)
            .expect("group");
        fs::write(fixture.path(), tabstage_store::to_json(&other)).expect("external write");

        assert!(laptop.has_external_change().expect("check"));
        let conflict = laptop.apply(Command::AddGroup {
            name: "Another".into(),
            color: AccentColor::Red,
        });
        assert_eq!(conflict.map(drop).map_err(|e| e.code()), Err("conflict"));
        assert_eq!(laptop.snapshot().workspace.groups().len(), 1);

        let reloaded = laptop.reload().expect("reload");
        assert_eq!(reloaded.workspace.groups()[0].name, "Theirs");

        add_group(&mut laptop, "After reload");
        fs::write(fixture.path(), tabstage_store::to_json(&other)).expect("external write");
        let forced = laptop.force_save().expect("force");
        assert_eq!(forced.workspace.groups().len(), 2);
        assert!(!laptop.has_external_change().expect("check"));
    }

    #[test]
    fn default_synced_from_another_os_falls_back_to_this_systems_default() {
        let fixture = Fixture::new();
        let mut linux_doc = Document::default();
        linux_doc.settings.default_browser = Some(id("firefox.desktop"));
        fs::write(fixture.path(), tabstage_store::to_json(&linux_doc)).expect("write");

        let service = fixture.start(FakeSystem::new(Some("com.apple.Safari")));

        let snapshot = service.snapshot();
        assert_eq!(
            snapshot.settings.default_browser,
            Some(id("firefox.desktop"))
        );
        assert_eq!(snapshot.default_browser, Some(id("com.apple.Safari")));
    }

    #[test]
    fn commands_deserialize_from_ui_json() {
        let nil = "00000000-0000-0000-0000-000000000000";
        let json = format!(
            r#"{{"type":"addTab","place":{{"group":"{nil}"}},"url":"https://a.dev","title":"A"}}"#
        );

        let command: Command = serde_json::from_str(&json).expect("command");

        assert!(matches!(
            command,
            Command::AddTab {
                place: Place::Group(_),
                ..
            }
        ));
        let json = r#"{"type":"setGroupBrowser","group":"00000000-0000-0000-0000-000000000000","browser":{"kind":"default"}}"#;
        assert!(serde_json::from_str::<Command>(json).is_ok());
    }

    /// Contract with the UI: `ui/src/test/fixtures/snapshot.json` must be
    /// exactly what Rust sends for its own `settings` and `workspace`. The UI
    /// tests use that file as mock data, so a change in the JSON shape fails
    /// here instead of silently in the UI. Regenerate with
    /// `UPDATE_UI_FIXTURE=1 cargo test -p tabstage-app ui_fixture`.
    #[test]
    fn ui_fixture_matches_the_rust_snapshot() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../ui/src/test/fixtures/snapshot.json");
        let fixture: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).expect("fixture")).expect("json");
        let file = serde_json::json!({
            "app": tabstage_store::APP,
            "version": tabstage_store::FORMAT_VERSION,
            "settings": fixture["settings"],
            "workspace": fixture["workspace"],
        });
        let dir = Fixture::new();
        fs::write(dir.path(), file.to_string()).expect("write");
        let service = dir.start_on(
            FakeSystem::new(Some("org.mozilla.firefox")),
            Platform::MacOs,
        );

        let mut actual = serde_json::to_value(service.snapshot()).expect("snapshot json");
        // The real path is a temp folder; the fixture keeps a stable one.
        actual["dataPath"] = serde_json::Value::from(
            "/Users/me/Library/Application Support/io.github.de-hv.tabstage/workspace.json",
        );

        if std::env::var_os("UPDATE_UI_FIXTURE").is_some() {
            let text = serde_json::to_string_pretty(&actual).expect("json") + "\n";
            fs::write(&path, text).expect("update fixture");
        } else {
            assert_eq!(
                actual, fixture,
                "UI fixture is out of date; run with UPDATE_UI_FIXTURE=1"
            );
        }
    }

    #[test]
    fn status_commands_edit_the_status_list() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(None));
        let group = add_group(&mut service, "Work");
        let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");
        let in_dev = StatusId::parse("in-dev").expect("id");
        service
            .apply(Command::SetStatus {
                target: Target::Tab(tab),
                status: Some(in_dev.clone()),
            })
            .expect("status");

        service
            .apply(Command::AddStatus {
                label: "Blocked".into(),
                color: AccentColor::Red,
            })
            .expect("add");
        let snapshot = service
            .apply(Command::RemoveStatus {
                status: in_dev,
                replacement: StatusId::parse("blocked").ok(),
            })
            .expect("remove");

        let ids: Vec<_> = snapshot
            .workspace
            .statuses()
            .iter()
            .map(|s| s.id.as_str().to_owned())
            .collect();
        assert_eq!(ids, ["todo", "in-progress", "in-review", "done", "blocked"]);
        assert_eq!(
            snapshot
                .workspace
                .effective_status(tab)
                .expect("tab")
                .map(StatusId::as_str),
            Some("blocked")
        );
    }

    #[test]
    fn snapshot_reports_the_data_path() {
        let fixture = Fixture::new();

        let service = fixture.start(FakeSystem::new(None));

        assert_eq!(
            service.snapshot().data_path,
            fixture.path().display().to_string()
        );
    }

    #[test]
    fn relocate_to_an_empty_folder_moves_my_data_there() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(None));
        add_group(&mut service, "Mine");
        let synced = tempfile::tempdir().expect("tempdir");
        let new_path = config::data_file_in(&synced.path().join("Tabstage"));

        let snapshot = service
            .relocate(new_path.clone(), Relocate::UseExisting)
            .expect("relocate");
        add_group(&mut service, "After move");

        assert_eq!(snapshot.data_path, new_path.display().to_string());
        let moved = inspect_data_file(&new_path).expect("inspect");
        assert_eq!((moved.exists, moved.groups), (true, 2));
        let old = inspect_data_file(&fixture.path()).expect("inspect");
        assert_eq!(old.groups, 1, "old file is left as it was");
    }

    #[test]
    fn relocate_can_use_the_data_already_there() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(None));
        add_group(&mut service, "Mine");
        let synced = tempfile::tempdir().expect("tempdir");
        let new_path = config::data_file_in(synced.path());
        let mut theirs = Document::default();
        theirs
            .workspace
            .add_group("Theirs", AccentColor::Green)
            .expect("group");
        fs::write(&new_path, tabstage_store::to_json(&theirs)).expect("write");

        let snapshot = service
            .relocate(new_path, Relocate::UseExisting)
            .expect("relocate");

        let names: Vec<_> = snapshot
            .workspace
            .groups()
            .iter()
            .map(|g| g.name.as_str())
            .collect();
        assert_eq!(names, ["Theirs"]);
    }

    #[test]
    fn relocate_can_replace_the_data_already_there() {
        let fixture = Fixture::new();
        let mut service = fixture.start(FakeSystem::new(None));
        add_group(&mut service, "Mine");
        let synced = tempfile::tempdir().expect("tempdir");
        let new_path = config::data_file_in(synced.path());
        fs::write(&new_path, tabstage_store::to_json(&Document::default())).expect("write");

        service
            .relocate(new_path.clone(), Relocate::ReplaceWithMine)
            .expect("relocate");

        assert_eq!(inspect_data_file(&new_path).expect("inspect").groups, 1);
    }

    #[test]
    fn inspect_counts_groups_and_tabs_or_reports_missing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = config::data_file_in(dir.path());

        let missing = inspect_data_file(&path).expect("inspect");
        assert_eq!(
            (missing.exists, missing.groups, missing.tabs),
            (false, 0, 0)
        );

        let mut document = Document::default();
        let group = document
            .workspace
            .add_group("G", AccentColor::Blue)
            .expect("group");
        let folder = document.workspace.add_folder(group, "F").expect("folder");
        for (place, url) in [
            (Place::Group(group), "https://a.dev/"),
            (Place::Folder(folder), "https://b.dev/"),
        ] {
            document
                .workspace
                .add_tab(place, TabUrl::parse(url).expect("url"), "")
                .expect("tab");
        }
        fs::write(&path, tabstage_store::to_json(&document)).expect("write");

        let found = inspect_data_file(&path).expect("inspect");
        assert_eq!((found.exists, found.groups, found.tabs), (true, 1, 2));
    }

    #[test]
    fn error_payload_has_code_and_full_message() {
        let error = AppError::from(WorkspaceError::EmptyName);

        let payload = ErrorPayload::from(&error);

        assert_eq!(payload.code, "invalid");
        assert_eq!(payload.message, "name is empty");
    }
}
