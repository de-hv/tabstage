//! Application service for Tabstage Desktop.
//!
//! [`AppService`] owns the document and this machine's config, saves every
//! change and opens tabs with the right profile. It does not know about
//! Tauri: the shell forwards IPC calls to it, and tests drive it with a fake
//! [`System`].
//!
//! Every group belongs to a Tabstage profile. Profiles and groups live in the
//! synced data file; which browser (and which profile of that browser) a
//! profile opens in lives in this machine's [`config::AppConfig`].

pub mod config;
pub mod tray;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tabstage_browsers::profiles::BrowserProfile;
use tabstage_browsers::{
    BrowserError, BrowserInfo, Catalog, LaunchOptions, Launcher, Opened, Platform, TabFocuser,
    can_focus_tabs, find_installed, open_tab,
};
use tabstage_core::{
    AccentColor, BrowserId, FolderId, Group, GroupId, Node, Place, ProfileColor, ProfileId,
    StatusId, Tab, TabId, TabUrl, TabUrlError, Target, Workspace, WorkspaceError,
};
use tabstage_store::{Document, FileStore, Settings, StoreError};
use thiserror::Error;

use crate::config::{AppConfig, ProfileBinding, load_config, save_config};

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
    /// Add a group at the end of a profile.
    AddGroup {
        /// Profile the group belongs to.
        profile: ProfileId,
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
    /// Move a group to another profile.
    SetGroupProfile {
        /// Group to move.
        group: GroupId,
        /// Its new profile.
        profile: ProfileId,
    },
    /// Move a group in the sidebar.
    MoveGroup {
        /// Group to move.
        group: GroupId,
        /// New position among all groups.
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
    /// Add a profile at the end.
    AddProfile {
        /// Profile name.
        name: String,
    },
    /// Rename a profile.
    RenameProfile {
        /// Profile to rename.
        profile: ProfileId,
        /// New name.
        name: String,
    },
    /// Change the color of a profile's dot.
    SetProfileColor {
        /// Profile to recolor.
        profile: ProfileId,
        /// Its new color.
        color: ProfileColor,
    },
    /// Move a profile in the sidebar.
    MoveProfile {
        /// Profile to move.
        profile: ProfileId,
        /// New position.
        index: usize,
    },
    /// Remove a profile, moving its groups to another one.
    RemoveProfile {
        /// Profile to remove.
        profile: ProfileId,
        /// Profile that takes its groups.
        move_groups_to: ProfileId,
    },
    /// Choose, on this machine, the browser a profile opens in.
    BindProfile {
        /// Profile to configure.
        profile: ProfileId,
        /// An installed browser.
        browser: BrowserId,
        /// One of that browser's profiles, if it has any.
        browser_profile: Option<String>,
        /// Open several tabs at once in a new window.
        new_window: bool,
    },
}

/// How a profile opens on this machine, as shown in the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    /// The profile.
    pub profile: ProfileId,
    /// What this machine's config says, if anything.
    pub binding: Option<ProfileBinding>,
    /// Browser that will open the profile's groups here.
    pub browser: Option<BrowserId>,
    /// The profile has a browser chosen on this machine.
    pub is_bound: bool,
    /// The chosen browser is not installed here, so the system one is used.
    pub is_fallback: bool,
    /// Open tabs can be focused instead of opened again.
    pub can_focus_tabs: bool,
}

/// Kind of place the data file lives in, as the UI describes it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DataLocationKind {
    /// The app's own folder on this machine: not shared.
    AppData,
    /// iCloud Drive.
    ICloudDrive,
    /// Dropbox.
    Dropbox,
    /// Microsoft OneDrive.
    OneDrive,
    /// Google Drive.
    GoogleDrive,
    /// Any other folder the user chose.
    Folder,
}

/// Where the data file is, for the Settings card.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataLocation {
    /// What kind of place it is.
    pub kind: DataLocationKind,
    /// Folder that holds the file.
    pub folder: String,
}

/// Names the kind of place `path` is in. `is_default` means the user never
/// moved the file, so it is in the app's own folder.
#[must_use]
pub fn classify_location(path: &Path, is_default: bool) -> DataLocationKind {
    if is_default {
        return DataLocationKind::AppData;
    }
    let path = path.to_string_lossy();
    let has = |needle: &str| path.contains(needle);
    if has("/Library/Mobile Documents/com~apple~CloudDocs/") {
        DataLocationKind::ICloudDrive
    } else if has("/Library/CloudStorage/Dropbox") || has("/Dropbox/") {
        DataLocationKind::Dropbox
    } else if has("/Library/CloudStorage/OneDrive") || has("/OneDrive/") {
        DataLocationKind::OneDrive
    } else if has("/Library/CloudStorage/GoogleDrive") || has("/Google Drive/") {
        DataLocationKind::GoogleDrive
    } else {
        DataLocationKind::Folder
    }
}

