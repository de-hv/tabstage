//! Saves and loads the Tabstage Desktop workspace as one JSON file.
//!
//! The file lives in a local folder. Writes are atomic (temp file + rename),
//! and [`FileStore`] refuses to overwrite a file that something else changed
//! since it was last read, so no work is silently lost.

mod legacy;
mod migrate;

pub use legacy::{
    ImportSummary, LegacyItem, LegacyKind, LegacyProfile, LegacyTree, Role, import_legacy,
    read_legacy,
};
pub use migrate::MigratedBinding;

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tabstage_core::{Workspace, WorkspaceError};
use thiserror::Error;

/// Value of the `app` field that marks a Tabstage Desktop file.
pub const APP: &str = "tabstage-desktop";

/// Version of the file format this build writes.
pub const FORMAT_VERSION: u32 = 6;

/// First version with tickets. Older files are imported, not opened; newer
/// ones up to [`FORMAT_VERSION`] are upgraded when they are opened.
pub const TICKETS_VERSION: u32 = 5;

/// App-wide settings shared by every machine. Empty for now: browser
/// choices are machine-local since format 2.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {}

/// Everything saved in the data file.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Document {
    /// App settings.
    pub settings: Settings,
    /// Statuses, and profiles with their tickets and notes.
    pub workspace: Workspace,
}

/// Errors from reading or writing the data file.
#[derive(Debug, Error)]
pub enum StoreError {
    /// The file system refused a read or write.
    #[error("could not access {path}")]
    Io {
        /// File or folder involved.
        path: PathBuf,
        /// Underlying error.
        #[source]
        source: io::Error,
    },
    /// The file is not valid JSON or does not match the format.
    #[error("data file is not valid")]
    Parse(#[source] serde_json::Error),
    /// The JSON file was not written by Tabstage Desktop.
    #[error("file is not a Tabstage Desktop data file")]
    NotTabstage,
    /// The file was written by a newer version of the app.
    #[error("data file version {0} is newer than this app supports")]
    UnsupportedVersion(u32),
    /// The file is from before tickets (version 1 to 4): it is imported, not
    /// opened (see [`read_legacy`]).
    #[error("data file version {0} is from before tickets and needs to be imported")]
    Legacy(u32),
    /// The file breaks a workspace rule, such as an id used twice.
    #[error("data file has invalid content")]
    Invalid(#[from] WorkspaceError),
    /// The file changed on disk (for example from another device) since it
    /// was last loaded or saved here.
    #[error("data file changed on disk since it was last loaded")]
    Conflict,
}

/// Result type for store operations.
pub type Result<T> = std::result::Result<T, StoreError>;

/// Serializes a document to the pretty JSON written to disk.
#[must_use]
pub fn to_json(document: &Document) -> String {
    let file = FileRef {
        app: APP,
        version: FORMAT_VERSION,
        settings: &document.settings,
        workspace: &document.workspace,
    };
    let mut text = serde_json::to_string_pretty(&file)
        .expect("document serialization cannot fail: no maps with non-string keys");
    text.push('\n');
    text
}

/// Parses and validates a data file.
///
/// # Errors
///
/// [`StoreError::Parse`], [`StoreError::NotTabstage`],
/// [`StoreError::UnsupportedVersion`], [`StoreError::Legacy`] or
/// [`StoreError::Invalid`].
pub fn from_json(text: &str) -> Result<Document> {
    let header: Header = serde_json::from_str(text).map_err(StoreError::Parse)?;
    if header.app.as_deref() != Some(APP) {
        return Err(StoreError::NotTabstage);
    }
    if header.version > FORMAT_VERSION {
        return Err(StoreError::UnsupportedVersion(header.version));
    }
    if header.version < TICKETS_VERSION {
        return Err(StoreError::Legacy(header.version));
    }
    let file: FileOwned = if header.version < FORMAT_VERSION {
        let mut value: serde_json::Value = serde_json::from_str(text).map_err(StoreError::Parse)?;
        migrate::upgrade_v5(&mut value);
        serde_json::from_value(value).map_err(StoreError::Parse)?
    } else {
        serde_json::from_str(text).map_err(StoreError::Parse)?
    };
    file.workspace.validate()?;
    Ok(Document {
        settings: file.settings,
        workspace: file.workspace,
    })
}

/// The fields read first, to reject foreign or newer files before parsing
/// the rest.
#[derive(Deserialize)]
struct Header {
    app: Option<String>,
    #[serde(default)]
    version: u32,
}

#[derive(Serialize)]
struct FileRef<'a> {
    app: &'a str,
    version: u32,
    settings: &'a Settings,
    workspace: &'a Workspace,
}

#[derive(Deserialize)]
struct FileOwned {
    #[serde(default)]
    settings: Settings,
    workspace: Workspace,
}

/// What this store last saw on disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Seen {
    Missing,
    Content(u64),
}

/// The data file at one path.
#[derive(Debug)]
pub struct FileStore {
    path: PathBuf,
    last_seen: Option<Seen>,
}

