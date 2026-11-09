//! Adapters that touch the real system. [`System`] implements
//! [`Catalog`](crate::Catalog), [`Launcher`](crate::Launcher) and
//! [`TabFocuser`](crate::TabFocuser) for the OS this binary was built for.
//!
//! This code only reads files and runs commands; every decision it relies
//! on lives in the tested pure modules.

use std::process::{Command, Output};

#[cfg(not(target_os = "macos"))]
pub use self::linux::System;
#[cfg(target_os = "macos")]
pub use self::mac::System;
use crate::{BrowserError, Result};

/// Reads the profile list of `browser`. A missing or unreadable file means
/// no profiles to choose from, never an error that blocks opening tabs.
fn read_profiles(
    browser: &crate::BrowserInfo,
    platform: crate::Platform,
    home: &std::path::Path,
) -> Vec<crate::profiles::BrowserProfile> {
    use crate::profiles::{ProfilesFile, chromium_profiles, firefox_profiles, profiles_file};
    let Some(file) = profiles_file(&browser.id, platform, home) else {
        return Vec::new();
    };
    let (path, parse): (_, fn(&str) -> Vec<_>) = match &file {
        ProfilesFile::LocalState(path) => (path, chromium_profiles),
        ProfilesFile::ProfilesIni(path) => (path, firefox_profiles),
    };
    match std::fs::read_to_string(path) {
        Ok(text) => parse(&text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(error) => {
            tracing::warn!(
                path = %path.display(),
                error = &error as &dyn std::error::Error,
                "could not read browser profiles"
            );
            Vec::new()
        }
    }
}

/// Runs a program, waits for it and fails on a non-zero exit.
fn run(program: &str, args: &[String]) -> Result<Output> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|source| BrowserError::Spawn {
            program: program.to_owned(),
            source,
        })?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(BrowserError::Failed {
            program: program.to_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        })
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use std::collections::HashSet;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};

    use plist::Value;
    use tabstage_core::{BrowserId, TabUrl};

    use super::read_profiles;
    use super::run;
    use crate::macos::{
        ScriptFocuser, ScriptRunner, browser_from_info_plist, default_from_launch_services,
        open_command,
    };
    use crate::profiles::{BrowserProfile, launch_flags};
    use crate::{
        BrowserInfo, Catalog, Focus, LaunchOptions, Launcher, Platform, Result, TabFocuser,
    };

    /// macOS: apps in the Applications folders, `open -b` and AppleScript.
    #[derive(Debug, Default, Clone, Copy)]
    pub struct System;

    fn home() -> Option<PathBuf> {
        env::var_os("HOME").map(PathBuf::from)
    }

    fn application_dirs() -> Vec<PathBuf> {
        let mut dirs = vec![
            PathBuf::from("/Applications"),
            PathBuf::from("/System/Applications"),
        ];
        dirs.extend(home().map(|home| home.join("Applications")));
        dirs
    }

    fn read_app(app: &Path) -> Option<BrowserInfo> {
        let info = Value::from_file(app.join("Contents/Info.plist")).ok()?;
        browser_from_info_plist(&info)
    }

    impl Catalog for System {
        fn installed(&self) -> Result<Vec<BrowserInfo>> {
            let mut seen = HashSet::new();
            let mut browsers = Vec::new();
            for dir in application_dirs() {
                let Ok(entries) = fs::read_dir(&dir) else {
                    continue;
                };
                for path in entries.flatten().map(|entry| entry.path()) {
                    if path.extension().is_some_and(|ext| ext == "app")
                        && let Some(browser) = read_app(&path)
                        && seen.insert(browser.id.clone())
                    {
                        browsers.push(browser);
                    }
                }
            }
            browsers.sort_by_key(|browser| browser.name.to_lowercase());
            Ok(browsers)
        }

        fn system_default(&self) -> Result<Option<BrowserId>> {
            let Some(home) = home() else {
                return Ok(None);
            };
            let prefs = home.join(
                "Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist",
            );
            let safari = || BrowserId::parse("com.apple.Safari").ok();
            match Value::from_file(&prefs) {
                // No http handler recorded means the user never changed it.
                Ok(value) => Ok(default_from_launch_services(&value).or_else(safari)),
                Err(_) if !prefs.exists() => Ok(safari()),
                Err(error) => {
                    tracing::warn!(
                        path = %prefs.display(),
                        error = &error as &dyn std::error::Error,
                        "could not read the default browser"
                    );
                    Ok(None)
                }
            }
        }

        fn profiles(&self, browser: &BrowserInfo) -> Result<Vec<BrowserProfile>> {
            Ok(home().map_or_else(Vec::new, |home| {
                read_profiles(browser, Platform::MacOs, &home)
            }))
        }
    }

    impl Launcher for System {
        fn open(&self, browser: &BrowserInfo, url: &TabUrl, options: &LaunchOptions) -> Result<()> {
            let flags = launch_flags(
                browser.kind,
                options.browser_profile.as_deref(),
                options.new_window,
            );
            let (program, args) = open_command(&browser.id, url, &flags);
            run(program, &args).map(drop)
        }
    }

    /// Runs AppleScript through `osascript`.
    #[derive(Debug, Default, Clone, Copy)]
    pub struct Osascript;

    impl ScriptRunner for Osascript {
        fn run(&self, script: &str) -> Result<String> {
            let output = run("osascript", &["-e".to_owned(), script.to_owned()])?;
            Ok(String::from_utf8_lossy(&output.stdout).into_owned())
        }
    }

    impl TabFocuser for System {
        fn focus(&self, browser: &BrowserInfo, url: &TabUrl) -> Result<Focus> {
            ScriptFocuser::new(Osascript).focus(browser, url)
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod linux {
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};

    use tabstage_core::{BrowserId, TabUrl};

    use super::{read_profiles, run};
    use crate::linux::{catalog, exec_args};
    use crate::profiles::{BrowserProfile, launch_flags};
    use crate::{
        BrowserError, BrowserInfo, Catalog, Focus, Launch, LaunchOptions, Launcher, Platform,
        Result, TabFocuser,
    };

    /// Linux: XDG desktop entries, `xdg-settings` and the entry's `Exec` line.
    #[derive(Debug, Default, Clone, Copy)]
    pub struct System;

    /// `applications` folders in XDG precedence order, user first.
    fn application_dirs() -> Vec<PathBuf> {
        let home = env::var_os("HOME").map(PathBuf::from);
        let data_home = env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| home.as_ref().map(|home| home.join(".local/share")));
        let data_dirs = env::var("XDG_DATA_DIRS")
            .ok()
            .filter(|dirs| !dirs.is_empty())
            .unwrap_or_else(|| "/usr/local/share:/usr/share".to_owned());

        let mut dirs: Vec<PathBuf> = data_home.into_iter().collect();
        dirs.extend(home.map(|home| home.join(".local/share/flatpak/exports/share")));
        dirs.extend(env::split_paths(&data_dirs));
        dirs.push(PathBuf::from("/var/lib/flatpak/exports/share"));
        dirs.push(PathBuf::from("/var/lib/snapd/desktop"));
        dirs.into_iter()
            .map(|dir| dir.join("applications"))
            .collect()
    }

    impl Catalog for System {
        fn installed(&self) -> Result<Vec<BrowserInfo>> {
            let mut entries = Vec::new();
            for dir in application_dirs() {
                let Ok(files) = fs::read_dir(&dir) else {
                    continue;
                };
                let mut files: Vec<_> = files.flatten().map(|file| file.path()).collect();
                files.sort();
                for path in files {
                    if path.extension().is_some_and(|ext| ext == "desktop")
                        && let Some(id) = path.file_name().and_then(|name| name.to_str())
                        && let Ok(text) = fs::read_to_string(&path)
                    {
                        entries.push((id.to_owned(), text));
                    }
                }
            }
            Ok(catalog(entries))
        }

        fn system_default(&self) -> Result<Option<BrowserId>> {
            let args = ["get".to_owned(), "default-web-browser".to_owned()];
            match run("xdg-settings", &args) {
                Ok(output) => Ok(BrowserId::parse(&String::from_utf8_lossy(&output.stdout)).ok()),
                Err(error) => {
                    tracing::warn!(
                        error = &error as &dyn std::error::Error,
                        "could not read the default browser"
                    );
                    Ok(None)
                }
            }
        }

        fn profiles(&self, browser: &BrowserInfo) -> Result<Vec<BrowserProfile>> {
            let home = env::var_os("HOME").map(std::path::PathBuf::from);
            Ok(home.map_or_else(Vec::new, |home| {
                read_profiles(browser, Platform::Linux, &home)
            }))
        }
    }

    impl Launcher for System {
        fn open(&self, browser: &BrowserInfo, url: &TabUrl, options: &LaunchOptions) -> Result<()> {
            let Launch::DesktopExec(exec) = &browser.launch else {
                return Err(BrowserError::BadExec(browser.id.to_string()));
            };
            let flags = launch_flags(
                browser.kind,
                options.browser_profile.as_deref(),
                options.new_window,
            );
            let args = exec_args(exec, url.as_str(), &flags)?;
            let (program, rest) = args
                .split_first()
                .ok_or_else(|| BrowserError::BadExec(exec.clone()))?;
            // Browsers may keep running in the foreground, so do not wait.
            Command::new(program)
                .args(rest)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map(drop)
                .map_err(|source| BrowserError::Spawn {
                    program: program.clone(),
                    source,
                })
        }
    }

    impl TabFocuser for System {
        fn focus(&self, _: &BrowserInfo, _: &TabUrl) -> Result<Focus> {
            Ok(Focus::NotFound)
        }
    }
}