/// Everything the UI renders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Groups, folders, tabs, statuses and profiles.
    pub workspace: Workspace,
    /// Synced settings.
    pub settings: Settings,
    /// Browsers installed on this machine.
    pub browsers: Vec<BrowserInfo>,
    /// Profiles of each installed browser that exposes them.
    pub browser_profiles: BTreeMap<BrowserId, Vec<BrowserProfile>>,
    /// Browser used for profiles that are not configured here.
    pub system_browser: Option<BrowserId>,
    /// Path of the data file on this machine.
    pub data_path: String,
    /// Where the data file is, in words the UI can show.
    pub data_location: DataLocation,
    /// How each profile opens here, in profile order.
    pub profiles: Vec<ProfileView>,
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
    /// The browser has no profile with this id.
    #[error("browser profile `{0}` not found")]
    UnknownBrowserProfile(String),
    /// No browser is installed at all.
    #[error("no browser is installed")]
    NoBrowser,
    /// This machine's config could not be saved.
    #[error("could not save this machine's settings")]
    Config(#[source] std::io::Error),
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
                | WorkspaceError::StatusNotFound(_)
                | WorkspaceError::ProfileNotFound(_),
            ) => "notFound",
            Self::Workspace(_) => "invalid",
            Self::Store(StoreError::Conflict) => "conflict",
            Self::Store(StoreError::Io { .. }) | Self::Config(_) => "io",
            Self::Store(_) => "badFile",
            Self::Browser(_) => "browser",
            Self::Url(_) => "invalidUrl",
            Self::UnknownBrowser(_) | Self::UnknownBrowserProfile(_) => "unknownBrowser",
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

/// The browser a profile opens in here, and how.
struct Resolution<'a> {
    browser: Option<&'a BrowserInfo>,
    binding: Option<&'a ProfileBinding>,
    is_fallback: bool,
}

impl Resolution<'_> {
    /// Launch options; a fallback browser ignores the bound browser's profile.
    fn options(&self, first_of_many: bool) -> LaunchOptions {
        match self.binding {
            Some(binding) if !self.is_fallback => LaunchOptions {
                browser_profile: binding.browser_profile.clone(),
                new_window: first_of_many && binding.new_window,
            },
            _ => LaunchOptions::default(),
        }
    }
}

/// Owns the document and this machine's config, and opens tabs.
#[derive(Debug)]
pub struct AppService<S> {
    system: S,
    store: FileStore,
    config_path: PathBuf,
    config: AppConfig,
    document: Document,
    browsers: Vec<BrowserInfo>,
    browser_profiles: BTreeMap<BrowserId, Vec<BrowserProfile>>,
    system_browser: Option<BrowserId>,
    platform: Platform,
}