impl FileStore {
    /// A store for the file at `path`. Nothing is read until [`Self::load`].
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            last_seen: None,
        }
    }

    /// Path of the data file.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Reads the file. Returns `None` when it does not exist yet.
    ///
    /// # Errors
    ///
    /// [`StoreError::Io`] or any error from [`from_json`].
    pub fn load(&mut self) -> Result<Option<Document>> {
        let Some(bytes) = self.read()? else {
            self.last_seen = Some(Seen::Missing);
            return Ok(None);
        };
        let text = String::from_utf8_lossy(&bytes);
        let document = from_json(&text)?;
        self.last_seen = Some(Seen::Content(fingerprint(&bytes)));
        Ok(Some(document))
    }

    /// Writes the document atomically.
    ///
    /// # Errors
    ///
    /// [`StoreError::Conflict`] when the file changed on disk since the last
    /// load or save (or exists and was never loaded), and [`StoreError::Io`]
    /// when writing fails.
    pub fn save(&mut self, document: &Document) -> Result<()> {
        if self.last_seen != Some(self.on_disk()?) {
            return Err(StoreError::Conflict);
        }
        self.force_save(document)
    }

    /// Writes the document even if the file changed on disk.
    ///
    /// # Errors
    ///
    /// [`StoreError::Io`] when writing fails.
    pub fn force_save(&mut self, document: &Document) -> Result<()> {
        let text = to_json(document);
        self.write_atomic(text.as_bytes())?;
        self.last_seen = Some(Seen::Content(fingerprint(text.as_bytes())));
        Ok(())
    }

    /// Whether the file on disk differs from what this store last saw.
    ///
    /// # Errors
    ///
    /// [`StoreError::Io`] when the file cannot be read.
    pub fn has_external_change(&self) -> Result<bool> {
        Ok(self.last_seen != Some(self.on_disk()?))
    }

    fn on_disk(&self) -> Result<Seen> {
        Ok(match self.read()? {
            Some(bytes) => Seen::Content(fingerprint(&bytes)),
            None => Seen::Missing,
        })
    }

    fn read(&self) -> Result<Option<Vec<u8>>> {
        match fs::read(&self.path) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(source) => Err(self.io_error(source)),
        }
    }

    /// Writes to a temp file in the same folder, flushes it to disk and
    /// renames it over the data file, so readers never see half a file.
    fn write_atomic(&self, bytes: &[u8]) -> Result<()> {
        let dir = match self.path.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => parent,
            _ => Path::new("."),
        };
        fs::create_dir_all(dir).map_err(|source| StoreError::Io {
            path: dir.to_path_buf(),
            source,
        })?;
        let mut temp = tempfile::Builder::new()
            .prefix(".workspace-")
            .suffix(".tmp")
            .tempfile_in(dir)
            .map_err(|source| self.io_error(source))?;
        temp.write_all(bytes)
            .and_then(|()| temp.as_file().sync_all())
            .map_err(|source| self.io_error(source))?;
        temp.persist(&self.path)
            .map_err(|err| self.io_error(err.error))?;
        Ok(())
    }

    fn io_error(&self, source: io::Error) -> StoreError {
        StoreError::Io {
            path: self.path.clone(),
            source,
        }
    }
}

