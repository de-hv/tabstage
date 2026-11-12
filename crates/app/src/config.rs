//! Machine-local config: where this machine keeps its data file.
//!
//! The pointer to the data file cannot live inside it, so it is a small JSON
//! file in the app config folder, together with the browser of each profile.

use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tabstage_core::{BrowserId, ProfileId};

/// Name of the data file inside the folder the user picks.
pub const DATA_FILE_NAME: &str = "workspace.json";

/// Which browser a Tabstage profile opens in on this machine. Fields that
/// older versions wrote (`browserProfile`, `newWindow`) are ignored.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileBinding {
    /// Installed browser.
    pub browser: BrowserId,
}

/// Settings that belong to this machine only.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Data file chosen by the user; `None` means the default location.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_path: Option<PathBuf>,
    /// Browser of each Tabstage profile on this machine. Browsers differ
    /// between machines, so these choices stay out of the data file.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub profiles: BTreeMap<ProfileId, ProfileBinding>,
    /// A data file from before tickets that was set aside at startup and not
    /// imported yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy_backup: Option<PathBuf>,
}

/// The data file inside `folder`.
#[must_use]
pub fn data_file_in(folder: &Path) -> PathBuf {
    folder.join(DATA_FILE_NAME)
}

/// Reads the config. A missing or unreadable file gives the defaults, so a
/// broken config never keeps the app from starting.
#[must_use]
pub fn load_config(path: &Path) -> AppConfig {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return AppConfig::default(),
        Err(error) => {
            tracing::warn!(path = %path.display(), error = &error as &dyn std::error::Error, "could not read config, using defaults");
            return AppConfig::default();
        }
    };
    serde_json::from_str(&text).unwrap_or_else(|error| {
        tracing::warn!(path = %path.display(), error = &error as &dyn std::error::Error, "invalid config, using defaults");
        AppConfig::default()
    })
}

/// Writes the config atomically, creating its folder if needed.
///
/// # Errors
///
/// When the folder or file cannot be written.
pub fn save_config(path: &Path, config: &AppConfig) -> io::Result<()> {
    let dir = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    fs::create_dir_all(dir)?;
    let text = serde_json::to_string_pretty(config).map_err(io::Error::other)?;
    let mut temp = tempfile::NamedTempFile::new_in(dir)?;
    temp.write_all(text.as_bytes())?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_config_gives_defaults() {
        let dir = tempfile::tempdir().expect("tempdir");

        assert_eq!(
            load_config(&dir.path().join("config.json")),
            AppConfig::default()
        );
    }

    #[test]
    fn corrupt_config_gives_defaults() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.json");
        fs::write(&path, "{nope").expect("write");

        assert_eq!(load_config(&path), AppConfig::default());
    }

    #[test]
    fn saved_config_loads_back() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("nested/config.json");
        let mut config = AppConfig {
            data_path: Some(PathBuf::from("/Users/me/Documents/Tabstage/workspace.json")),
            ..AppConfig::default()
        };
        config.profiles.insert(
            ProfileId::new(),
            ProfileBinding {
                browser: BrowserId::parse("com.google.Chrome").expect("id"),
            },
        );

        save_config(&path, &config).expect("save");

        assert_eq!(load_config(&path), config);
    }

    #[test]
    fn bindings_from_older_versions_load_without_their_extra_fields() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.json");
        let profile = ProfileId::new();
        fs::write(
            &path,
            format!(
                r#"{{"profiles":{{"{profile}":{{"browser":"com.google.Chrome","browserProfile":"Profile 1","newWindow":true}}}}}}"#
            ),
        )
        .expect("write");

        let config = load_config(&path);

        assert_eq!(
            config.profiles.get(&profile).map(|b| b.browser.as_str()),
            Some("com.google.Chrome")
        );
    }

    #[test]
    fn data_file_has_a_fixed_name() {
        assert_eq!(
            data_file_in(Path::new("/sync/Tabstage")),
            PathBuf::from("/sync/Tabstage/workspace.json")
        );
    }
}
