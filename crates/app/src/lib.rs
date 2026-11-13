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
use std::collections::HashMap;
use tabstage_browsers::{
    BrowserError, BrowserInfo, Catalog, Launcher, Opened, Platform, TabFocuser, can_focus_tabs,
    find_installed, open_tab,
};

use tabstage_core::{
    BrowserId, Icon, NoteId, ProfileColor, ProfileId, StatusId, TabUrl, TabUrlError, Target,
    TextOwner, TicketId, TicketKind, TicketPlace, Workspace, WorkspaceError,
};
use tabstage_store::{
    Document, FileStore, ImportSummary, LegacyTree, Role, Settings, StoreError, import_legacy,
    read_legacy,
};
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
    /// Add a ticket at the end of a profile, or under a ticket.
    AddTicket {
        /// Its id, when the UI picks it to show the ticket right away.
        #[serde(default)]
        id: Option<TicketId>,
        /// Where it goes.
        place: TicketPlace,
        /// Its title.
        title: String,
        /// Its key, if any.
        #[serde(default)]
        key: Option<String>,
        /// Its status, if any.
        status: Option<StatusId>,
        /// What kind of work it is; a plain ticket when absent.
        #[serde(default)]
        kind: Option<TicketKind>,
    },
    /// Set what kind of work a ticket is.
    SetTicketKind {
        /// The ticket.
        ticket: TicketId,
        /// Its kind.
        kind: TicketKind,
    },
    /// Set a ticket's key, such as `PROJ-123`; blank clears it.
    SetTicketKey {
        /// The ticket.
        ticket: TicketId,
        /// Its key.
        key: String,
    },
    /// Set or clear a ticket's own address.
    SetTicketUrl {
        /// The ticket.
        ticket: TicketId,
        /// Its address; blank clears it.
        url: String,
    },
    /// Set or clear a ticket's status.
    SetTicketStatus {
        /// The ticket.
        ticket: TicketId,
        /// Its status, or `None` for none.
        status: Option<StatusId>,
    },
    /// Move a ticket within or across profiles, or under a ticket.
    MoveTicket {
        /// The ticket.
        ticket: TicketId,
        /// Where it goes.
        place: TicketPlace,
        /// Position there.
        index: usize,
        /// Also sets its status, when it is dropped in another lane.
        #[serde(default)]
        lane: Option<Lane>,
    },
    /// Remove a ticket with its sub-tickets.
    RemoveTicket {
        /// The ticket.
        ticket: TicketId,
    },
    /// Add a note at the end of a profile's notes.
    AddNote {
        /// Its id, when the UI picks it to show the note right away.
        #[serde(default)]
        id: Option<NoteId>,
        /// The profile.
        profile: ProfileId,
        /// Its title.
        title: String,
    },
    /// Move a note.
    MoveNote {
        /// The note.
        note: NoteId,
        /// Profile it goes to.
        profile: ProfileId,
        /// Position there.
        index: usize,
    },
    /// Remove a note.
    RemoveNote {
        /// The note.
        note: NoteId,
    },
    /// Set the Markdown text of a ticket (its note) or a note (its body).
    SetText {
        /// The ticket or note.
        owner: TextOwner,
        /// The text; blank clears it.
        text: String,
    },
    /// Rename a ticket or note.
    Rename {
        /// What to rename.
        target: Target,
        /// The new name.
        name: String,
    },
    /// Set or clear the custom icon of a ticket or note.
    SetIcon {
        /// What gets the icon.
        target: Target,
        /// The icon, or `None` for the default one.
        icon: Option<Icon>,
    },
    /// Pin an item to the top of the sidebar.
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
    /// Add a status at the end of the workflow.
    AddStatus {
        /// Its name.
        name: String,
        /// Its color.
        color: ProfileColor,
    },
    /// Rename a status.
    RenameStatus {
        /// The status.
        status: StatusId,
        /// The new name.
        name: String,
    },
    /// Change a status's color.
    SetStatusColor {
        /// The status.
        status: StatusId,
        /// Its new color.
        color: ProfileColor,
    },
    /// Move a status in the workflow.
    MoveStatus {
        /// The status.
        status: StatusId,
        /// New position.
        index: usize,
    },
    /// Remove a status; its tickets are left without one.
    RemoveStatus {
        /// The status.
        status: StatusId,
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
    /// Remove a profile, moving its tickets and notes to another one.
    RemoveProfile {
        /// Profile to remove.
        profile: ProfileId,
        /// Profile that takes its tickets and notes.
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

/// The status lane a ticket is dropped in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct Lane {
    /// The lane's status, or `None` for "No status".
    pub status: Option<StatusId>,
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
    /// Statuses, and profiles with their tickets and notes.
    pub workspace: Workspace,
    /// A data file from before tickets that was set aside and not imported
    /// yet, so the UI offers to import it.
    pub legacy_backup: Option<String>,
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

/// What importing a file from before tickets would give.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    /// The file read.
    pub path: String,
    /// Its groups, folders and tabs.
    pub tree: LegacyTree,
    /// The role each one gets, and what would be created.
    pub summary: ImportSummary,
    /// The statuses, tickets and notes it would create.
    pub preview: Workspace,
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
    /// There is no file from before tickets to import.
    #[error("there is no previous data file to import")]
    NoLegacyFile,
}

impl AppError {
    /// Stable code the UI switches on.
    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::Workspace(
                WorkspaceError::TicketNotFound(_)
                | WorkspaceError::NoteNotFound(_)
                | WorkspaceError::StatusNotFound(_)
                | WorkspaceError::ProfileNotFound(_),
            ) => "notFound",
            Self::Workspace(_) => "invalid",
            Self::Store(StoreError::Conflict) => "conflict",
            Self::Store(StoreError::Legacy(_)) => "legacyFile",
            Self::Store(StoreError::Io { .. }) | Self::Config(_) => "io",
            Self::Store(_) => "badFile",
            Self::Browser(_) => "browser",
            Self::Url(_) => "invalidUrl",
            Self::UnknownBrowser(_) => "unknownBrowser",
            Self::CloudFolder(_) => "cloudFolder",
            Self::NoBrowser => "noBrowser",
            Self::NoLegacyFile => "notFound",
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
    /// Number of tickets in it, sub-tickets included.
    pub tickets: usize,
    /// Number of notes in it.
    pub notes: usize,
}

/// Looks at the data file at `path` without changing anything.
///
/// # Errors
///
/// When the file exists but cannot be read or is not a valid data file.
pub fn inspect_data_file(path: &Path) -> Result<DataFileInfo> {
    let document = FileStore::new(path).load()?;
    let (tickets, notes) = document.map_or((0, 0), |document| {
        document
            .workspace
            .profiles()
            .iter()
            .fold((0, 0), |(tickets, notes), profile| {
                let in_profile: usize = profile
                    .tickets
                    .iter()
                    .map(|ticket| 1 + ticket.children.len())
                    .sum();
                (tickets + in_profile, notes + profile.notes.len())
            })
    });
    Ok(DataFileInfo {
        path: path.display().to_string(),
        exists: path.exists(),
        tickets,
        notes,
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
    /// [`AppService::choose_data_file`]). A data file from before tickets is
    /// renamed to `workspace.v{n}-backup.json` next to it and a new, empty
    /// one takes its place; the UI then offers to import the old one.
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

        let loaded = match store.load() {
            Err(StoreError::Legacy(version)) => {
                // A file from before tickets: set it aside, start empty and
                // offer to import it.
                let backup = set_aside(store.path(), version)?;
                config.legacy_backup = Some(backup);
                save_config(&config_path, &config).map_err(AppError::Config)?;
                store.load()?
            }
            other => other?,
        };
        let had_file = loaded.is_some() || config.legacy_backup.is_some();
        let is_new = loaded.is_none();
        let document = loaded.unwrap_or_default();
        let mut config_changed = false;

        if is_new
            && !had_file
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

        // On first run the user picks the folder before anything is written.
        // A file set aside counts as a choice: the new one goes in its place.
        let first_run = is_new && config.data_path.is_none() && config.legacy_backup.is_none();
        if is_new && !first_run {
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
            legacy_backup: self
                .config
                .legacy_backup
                .as_ref()
                .filter(|path| path.exists())
                .map(|path| path.display().to_string()),
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

    /// Opens a ticket's own address in its profile's browser.
    ///
    /// # Errors
    ///
    /// When the ticket is unknown or has no address, no browser is installed
    /// or opening fails.
    pub fn open_ticket(&self, ticket: TicketId) -> Result<Opened> {
        let workspace = &self.document.workspace;
        let url = workspace.ticket_address(ticket)?;
        let profile = workspace
            .ticket(ticket)
            .ok_or(WorkspaceError::TicketNotFound(ticket))?
            .profile
            .id;
        self.open_in(profile, url)
    }

    /// Opens a ticket's address and its sub-tickets' addresses, in order.
    ///
    /// # Errors
    ///
    /// When the ticket is unknown, no browser is installed or opening fails.
    pub fn open_ticket_all(&self, ticket: TicketId) -> Result<OpenSummary> {
        let found = self
            .document
            .workspace
            .ticket(ticket)
            .ok_or(WorkspaceError::TicketNotFound(ticket))?;
        let mut urls = Vec::new();
        for item in std::iter::once(found.ticket).chain(&found.ticket.children) {
            urls.extend(item.url.iter());
        }
        self.open_all(found.profile.id, urls.into_iter())
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
        self.open_in(profile, &TabUrl::parse(url)?)
    }

    fn open_in(&self, profile: ProfileId, url: &TabUrl) -> Result<Opened> {
        let browser = self.resolve(profile).browser.ok_or(AppError::NoBrowser)?;
        Ok(open_tab(
            browser,
            url,
            self.platform,
            &self.system,
            &self.system,
        )?)
    }

    // ---- importing a file from before tickets ------------------------------

    /// Reads a file from before tickets (the one set aside at startup when
    /// `path` is `None`) and shows what importing it would give, with
    /// `chosen` roles by old id and suggestions for the rest.
    ///
    /// # Errors
    ///
    /// When there is no such file or it cannot be read.
    pub fn preview_import(
        &self,
        path: Option<PathBuf>,
        chosen: &HashMap<String, Role>,
    ) -> Result<ImportPreview> {
        let (path, tree) = self.read_legacy_file(path)?;
        let mut preview = Workspace::from_parts(Vec::new(), Vec::new());
        let summary = import_legacy(&mut preview, &tree, chosen)?;
        Ok(ImportPreview {
            path: path.display().to_string(),
            tree,
            summary,
            preview,
        })
    }

    /// Imports a file from before tickets into the workspace, adding to what
    /// is there, and stops offering to import the file set aside.
    ///
    /// # Errors
    ///
    /// When the file cannot be read, the result is invalid or saving fails.
    pub fn import(
        &mut self,
        path: Option<PathBuf>,
        chosen: &HashMap<String, Role>,
    ) -> Result<Snapshot> {
        let (path, tree) = self.read_legacy_file(path)?;
        let mut next = self.document.clone();
        import_legacy(&mut next.workspace, &tree, chosen)?;
        self.store.save(&next)?;
        self.document = next;
        let mut config_changed = false;
        for binding in &tree.bindings {
            if !self.config.profiles.contains_key(&binding.profile) {
                let browser = find_installed(&self.browsers, &binding.browser)
                    .map_or_else(|| binding.browser.clone(), |info| info.id.clone());
                self.config
                    .profiles
                    .insert(binding.profile, ProfileBinding { browser });
                config_changed = true;
            }
        }
        if self.config.legacy_backup.as_deref() == Some(path.as_path()) {
            self.config.legacy_backup = None;
            config_changed = true;
        }
        if config_changed {
            self.save_config()?;
        }
        Ok(self.snapshot())
    }

    /// Stops offering to import the file set aside; the file stays on disk.
    ///
    /// # Errors
    ///
    /// When the config cannot be saved.
    pub fn dismiss_import(&mut self) -> Result<Snapshot> {
        if self.config.legacy_backup.take().is_some() {
            self.save_config()?;
        }
        Ok(self.snapshot())
    }

    fn read_legacy_file(&self, path: Option<PathBuf>) -> Result<(PathBuf, LegacyTree)> {
        let path = path
            .or_else(|| self.config.legacy_backup.clone())
            .ok_or(AppError::NoLegacyFile)?;
        let text = std::fs::read_to_string(&path).map_err(|source| StoreError::Io {
            path: path.clone(),
            source,
        })?;
        Ok((path, read_legacy(&text)?))
    }

    /// Opens tabs one after another in the profile's browser.
    fn open_all<'a>(
        &self,
        profile: ProfileId,
        urls: impl Iterator<Item = &'a TabUrl>,
    ) -> Result<OpenSummary> {
        let browser = self.resolve(profile).browser.ok_or(AppError::NoBrowser)?;
        let mut summary = OpenSummary::default();
        for url in urls {
            match open_tab(browser, url, self.platform, &self.system, &self.system)? {
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
            Command::AddTicket {
                id,
                place,
                title,
                key,
                status,
                kind,
            } => {
                let id = workspace.add_ticket_as(id.unwrap_or_default(), place, &title, status)?;
                if let Some(key) = key {
                    workspace.set_ticket_key(id, &key)?;
                }
                if let Some(kind) = kind {
                    workspace.set_ticket_kind(id, kind)?;
                }
            }
            Command::SetTicketKind { ticket, kind } => workspace.set_ticket_kind(ticket, kind)?,
            Command::SetTicketKey { ticket, key } => workspace.set_ticket_key(ticket, &key)?,
            Command::SetTicketUrl { ticket, url } => {
                let url = if url.trim().is_empty() {
                    None
                } else {
                    Some(TabUrl::parse(&url)?)
                };
                workspace.set_ticket_address(ticket, url)?;
            }
            Command::SetTicketStatus { ticket, status } => {
                workspace.set_ticket_status(ticket, status)?;
            }
            Command::MoveTicket {
                ticket,
                place,
                index,
                lane,
            } => {
                workspace.move_ticket(ticket, place, index)?;
                if let Some(lane) = lane {
                    workspace.set_ticket_status(ticket, lane.status)?;
                }
            }
            Command::RemoveTicket { ticket } => workspace.remove_ticket(ticket).map(drop)?,
            Command::AddNote { id, profile, title } => {
                workspace
                    .add_note_as(id.unwrap_or_default(), profile, &title)
                    .map(drop)?;
            }
            Command::MoveNote {
                note,
                profile,
                index,
            } => workspace.move_note(note, profile, index)?,
            Command::RemoveNote { note } => workspace.remove_note(note).map(drop)?,
            Command::SetText { owner, text } => workspace.set_text(owner, &text)?,
            Command::Rename { target, name } => workspace.rename(target, &name)?,
            Command::SetIcon { target, icon } => workspace.set_icon(target, icon)?,
            Command::Pin { target } => workspace.pin(target)?,
            Command::Unpin { target } => workspace.unpin(target),
            Command::MovePinned { target, index } => workspace.move_pinned(target, index)?,
            Command::AddStatus { name, color } => workspace.add_status(&name, color).map(drop)?,
            Command::RenameStatus { status, name } => workspace.rename_status(status, &name)?,
            Command::SetStatusColor { status, color } => {
                workspace.set_status_color(status, color)?;
            }
            Command::MoveStatus { status, index } => workspace.move_status(status, index)?,
            Command::RemoveStatus { status } => workspace.remove_status(status).map(drop)?,
            Command::AddProfile { name } => workspace.add_profile(&name).map(drop)?,
            Command::RenameProfile { profile, name } => workspace.rename_profile(profile, &name)?,
            Command::SetProfileColor { profile, color } => {
                workspace.set_profile_color(profile, color)?;
            }
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

/// Renames a data file from before tickets to `workspace.v{version}-backup.json`
/// next to it (with a number when that name is taken) and returns the new path.
fn set_aside(path: &Path, version: u32) -> Result<PathBuf> {
    let folder = path.parent().unwrap_or_else(|| Path::new("."));
    let stem = path.file_stem().map_or_else(
        || "workspace".to_owned(),
        |stem| stem.to_string_lossy().into_owned(),
    );
    let mut backup = folder.join(format!("{stem}.v{version}-backup.json"));
    let mut copy = 2;
    while backup.exists() {
        backup = folder.join(format!("{stem}.v{version}-backup-{copy}.json"));
        copy += 1;
    }
    std::fs::rename(path, &backup).map_err(|source| StoreError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    Ok(backup)
}

#[cfg(test)]
mod tests;
