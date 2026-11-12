//! Application service for Tabstage Desktop.
//!
//! [`AppService`] owns the document and this machine's config, saves every
//! change and opens tabs with the right profile. It does not know about
//! Tauri: the shell forwards IPC calls to it, and tests drive it with a fake
//! [`System`].
//!
//! A Tabstage profile holds groups, folders and tabs, all in the data file.
//! Which browser a profile opens in lives in this machine's
//! [`config::AppConfig`].

pub mod config;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tabstage_browsers::{
    BrowserError, BrowserInfo, Catalog, Launcher, Opened, Platform, TabFocuser, can_focus_tabs,
    find_installed, open_tab,
};
use tabstage_core::{
    BrowserId, Container, ContainerColor, FolderId, GroupId, Icon, Item, Node, Place, ProfileColor,
    ProfileId, TICKET_PLACEHOLDER, Tab, TabId, TabUrl, TabUrlError, Target, Workspace,
    WorkspaceError,
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
        /// Profile that gets the group.
        profile: ProfileId,
        /// Group name.
        name: String,
    },
    /// Rename a group.
    RenameGroup {
        /// Group to rename.
        group: GroupId,
        /// New name.
        name: String,
    },
    /// Move a group, within its profile or to another one.
    MoveGroup {
        /// Group to move.
        group: GroupId,
        /// Destination profile.
        profile: ProfileId,
        /// Position among the profile's items.
        index: usize,
    },
    /// Remove a group and everything in it.
    RemoveGroup {
        /// Group to remove.
        group: GroupId,
    },
    /// Add a folder at the end of a profile or group.
    AddFolder {
        /// Profile or group that gets the folder.
        place: Place,
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
    /// Move a folder into a profile or group.
    MoveFolder {
        /// Folder to move.
        folder: FolderId,
        /// Destination profile or group.
        place: Place,
        /// Position in the destination.
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
    /// Change a tab's URL.
    SetTabUrl {
        /// Tab to change.
        tab: TabId,
        /// URL as typed by the user.
        url: String,
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
    /// Set or clear the custom icon of a group, folder or tab.
    SetIcon {
        /// What gets the icon.
        target: Target,
        /// The icon, or `None` for the default one.
        icon: Option<Icon>,
    },
    /// Set or clear the own color of a group or folder.
    SetColor {
        /// What gets the color.
        target: Container,
        /// One of the profile colors, `"parent"` or `"none"`.
        color: ContainerColor,
    },
    /// Pin a group, folder or tab to the top of the sidebar.
    Pin {
        /// What to pin.
        target: Target,
    },
    /// Remove an item from the pinned section.
    Unpin {
        /// What to unpin.
        target: Target,
    },
    /// Reorder the pinned section.
    MovePinned {
        /// Pinned item to move.
        target: Target,
        /// New position.
        index: usize,
    },
    /// Set the ticket id and note of a group, folder or tab.
    SetDetails {
        /// What gets the details.
        target: Target,
        /// Ticket key such as `PROJ-123`; blank clears it.
        ticket_id: String,
        /// Free-form note; blank clears it.
        note: String,
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
    /// Set or clear the address a profile's ticket ids link to.
    SetTicketUrl {
        /// Profile to configure.
        profile: ProfileId,
        /// Address with a `{ticket}` placeholder; blank clears it.
        url: String,
    },
    /// Move a profile in the sidebar.
    MoveProfile {
        /// Profile to move.
        profile: ProfileId,
        /// New position.
        index: usize,
    },
    /// Remove a profile, moving its items to another one.
    RemoveProfile {
        /// Profile to remove.
        profile: ProfileId,
        /// Profile that takes its groups, folders and tabs.
        move_items_to: ProfileId,
    },
    /// Choose, on this machine, the browser a profile opens in.
    BindProfile {
        /// Profile to configure.
        profile: ProfileId,
        /// An installed browser, or `None` for the system browser.
        browser: Option<BrowserId>,
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
    /// Browser that will open the profile's tabs here.
    pub browser: Option<BrowserId>,
    /// The profile has a browser chosen on this machine.
    pub is_bound: bool,
    /// The chosen browser is not installed here, so the system one is used.
    pub is_fallback: bool,
    /// Open tabs can be focused instead of opened again.
    pub can_focus_tabs: bool,
}

/// Kind of place the data file lives in, as the UI describes it. Cloud
/// folders are refused for new locations; an older config may still point
/// at one.
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

impl DataLocationKind {
    /// A folder a cloud service syncs.
    #[must_use]
    pub const fn is_cloud(self) -> bool {
        matches!(
            self,
            Self::ICloudDrive | Self::Dropbox | Self::OneDrive | Self::GoogleDrive
        )
    }
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
    /// Profiles with their groups, folders and tabs.
    pub workspace: Workspace,
    /// Synced settings.
    pub settings: Settings,
    /// Browsers installed on this machine.
    pub browsers: Vec<BrowserInfo>,
    /// Browser used for profiles that are not configured here.
    pub system_browser: Option<BrowserId>,
    /// Path of the data file on this machine.
    pub data_path: String,
    /// Where the data file is, in words the UI can show.
    pub data_location: DataLocation,
    /// First run: no data file yet, so the UI asks where to keep it.
    pub needs_data_file: bool,
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
    /// Cloud folders are not allowed for the data file.
    #[error("the data file cannot go in a cloud folder ({0})")]
    CloudFolder(String),
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
                | WorkspaceError::ProfileNotFound(_),
            ) => "notFound",
            Self::Workspace(_) => "invalid",
            Self::Store(StoreError::Conflict) => "conflict",
            Self::Store(StoreError::Io { .. }) | Self::Config(_) => "io",
            Self::Store(_) => "badFile",
            Self::Browser(_) => "browser",
            Self::Url(_) => "invalidUrl",
            Self::UnknownBrowser(_) => "unknownBrowser",
            Self::CloudFolder(_) => "cloudFolder",
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
        (
            document.workspace.groups().count(),
            document.workspace.tabs().len(),
        )
    });
    Ok(DataFileInfo {
        path: path.display().to_string(),
        exists: path.exists(),
        groups,
        tabs,
    })
}

/// The browser a profile opens in here.
struct Resolution<'a> {
    browser: Option<&'a BrowserInfo>,
    binding: Option<&'a ProfileBinding>,
    is_fallback: bool,
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
    system_browser: Option<BrowserId>,
    platform: Platform,
}

