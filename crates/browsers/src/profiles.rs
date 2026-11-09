//! Browser profiles: where each browser keeps its list, how to read it, and
//! the flags that open a URL in one of them.
//!
//! Everything here is pure. [`crate::system`] reads the files.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tabstage_core::BrowserId;

use crate::{BrowserKind, Platform};

/// A profile of an installed browser.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProfile {
    /// What the browser needs to open it: the profile folder name for
    /// Chromium (`Profile 1`), the profile name for Firefox.
    pub id: String,
    /// Name shown in the UI.
    pub name: String,
}

/// Which file lists a browser's profiles, and its format.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProfilesFile {
    /// Chromium `Local State` JSON.
    LocalState(PathBuf),
    /// Firefox `profiles.ini`.
    ProfilesIni(PathBuf),
}

/// Where `browser` keeps its profile list under `home`, for known browsers.
#[must_use]
pub fn profiles_file(browser: &BrowserId, platform: Platform, home: &Path) -> Option<ProfilesFile> {
    // (bundle id on macOS, desktop id on Linux) -> data folder.
    const MAC_CHROMIUM: &[(&str, &str)] = &[
        ("com.google.chrome", "Google/Chrome"),
        ("com.google.chrome.beta", "Google/Chrome Beta"),
        ("com.microsoft.edgemac", "Microsoft Edge"),
        ("com.brave.browser", "BraveSoftware/Brave-Browser"),
        ("com.vivaldi.vivaldi", "Vivaldi"),
        ("org.chromium.chromium", "Chromium"),
    ];
    const MAC_FIREFOX: &[(&str, &str)] = &[
        ("org.mozilla.firefox", "Firefox"),
        ("app.zen-browser.zen", "zen"),
        ("io.gitlab.librewolf-community", "librewolf"),
    ];
    const LINUX_CHROMIUM: &[(&str, &str)] = &[
        ("google-chrome.desktop", "google-chrome"),
        ("google-chrome-beta.desktop", "google-chrome-beta"),
        ("chromium.desktop", "chromium"),
        ("chromium-browser.desktop", "chromium"),
        ("microsoft-edge.desktop", "microsoft-edge"),
        ("brave-browser.desktop", "BraveSoftware/Brave-Browser"),
        ("vivaldi-stable.desktop", "vivaldi"),
    ];
    const LINUX_FIREFOX: &[(&str, &str)] = &[
        ("firefox.desktop", ".mozilla/firefox"),
        ("firefox-esr.desktop", ".mozilla/firefox"),
        ("zen.desktop", ".zen"),
        ("librewolf.desktop", ".librewolf"),
    ];
    let key = browser.as_str().to_ascii_lowercase();
    let find = |table: &'static [(&'static str, &'static str)]| lookup(table, &key);
    match platform {
        Platform::MacOs => {
            let support = home.join("Library/Application Support");
            find(MAC_CHROMIUM)
                .map(|folder| ProfilesFile::LocalState(support.join(folder).join("Local State")))
                .or_else(|| {
                    find(MAC_FIREFOX).map(|folder| {
                        ProfilesFile::ProfilesIni(support.join(folder).join("profiles.ini"))
                    })
                })
        }
        Platform::Linux => find(LINUX_CHROMIUM)
            .map(|folder| {
                ProfilesFile::LocalState(home.join(".config").join(folder).join("Local State"))
            })
            .or_else(|| {
                find(LINUX_FIREFOX)
                    .map(|folder| ProfilesFile::ProfilesIni(home.join(folder).join("profiles.ini")))
            }),
    }
}