/// Cheap content hash, only compared within one run of the app.
fn fingerprint(bytes: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tabstage_core::{Icon, ProfileColor, Target, TextOwner, TicketKind, TicketPlace};

    fn sample() -> Document {
        let mut workspace = Workspace::new();
        let work = workspace.add_profile("Trabajo").expect("profile");
        let status = workspace
            .add_status("In TEST", ProfileColor::new(3).expect("color"))
            .expect("status");
        let ticket = workspace
            .add_ticket(
                TicketPlace::Profile(work),
                "Carrier Commissions",
                Some(status),
            )
            .expect("ticket");
        workspace.set_ticket_key(ticket, "CAR-5899").expect("key");
        let child = workspace
            .add_ticket(TicketPlace::Ticket(ticket), "Money card", None)
            .expect("child");
        workspace
            .set_ticket_kind(child, TicketKind::Task)
            .expect("kind");
        workspace
            .set_icon(
                Target::Ticket(ticket),
                Some(Icon::text("142").expect("icon")),
            )
            .expect("icon");
        workspace
            .set_profile_color(work, ProfileColor::from_hex("#ff6a3d").expect("hex"))
            .expect("color");
        let note = workspace.add_note(work, "Standup").expect("note");
        workspace
            .set_text(TextOwner::Note(note), "Talk about CAR-5899")
            .expect("body");
        Document {
            settings: Settings::default(),
            workspace,
        }
    }

    fn store_in(dir: &tempfile::TempDir) -> FileStore {
        FileStore::new(dir.path().join("workspace.json"))
    }

    #[test]
    fn load_missing_file_returns_none() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert!(store_in(&dir).load().expect("load").is_none());
    }

    #[test]
    fn saved_document_loads_back_in_a_new_store() {
        let dir = tempfile::tempdir().expect("tempdir");
        let document = sample();
        let mut first = store_in(&dir);
        first.load().expect("load");

        first.save(&document).expect("save");

        assert_eq!(store_in(&dir).load().expect("load"), Some(document));
    }

    #[test]
    fn save_creates_missing_folders_and_leaves_no_temp_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut store = FileStore::new(dir.path().join("sync/Tabstage/workspace.json"));
        store.load().expect("load");

        store.save(&sample()).expect("save");

        let names: Vec<_> = fs::read_dir(dir.path().join("sync/Tabstage"))
            .expect("read dir")
            .map(|entry| entry.expect("entry").file_name())
            .collect();
        assert_eq!(names, ["workspace.json"]);
    }

    #[test]
    fn json_round_trip_keeps_the_document() {
        let document = sample();
        assert_eq!(from_json(&to_json(&document)).expect("parse"), document);
    }

    #[test]
    fn from_json_rejects_other_apps_files() {
        let result = from_json(r#"{"app":"tabstage","version":1,"statuses":[],"board":{}}"#);
        assert!(matches!(result, Err(StoreError::NotTabstage)));
    }

    #[test]
    fn from_json_rejects_newer_versions() {
        let result = from_json(r#"{"app":"tabstage-desktop","version":99}"#);
        assert!(matches!(result, Err(StoreError::UnsupportedVersion(99))));
    }

    #[test]
    fn files_from_before_tickets_are_reported_as_legacy() {
        for version in 1..=4 {
            let text =
                format!(r#"{{"app":"tabstage-desktop","version":{version},"workspace":{{}}}}"#);
            assert!(matches!(from_json(&text), Err(StoreError::Legacy(v)) if v == version));
        }
    }

    #[test]
    fn version_5_files_open_with_their_links_moved_into_notes() {
        let text = r#"{"app":"tabstage-desktop","version":5,"workspace":{"profiles":[
            {"id":"0b8f4a52-0d43-4f4e-9d70-1f4f3f0e9a11","name":"Work","color":2,
             "tickets":[{"id":"6a2e9f3c-6c4c-4b8e-9a51-2b7d3c1e8f22","title":"T",
               "links":[{"id":"9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e55","url":"https://a.dev/","title":"PR"}]}]}
        ]}}"#;

        let document = from_json(text).expect("open");

        let ticket = &document.workspace.profiles()[0].tickets[0];
        assert_eq!(ticket.note.as_deref(), Some("- [PR](<https://a.dev/>)"));
    }

    #[test]
    fn from_json_rejects_malformed_json() {
        assert!(matches!(from_json("{nope"), Err(StoreError::Parse(_))));
    }

    #[test]
    fn from_json_rejects_invalid_workspace() {
        let text = r#"{"app":"tabstage-desktop","version":6,"workspace":{"profiles":[]}}"#;
        assert!(matches!(
            from_json(text),
            Err(StoreError::Invalid(WorkspaceError::NoProfiles))
        ));
    }

    #[test]
    fn save_refuses_to_overwrite_a_change_from_another_device() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut store = store_in(&dir);
        store.load().expect("load");
        store.save(&sample()).expect("first save");
        fs::write(store.path(), to_json(&Document::default())).expect("external write");

        assert!(matches!(store.save(&sample()), Err(StoreError::Conflict)));
        assert!(store.has_external_change().expect("check"));
    }

    #[test]
    fn force_save_overwrites_and_clears_the_conflict() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut store = store_in(&dir);
        store.load().expect("load");
        store.save(&sample()).expect("first save");
        fs::write(store.path(), to_json(&Document::default())).expect("external write");

        store.force_save(&sample()).expect("force");

        assert!(!store.has_external_change().expect("check"));
        store.save(&sample()).expect("save after force");
    }

    #[test]
    fn save_without_loading_an_existing_file_is_a_conflict() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("workspace.json"), to_json(&sample())).expect("write");
        assert!(matches!(
            store_in(&dir).save(&sample()),
            Err(StoreError::Conflict)
        ));
    }

    #[test]
    fn file_format_snapshot() {
        insta::assert_snapshot!(to_json_redacted(&sample()));
    }

    fn to_json_redacted(document: &Document) -> String {
        let mut value: serde_json::Value = serde_json::from_str(&to_json(document)).expect("json");
        redact_ids(&mut value);
        serde_json::to_string_pretty(&value).expect("json")
    }

    /// Replaces random UUIDs so the snapshot is stable.
    fn redact_ids(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                for (key, inner) in map.iter_mut() {
                    if (key == "id" || key == "status") && inner.is_string() {
                        *inner = serde_json::Value::from("[uuid]");
                    } else {
                        redact_ids(inner);
                    }
                }
            }
            serde_json::Value::Array(items) => items.iter_mut().for_each(redact_ids),
            _ => {}
        }
    }
}