impl<S: System> AppService<S> {
    /// Loads the data file (or starts a new one), this machine's config and
    /// the installed browsers.
    ///
    /// On first run the only profile opens in the system browser. A version 1
    /// data file is upgraded: its browsers become this machine's bindings.
    ///
    /// # Errors
    ///
    /// When the files cannot be read or written, or browsers cannot be listed.
    pub fn start(
        system: S,
        mut store: FileStore,
        config_path: PathBuf,
        platform: Platform,
    ) -> Result<Self> {
        let browsers = system.installed()?;
        let system_browser = system
            .system_default()?
            .and_then(|id| find_installed(&browsers, &id))
            .or_else(|| browsers.first())
            .map(|browser| browser.id.clone());
        let browser_profiles = profiles_of(&system, &browsers);
        let mut config = load_config(&config_path);

        let loaded = store.load()?;
        let is_new = loaded.is_none();
        let mut document = loaded.unwrap_or_default();
        let migrated = std::mem::take(&mut document.migrated);
        let mut config_changed = false;

        if is_new
            && let (Some(browser), Some(profile)) =
                (&system_browser, document.workspace.profiles().first())
        {
            config.profiles.insert(
                profile.id,
                ProfileBinding {
                    browser: browser.clone(),
                    browser_profile: None,
                    new_window: false,
                },
            );
            config_changed = true;
        }
        for binding in &migrated {
            let installed = find_installed(&browsers, &binding.browser);
            // Migrated profiles are named after the browser id; use its name.
            let named_after_id = document
                .workspace
                .profile(binding.profile)
                .is_some_and(|profile| profile.name == binding.browser.as_str());
            if let Some(info) = installed
                && named_after_id
            {
                document
                    .workspace
                    .rename_profile(binding.profile, &info.name)?;
            }
            config.profiles.insert(
                binding.profile,
                ProfileBinding {
                    browser: installed
                        .map_or_else(|| binding.browser.clone(), |info| info.id.clone()),
                    browser_profile: None,
                    new_window: false,
                },
            );
            config_changed = true;
        }

        if is_new || !migrated.is_empty() {
            store.save(&document)?;
        }
        if config_changed {
            save_config(&config_path, &config).map_err(AppError::Config)?;
        }
        Ok(Self {
            system,
            store,
            config_path,
            config,
            document,
            browsers,
            browser_profiles,
            system_browser,
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
        let profiles = self
            .document
            .workspace
            .profiles()
            .iter()
            .map(|profile| {
                let resolved = self.resolve(profile.id);
                ProfileView {
                    profile: profile.id,
                    binding: resolved.binding.cloned(),
                    browser: resolved.browser.map(|browser| browser.id.clone()),
                    is_bound: resolved.binding.is_some(),
                    is_fallback: resolved.is_fallback,
                    can_focus_tabs: resolved
                        .browser
                        .is_some_and(|browser| can_focus_tabs(browser.kind, self.platform)),
                }
            })
            .collect();
        Snapshot {
            workspace: self.document.workspace.clone(),
            settings: self.document.settings.clone(),
            browsers: self.browsers.clone(),
            browser_profiles: self.browser_profiles.clone(),
            system_browser: self.system_browser.clone(),
            data_path: self.store.path().display().to_string(),
            data_location: DataLocation {
                kind: classify_location(self.store.path(), self.config.data_path.is_none()),
                folder: self
                    .store
                    .path()
                    .parent()
                    .map(|folder| folder.display().to_string())
                    .unwrap_or_default(),
            },
            profiles,
        }
    }

    /// Applies a change and saves it. Nothing changes when it fails.
    ///
    /// # Errors
    ///
    /// When the change is invalid or a file cannot be saved, including
    /// [`StoreError::Conflict`] when another device changed the data file.
    pub fn apply(&mut self, command: Command) -> Result<Snapshot> {
        if let Command::BindProfile {
            profile,
            browser,
            browser_profile,
            new_window,
        } = command
        {
            self.bind(profile, &browser, browser_profile, new_window)?;
            return Ok(self.snapshot());
        }
        let removed_profile = match &command {
            Command::RemoveProfile { profile, .. } => Some(*profile),
            _ => None,
        };
        let mut next = self.document.clone();
        self.execute(&mut next, command)?;
        self.store.save(&next)?;
        self.document = next;
        if let Some(profile) = removed_profile
            && self.config.profiles.remove(&profile).is_some()
        {
            self.save_config()?;
        }
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

    /// Moves the data file to `path`, for example into a synced folder, and
    /// remembers it in this machine's config. When a Tabstage file is
    /// already there, `mode` decides whether to load it or overwrite it.
    /// The old file is left untouched.
    ///
    /// # Errors
    ///
    /// When the file at `path` or the config cannot be read or written.
    pub fn relocate(&mut self, path: PathBuf, mode: Relocate) -> Result<Snapshot> {
        let mut store = FileStore::new(path.clone());
        match (store.load()?, mode) {
            (Some(existing), Relocate::UseExisting) => self.document = existing,
            _ => store.force_save(&self.document)?,
        }
        self.store = store;
        self.config.data_path = Some(path);
        self.save_config()?;
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

    /// Lists the installed browsers and their profiles again.
    ///
    /// # Errors
    ///
    /// When browsers cannot be listed.
    pub fn refresh_browsers(&mut self) -> Result<Snapshot> {
        self.browsers = self.system.installed()?;
        self.browser_profiles = profiles_of(&self.system, &self.browsers);
        Ok(self.snapshot())
    }

    /// Opens a tab with its group's profile, focusing it if already open.
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
        let resolved = self.resolve(found.group.profile);
        let browser = resolved.browser.ok_or(AppError::NoBrowser)?;
        Ok(open_tab(
            browser,
            &found.tab.url,
            &resolved.options(false),
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

    /// Opens tabs one after another. Only the first can ask for a new window,
    /// so the rest join it.
    fn open_all<'a>(
        &self,
        group: &Group,
        tabs: impl Iterator<Item = &'a Tab>,
    ) -> Result<OpenSummary> {
        let resolved = self.resolve(group.profile);
        let browser = resolved.browser.ok_or(AppError::NoBrowser)?;
        let mut summary = OpenSummary::default();
        for (index, tab) in tabs.enumerate() {
            let options = resolved.options(index == 0);
            match open_tab(
                browser,
                &tab.url,
                &options,
                self.platform,
                &self.system,
                &self.system,
            )? {
                Opened::OpenedNew => summary.opened += 1,
                Opened::FocusedExisting => summary.focused += 1,
            }
        }
        Ok(summary)
    }

    /// The browser a profile opens in here: its bound browser when installed,
    /// otherwise the system browser.
    fn resolve(&self, profile: ProfileId) -> Resolution<'_> {
        let system = self
            .system_browser
            .as_ref()
            .and_then(|id| find_installed(&self.browsers, id));
        let binding = self.config.profiles.get(&profile);
        match binding.map(|binding| find_installed(&self.browsers, &binding.browser)) {
            Some(Some(browser)) => Resolution {
                browser: Some(browser),
                binding,
                is_fallback: false,
            },
            Some(None) => Resolution {
                browser: system,
                binding,
                is_fallback: true,
            },
            None => Resolution {
                browser: system,
                binding: None,
                is_fallback: false,
            },
        }
    }

    fn bind(
        &mut self,
        profile: ProfileId,
        browser: &BrowserId,
        browser_profile: Option<String>,
        new_window: bool,
    ) -> Result<()> {
        if self.document.workspace.profile(profile).is_none() {
            return Err(WorkspaceError::ProfileNotFound(profile).into());
        }
        let browser = find_installed(&self.browsers, browser)
            .map(|info| info.id.clone())
            .ok_or_else(|| AppError::UnknownBrowser(browser.clone()))?;
        if let Some(wanted) = &browser_profile {
            let known = self
                .browser_profiles
                .get(&browser)
                .is_some_and(|profiles| profiles.iter().any(|p| &p.id == wanted));
            if !known {
                return Err(AppError::UnknownBrowserProfile(wanted.clone()));
            }
        }
        let previous = self.config.profiles.insert(
            profile,
            ProfileBinding {
                browser,
                browser_profile,
                new_window,
            },
        );
        if let Err(error) = self.save_config() {
            match previous {
                Some(previous) => self.config.profiles.insert(profile, previous),
                None => self.config.profiles.remove(&profile),
            };
            return Err(error);
        }
        Ok(())
    }

    fn save_config(&self) -> Result<()> {
        save_config(&self.config_path, &self.config).map_err(AppError::Config)
    }

    fn execute(&self, document: &mut Document, command: Command) -> Result<()> {
        let workspace = &mut document.workspace;
        match command {
            Command::AddGroup {
                profile,
                name,
                color,
            } => workspace.add_group(profile, &name, color).map(drop)?,
            Command::RenameGroup { group, name } => workspace.rename_group(group, &name)?,
            Command::SetGroupProfile { group, profile } => {
                workspace.set_group_profile(group, profile)?;
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
            Command::AddProfile { name } => workspace.add_profile(&name).map(drop)?,
            Command::RenameProfile { profile, name } => workspace.rename_profile(profile, &name)?,
            Command::SetProfileColor { profile, color } => {
                workspace.set_profile_color(profile, color)?;
            }
            Command::MoveProfile { profile, index } => workspace.move_profile(profile, index)?,
            Command::RemoveProfile {
                profile,
                move_groups_to,
            } => workspace
                .remove_profile(profile, move_groups_to)
                .map(drop)?,
            // Machine-local: handled in `apply` without touching the document.
            Command::BindProfile { .. } => {}
        }
        Ok(())
    }
}

/// Profiles of every installed browser that has some.
fn profiles_of(
    system: &impl Catalog,
    browsers: &[BrowserInfo],
) -> BTreeMap<BrowserId, Vec<BrowserProfile>> {
    browsers
        .iter()
        .filter_map(|browser| match system.profiles(browser) {
            Ok(profiles) if !profiles.is_empty() => Some((browser.id.clone(), profiles)),
            Ok(_) => None,
            Err(error) => {
                tracing::warn!(
                    browser = %browser.id,
                    error = &error as &dyn std::error::Error,
                    "could not list browser profiles"
                );
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests;
