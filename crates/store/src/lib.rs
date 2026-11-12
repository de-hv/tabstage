//! Saves and loads the Tabstage Desktop workspace as one JSON file.
//!
//! The file lives in a local folder. Writes are atomic (temp file + rename),
//! and [`FileStore`] refuses to overwrite a file that something else changed
//! since it was last read, so no work is silently lost.

mod migrate;

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
pub const FORMAT_VERSION: u32 = 4;

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
    /// Profiles with their groups, folders and tabs.
    pub workspace: Workspace,
    /// Browsers an older file assigned, for this machine's config. Empty
    /// unless the file was just upgraded; never written to disk.
    pub migrated: Vec<MigratedBinding>,
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
/// [`StoreError::UnsupportedVersion`] or [`StoreError::Invalid`].
pub fn from_json(text: &str) -> Result<Document> {
    let header: Header = serde_json::from_str(text).map_err(StoreError::Parse)?;
    if header.app.as_deref() != Some(APP) {
        return Err(StoreError::NotTabstage);
    }
    if header.version > FORMAT_VERSION {
        return Err(StoreError::UnsupportedVersion(header.version));
    }
    let mut value: serde_json::Value = serde_json::from_str(text).map_err(StoreError::Parse)?;
    let migrated = if header.version < 2 {
        migrate::upgrade_v1(&mut value)
    } else {
        Vec::new()
    };
    migrate::fill_profile_colors(&mut value);
    if header.version < 3 {
        migrate::upgrade_v2(&mut value);
    }
    if header.version < 4 {
        migrate::upgrade_v3(&mut value);
    }
    let file: FileOwned = serde_json::from_value(value).map_err(StoreError::Parse)?;
    file.workspace.validate()?;
    Ok(Document {
        settings: file.settings,
        workspace: file.workspace,
        migrated,
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
    use tabstage_core::{Icon, Place, TabUrl, Target};

    fn sample() -> Document {
        let mut workspace = Workspace::new();
        let work = workspace.add_profile("Trabajo").expect("profile");
        let group = workspace.add_group(work, "Work").expect("group");
        let folder = workspace
            .add_folder(Place::Group(group), "Sprint 42")
            .expect("folder");
        workspace
            .add_tab(
                Place::Profile(work),
                TabUrl::parse("https://wiki.dev/").expect("url"),
                "Wiki",
            )
            .expect("tab");
        let tab = workspace
            .add_tab(
                Place::Folder(folder),
                TabUrl::parse("https://a.dev/issue/1").expect("url"),
                "Issue 1",
            )
            .expect("tab");
        workspace
            .set_icon(Target::Tab(tab), Some(Icon::text("142").expect("icon")))
            .expect("icon");
        Document {
            settings: Settings::default(),
            workspace,
            migrated: Vec::new(),
        }
    }

    fn store_in(dir: &tempfile::TempDir) -> FileStore {
        FileStore::new(dir.path().join("workspace.json"))
    }

    #[test]
    fn load_missing_file_returns_none() {
        let dir = tempfile::tempdir().expect("tempdir");

        let loaded = store_in(&dir).load().expect("load");

        assert!(loaded.is_none());
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
    fn version_1_files_are_upgraded_and_report_their_browsers() {
        let v1 = r#"{"app":"tabstage-desktop","version":1,
            "settings":{"defaultBrowser":"org.mozilla.firefox"},
            "workspace":{"statuses":[],"groups":[
              {"id":"00000000-0000-0000-0000-000000000001","name":"Work","color":"blue",
               "browser":{"kind":"specific","browser":"com.google.Chrome"},"children":[]}]}}"#;

        let document = from_json(v1).expect("upgrade");

        let names: Vec<_> = document
            .workspace
            .profiles()
            .iter()
            .map(|p| p.name.as_str())
            .collect();
        assert_eq!(names, ["Default", "com.google.Chrome"]);
        let colors: Vec<_> = document
            .workspace
            .profiles()
            .iter()
            .map(|p| p.color.index())
            .collect();
        assert_eq!(colors, [0, 1]);
        let group = document.workspace.groups().next().expect("group").id;
        assert_eq!(
            document.workspace.group_profile(group).map(|p| p.id),
            Some(document.workspace.profiles()[1].id)
        );
        assert_eq!(document.migrated.len(), 2);
        assert!(to_json(&document).contains("\"version\": 4"));
    }

    #[test]
    fn early_version_2_files_get_profile_colors() {
        let early = r#"{"app":"tabstage-desktop","version":2,"settings":{},
            "workspace":{"statuses":[],"profiles":[
              {"id":"00000000-0000-0000-0000-0000000000c1","name":"Default"},
              {"id":"00000000-0000-0000-0000-0000000000c2","name":"Work"}],"groups":[]}}"#;

        let document = from_json(early).expect("load");

        let colors: Vec<_> = document
            .workspace
            .profiles()
            .iter()
            .map(|p| p.color.index())
            .collect();
        assert_eq!(colors, [0, 1]);
    }

    #[test]
    fn from_json_rejects_malformed_json() {
        assert!(matches!(from_json("{not json"), Err(StoreError::Parse(_))));
    }

    #[test]
    fn version_2_files_are_upgraded_to_nested_profiles_without_statuses() {
        let v2 = r#"{"app":"tabstage-desktop","version":2,"settings":{},
            "workspace":{"statuses":[{"id":"todo","label":"To do","color":"lavender"}],"profiles":[
              {"id":"00000000-0000-0000-0000-0000000000c1","name":"Cliente","color":3}],"groups":[
              {"id":"00000000-0000-0000-0000-000000000001","name":"In TEST","color":"blue",
               "profile":"00000000-0000-0000-0000-0000000000c1","children":[
                 {"type":"tab","id":"00000000-0000-0000-0000-00000000000a","url":"https://a.dev/","title":"a","status":"todo"}]}]}}"#;

        let document = from_json(v2).expect("upgrade");

        let profile = &document.workspace.profiles()[0];
        assert_eq!(profile.items.len(), 1);
        assert_eq!(document.workspace.tabs().len(), 1);
        let text = to_json(&document);
        assert!(!text.contains("status"), "{text}");
        assert_eq!(
            from_json(&text).expect("reload").workspace,
            document.workspace
        );
    }

    #[test]
    fn from_json_rejects_invalid_workspace() {
        let text = to_json(&sample()).replace("\"profiles\": [", "\"profiles\": [] ,\"x\": [");

        let result = from_json(&text);

        assert!(
            matches!(result, Err(StoreError::Invalid(WorkspaceError::NoProfiles))),
            "{result:?}"
        );
    }

    #[test]
    fn save_refuses_to_overwrite_a_change_from_another_device() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut laptop = store_in(&dir);
        laptop.load().expect("load");
        laptop.save(&sample()).expect("first save");
        let mut desktop = store_in(&dir);
        let mut theirs = desktop.load().expect("load").expect("document");
        theirs
            .workspace
            .add_profile("Otro equipo")
            .expect("profile");
        desktop.save(&theirs).expect("their save");

        assert!(laptop.has_external_change().expect("check"));
        assert!(matches!(laptop.save(&sample()), Err(StoreError::Conflict)));
        assert_eq!(store_in(&dir).load().expect("load"), Some(theirs));
    }

    #[test]
    fn force_save_overwrites_and_clears_the_conflict() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut laptop = store_in(&dir);
        laptop.load().expect("load");
        laptop.save(&sample()).expect("save");
        fs::write(laptop.path(), to_json(&Document::default())).expect("external write");

        laptop.force_save(&sample()).expect("force");

        assert!(!laptop.has_external_change().expect("check"));
        laptop.save(&sample()).expect("save after force");
    }

    #[test]
    fn save_without_loading_an_existing_file_is_a_conflict() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut first = store_in(&dir);
        first.load().expect("load");
        first.save(&sample()).expect("save");

        let result = store_in(&dir).save(&Document::default());

        assert!(matches!(result, Err(StoreError::Conflict)));
    }

    #[test]
    fn consecutive_own_saves_are_not_conflicts() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut store = store_in(&dir);
        store.load().expect("load");

        store.save(&sample()).expect("first");
        store.save(&Document::default()).expect("second");

        assert!(!store.has_external_change().expect("check"));
    }

    #[test]
    fn file_format_snapshot() {
        insta::assert_snapshot!(to_json_redacted(&sample()));
    }

    /// The JSON with random ids replaced, so the snapshot is stable.
    fn to_json_redacted(document: &Document) -> String {
        let mut value: serde_json::Value = serde_json::from_str(&to_json(document)).expect("json");
        redact_ids(&mut value);
        serde_json::to_string_pretty(&value).expect("json")
    }

    fn redact_ids(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                for (key, child) in map.iter_mut() {
                    if matches!(key.as_str(), "id" | "profile")
                        && child.as_str().is_some_and(|id| id.len() == 36)
                    {
                        *child = serde_json::Value::from("[uuid]");
                    } else {
                        redact_ids(child);
                    }
                }
            }
            serde_json::Value::Array(items) => items.iter_mut().for_each(redact_ids),
            _ => {}
        }
    }
}
