//! Machine-local config: where this machine keeps its data file.
//!
//! The data file may live in a synced folder, so the pointer to it cannot
//! live inside it. It is a small JSON file in the app config folder.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Name of the data file inside the folder the user picks.
pub const DATA_FILE_NAME: &str = "workspace.json";

/// Settings that belong to this machine only.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Data file chosen by the user; `None` means the default location.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_path: Option<PathBuf>,
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
        let config = AppConfig {
            data_path: Some(PathBuf::from("/Users/me/Dropbox/Tabstage/workspace.json")),
        };

        save_config(&path, &config).expect("save");

        assert_eq!(load_config(&path), config);
    }

    #[test]
    fn data_file_has_a_fixed_name() {
        assert_eq!(
            data_file_in(Path::new("/sync/Tabstage")),
            PathBuf::from("/sync/Tabstage/workspace.json")
        );
    }
}