impl<S: System> AppService<S> {
    /// Loads the data file (or starts a new one), this machine's config and
    /// the installed browsers.
    ///
    /// On first run the only profile opens in the system browser, and nothing
    /// is written until the user picks where to keep the data file (see
    /// [`AppService::choose_data_file`]). A version 1 data file is upgraded:
    /// its browsers become this machine's bindings.
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
                },
            );
            config_changed = true;
        }

        // On first run the user picks the folder before anything is written.
        let first_run = is_new && config.data_path.is_none();
        if (is_new && !first_run) || !migrated.is_empty() {
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
            needs_data_file: self.config.data_path.is_none() && !self.store.path().exists(),
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
        if let Command::BindProfile { profile, browser } = command {
            self.bind(profile, browser.as_ref())?;
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

    /// First run: keeps the data file at `path`, or at the default location
    /// when `None`. A Tabstage file already at `path` is loaded.
    ///
    /// # Errors
    ///
    /// [`AppError::CloudFolder`] for a cloud folder, or when the file or the
    /// config cannot be read or written.
    pub fn choose_data_file(&mut self, path: Option<PathBuf>) -> Result<Snapshot> {
        match path {
            Some(path) => self.relocate(path, Relocate::UseExisting),
            None => {
                self.store.save(&self.document)?;
                Ok(self.snapshot())
            }
        }
    }

    /// Moves the data file to `path`, a local folder, and remembers it in
    /// this machine's config. When a Tabstage file is already there, `mode`
    /// decides whether to load it or overwrite it. The old file is left
    /// untouched.
    ///
    /// # Errors
    ///
    /// [`AppError::CloudFolder`] for a cloud folder, or when the file at
    /// `path` or the config cannot be read or written.
    pub fn relocate(&mut self, path: PathBuf, mode: Relocate) -> Result<Snapshot> {
        if classify_location(&path, false).is_cloud() {
            return Err(AppError::CloudFolder(path.display().to_string()));
        }
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

    /// Lists the installed browsers again.
    ///
    /// # Errors
    ///
    /// When browsers cannot be listed.
    pub fn refresh_browsers(&mut self) -> Result<Snapshot> {
        self.browsers = self.system.installed()?;
        Ok(self.snapshot())
    }

    /// Opens a tab with its profile's browser, focusing it if already open.
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
        let browser = self
            .resolve(found.profile.id)
            .browser
            .ok_or(AppError::NoBrowser)?;
        Ok(open_tab(
            browser,
            &found.tab.url,
            self.platform,
            &self.system,
            &self.system,
        )?)
    }

    /// Opens the ticket of a group, folder or tab with its profile's ticket
    /// URL, in the profile's browser.
    ///
    /// # Errors
    ///
    /// When the item is unknown, has no ticket, its profile has no ticket
    /// URL, no browser is installed or opening fails.
    pub fn open_ticket(&self, target: Target) -> Result<Opened> {
        let workspace = &self.document.workspace;
        let profile = workspace.target_profile(target).ok_or(match target {
            Target::Group(id) => WorkspaceError::GroupNotFound(id),
            Target::Folder(id) => WorkspaceError::FolderNotFound(id),
            Target::Tab(id) => WorkspaceError::TabNotFound(id),
        })?;
        let (Some(template), Some(ticket)) =
            (profile.ticket_url.as_deref(), workspace.ticket_id(target))
        else {
            return Err(WorkspaceError::InvalidTicketUrl.into());
        };
        self.open_url(profile.id, &ticket_link(template, ticket))
    }

    /// Opens an address, such as a link in a note, in a profile's browser.
    ///
    /// # Errors
    ///
    /// When the profile is unknown, the address is not a web address, no
    /// browser is installed or opening fails.
    pub fn open_url(&self, profile: ProfileId, url: &str) -> Result<Opened> {
        if self.document.workspace.profile(profile).is_none() {
            return Err(WorkspaceError::ProfileNotFound(profile).into());
        }
        let url = TabUrl::parse(url)?;
        let browser = self.resolve(profile).browser.ok_or(AppError::NoBrowser)?;
        Ok(open_tab(
            browser,
            &url,
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
        let found = self
            .document
            .workspace
            .find_folder(folder)
            .ok_or(WorkspaceError::FolderNotFound(folder))?;
        self.open_all(found.profile.id, found.folder.tabs.iter())
    }

    /// Opens every tab of a group, folders included, in order.
    ///
    /// # Errors
    ///
    /// When the group is unknown, no browser is installed or opening fails.
    pub fn open_group(&self, group: GroupId) -> Result<OpenSummary> {
        let workspace = &self.document.workspace;
        let (Some(found), Some(profile)) = (workspace.group(group), workspace.group_profile(group))
        else {
            return Err(WorkspaceError::GroupNotFound(group).into());
        };
        let tabs = found.children.iter().flat_map(|node| match node {
            Node::Tab(tab) => std::slice::from_ref(tab).iter(),
            Node::Folder(folder) => folder.tabs.iter(),
        });
        self.open_all(profile.id, tabs)
    }

    /// Opens every tab of a profile, groups and folders included, in order.
    ///
    /// # Errors
    ///
    /// When the profile is unknown, no browser is installed or opening fails.
    pub fn open_profile(&self, profile: ProfileId) -> Result<OpenSummary> {
        let found = self
            .document
            .workspace
            .profile(profile)
            .ok_or(WorkspaceError::ProfileNotFound(profile))?;
        let tabs = found.items.iter().flat_map(|item| -> Vec<&Tab> {
            match item {
                Item::Tab(tab) => vec![tab],
                Item::Folder(folder) => folder.tabs.iter().collect(),
                Item::Group(group) => group
                    .children
                    .iter()
                    .flat_map(|node| match node {
                        Node::Tab(tab) => std::slice::from_ref(tab).iter(),
                        Node::Folder(folder) => folder.tabs.iter(),
                    })
                    .collect(),
            }
        });
        self.open_all(profile, tabs)
    }

    /// Opens tabs one after another in the profile's browser.
    fn open_all<'a>(
        &self,
        profile: ProfileId,
        tabs: impl Iterator<Item = &'a Tab>,
    ) -> Result<OpenSummary> {
        let browser = self.resolve(profile).browser.ok_or(AppError::NoBrowser)?;
        let mut summary = OpenSummary::default();
        for tab in tabs {
            match open_tab(browser, &tab.url, self.platform, &self.system, &self.system)? {
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

    fn bind(&mut self, profile: ProfileId, browser: Option<&BrowserId>) -> Result<()> {
        if self.document.workspace.profile(profile).is_none() {
            return Err(WorkspaceError::ProfileNotFound(profile).into());
        }
        let binding = browser
            .map(|browser| {
                find_installed(&self.browsers, browser)
                    .map(|info| ProfileBinding {
                        browser: info.id.clone(),
                    })
                    .ok_or_else(|| AppError::UnknownBrowser(browser.clone()))
            })
            .transpose()?;
        let previous = match binding {
            Some(binding) => self.config.profiles.insert(profile, binding),
            None => self.config.profiles.remove(&profile),
        };
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
            Command::AddGroup { profile, name } => workspace.add_group(profile, &name).map(drop)?,
            Command::RenameGroup { group, name } => workspace.rename_group(group, &name)?,
            Command::MoveGroup {
                group,
                profile,
                index,
            } => workspace.move_group(group, profile, index)?,
            Command::RemoveGroup { group } => workspace.remove_group(group).map(drop)?,
            Command::AddFolder { place, name } => workspace.add_folder(place, &name).map(drop)?,
            Command::RenameFolder { folder, name } => workspace.rename_folder(folder, &name)?,
            Command::SetFolderCollapsed { folder, collapsed } => {
                workspace.set_folder_collapsed(folder, collapsed)?;
            }
            Command::MoveFolder {
                folder,
                place,
                index,
            } => workspace.move_folder(folder, place, index)?,
            Command::RemoveFolder { folder } => workspace.remove_folder(folder).map(drop)?,
            Command::AddTab { place, url, title } => {
                let url = TabUrl::parse(&url)?;
                workspace.add_tab(place, url, &title).map(drop)?;
            }
            Command::RenameTab { tab, title } => workspace.rename_tab(tab, &title)?,
            Command::SetTabUrl { tab, url } => {
                let url = TabUrl::parse(&url)?;
                workspace.set_tab_url(tab, url)?;
            }
            Command::RemoveTab { tab } => workspace.remove_tab(tab).map(drop)?,
            Command::MoveTab { tab, place, index } => workspace.move_tab(tab, place, index)?,
            Command::SetIcon { target, icon } => workspace.set_icon(target, icon)?,
            Command::SetColor { target, color } => workspace.set_color(target, color)?,
            Command::Pin { target } => workspace.pin(target)?,
            Command::Unpin { target } => workspace.unpin(target),
            Command::MovePinned { target, index } => workspace.move_pinned(target, index)?,
            Command::SetDetails {
                target,
                ticket_id,
                note,
            } => workspace.set_details(target, &ticket_id, &note)?,
            Command::AddProfile { name } => workspace.add_profile(&name).map(drop)?,
            Command::RenameProfile { profile, name } => workspace.rename_profile(profile, &name)?,
            Command::SetProfileColor { profile, color } => {
                workspace.set_profile_color(profile, color)?;
            }
            Command::SetTicketUrl { profile, url } => workspace.set_ticket_url(profile, &url)?,
            Command::MoveProfile { profile, index } => workspace.move_profile(profile, index)?,
            Command::RemoveProfile {
                profile,
                move_items_to,
            } => workspace.remove_profile(profile, move_items_to).map(drop)?,
            // Machine-local: handled in `apply` without touching the document.
            Command::BindProfile { .. } => {}
        }
        Ok(())
    }
}

/// A profile's ticket URL with the ticket id in place of `{ticket}`,
/// percent-encoded so an id cannot change the rest of the address.
#[must_use]
pub fn ticket_link(template: &str, ticket: &str) -> String {
    let mut encoded = String::new();
    for byte in ticket.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    template.replace(TICKET_PLACEHOLDER, &encoded)
}

#[cfg(test)]
mod tests;