fn lookup(table: &'static [(&'static str, &'static str)], key: &str) -> Option<&'static str> {
    table
        .iter()
        .find(|(id, _)| *id == key)
        .map(|(_, folder)| *folder)
}

/// Profiles listed in a Chromium `Local State` file, `Default` first.
#[must_use]
pub fn chromium_profiles(local_state: &str) -> Vec<BrowserProfile> {
    let Ok(state) = serde_json::from_str::<serde_json::Value>(local_state) else {
        return Vec::new();
    };
    let Some(cache) = state
        .pointer("/profile/info_cache")
        .and_then(|v| v.as_object())
    else {
        return Vec::new();
    };
    let mut profiles: Vec<_> = cache
        .iter()
        .map(|(folder, info)| BrowserProfile {
            id: folder.clone(),
            name: info
                .get("name")
                .and_then(|name| name.as_str())
                .unwrap_or(folder)
                .to_owned(),
        })
        .collect();
    profiles.sort_by_key(|profile| folder_order(&profile.id));
    profiles
}

/// `Default` first, then `Profile N` by number, then anything else by name.
fn folder_order(folder: &str) -> (u8, u64, String) {
    if folder == "Default" {
        return (0, 0, String::new());
    }
    match folder.strip_prefix("Profile ").and_then(|n| n.parse().ok()) {
        Some(number) => (1, number, String::new()),
        None => (2, 0, folder.to_owned()),
    }
}

/// Profiles listed in a Firefox `profiles.ini` file, in file order.
#[must_use]
pub fn firefox_profiles(ini: &str) -> Vec<BrowserProfile> {
    let mut profiles = Vec::new();
    let mut in_profile = false;
    for line in ini.lines().map(str::trim) {
        if line.starts_with('[') {
            in_profile = line.starts_with("[Profile");
        } else if in_profile && let Some(name) = line.strip_prefix("Name=") {
            let name = name.trim();
            if !name.is_empty() {
                profiles.push(BrowserProfile {
                    id: name.to_owned(),
                    name: name.to_owned(),
                });
            }
        }
    }
    profiles
}

/// Command-line flags that open in `profile` and, if asked, in a new window.
#[must_use]
pub fn launch_flags(kind: BrowserKind, profile: Option<&str>, new_window: bool) -> Vec<String> {
    let mut flags = Vec::new();
    match kind {
        BrowserKind::Chromium => {
            if let Some(profile) = profile {
                flags.push(format!("--profile-directory={profile}"));
            }
            if new_window {
                flags.push("--new-window".to_owned());
            }
        }
        BrowserKind::Firefox => {
            if let Some(profile) = profile {
                flags.push("-P".to_owned());
                flags.push(profile.to_owned());
            }
            if new_window {
                flags.push("-new-window".to_owned());
            }
        }
        BrowserKind::Safari | BrowserKind::Other => {}
    }
    flags
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(raw: &str) -> BrowserId {
        BrowserId::parse(raw).expect("id")
    }

    const LOCAL_STATE: &str = r#"{
      "browser": { "enabled_labs_experiments": [] },
      "profile": {
        "info_cache": {
          "Profile 2": { "name": "Cliente X", "is_using_default_name": false },
          "Default": { "name": "Personal" },
          "Profile 1": { "name": "Trabajo" }
        },
        "last_used": "Profile 1"
      }
    }"#;

    const PROFILES_INI: &str = "[Install4F96D1932A9F858E]
Default=Profiles/abc.default-release
Locked=1

[Profile1]
Name=Trabajo
IsRelative=1
Path=Profiles/xyz.trabajo

[Profile0]
Name=default-release
IsRelative=1
Path=Profiles/abc.default-release
Default=1

[General]
StartWithLastProfile=1
Version=2
";

    #[test]
    fn reads_chromium_profiles_default_first_then_by_folder() {
        assert_eq!(
            chromium_profiles(LOCAL_STATE),
            [
                BrowserProfile {
                    id: "Default".into(),
                    name: "Personal".into()
                },
                BrowserProfile {
                    id: "Profile 1".into(),
                    name: "Trabajo".into()
                },
                BrowserProfile {
                    id: "Profile 2".into(),
                    name: "Cliente X".into()
                },
            ]
        );
    }

    #[test]
    fn broken_or_empty_local_state_has_no_profiles() {
        assert!(chromium_profiles("{not json").is_empty());
        assert!(chromium_profiles("{}").is_empty());
    }

    #[test]
    fn reads_firefox_profiles_in_file_order() {
        assert_eq!(
            firefox_profiles(PROFILES_INI),
            [
                BrowserProfile {
                    id: "Trabajo".into(),
                    name: "Trabajo".into()
                },
                BrowserProfile {
                    id: "default-release".into(),
                    name: "default-release".into()
                },
            ]
        );
    }

    #[test]
    fn profile_folder_numbers_sort_naturally() {
        let state = r#"{"profile":{"info_cache":{
          "Profile 10":{"name":"Diez"},"Profile 9":{"name":"Nueve"}}}}"#;

        let ids: Vec<_> = chromium_profiles(state).into_iter().map(|p| p.id).collect();

        assert_eq!(ids, ["Profile 9", "Profile 10"]);
    }

    #[test]
    fn knows_where_browsers_keep_their_profiles() {
        let home = Path::new("/Users/me");
        let mac = |raw| profiles_file(&id(raw), Platform::MacOs, home);
        assert_eq!(
            mac("com.google.Chrome"),
            Some(ProfilesFile::LocalState(home.join(
                "Library/Application Support/Google/Chrome/Local State"
            )))
        );
        assert_eq!(
            mac("com.brave.Browser"),
            Some(ProfilesFile::LocalState(home.join(
                "Library/Application Support/BraveSoftware/Brave-Browser/Local State"
            )))
        );
        assert_eq!(
            mac("app.zen-browser.zen"),
            Some(ProfilesFile::ProfilesIni(
                home.join("Library/Application Support/zen/profiles.ini")
            ))
        );
        assert_eq!(mac("com.apple.Safari"), None);

        let home = Path::new("/home/me");
        let linux = |raw| profiles_file(&id(raw), Platform::Linux, home);
        assert_eq!(
            linux("google-chrome.desktop"),
            Some(ProfilesFile::LocalState(
                home.join(".config/google-chrome/Local State")
            ))
        );
        assert_eq!(
            linux("firefox.desktop"),
            Some(ProfilesFile::ProfilesIni(
                home.join(".mozilla/firefox/profiles.ini")
            ))
        );
        assert_eq!(linux("org.gnome.Epiphany.desktop"), None);
    }

    #[test]
    fn chromium_flags_pick_the_profile_folder_and_window() {
        assert_eq!(
            launch_flags(BrowserKind::Chromium, Some("Profile 1"), true),
            ["--profile-directory=Profile 1", "--new-window"]
        );
        assert!(launch_flags(BrowserKind::Chromium, None, false).is_empty());
    }

    #[test]
    fn firefox_flags_pick_the_profile_name_and_window() {
        assert_eq!(
            launch_flags(BrowserKind::Firefox, Some("Trabajo"), true),
            ["-P", "Trabajo", "-new-window"]
        );
        assert_eq!(
            launch_flags(BrowserKind::Firefox, None, true),
            ["-new-window"]
        );
    }

    #[test]
    fn other_browsers_take_no_flags() {
        assert!(launch_flags(BrowserKind::Safari, Some("x"), true).is_empty());
        assert!(launch_flags(BrowserKind::Other, None, true).is_empty());
    }
}
