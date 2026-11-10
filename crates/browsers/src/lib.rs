//! Finds installed browsers, opens tabs in them and focuses tabs that are
//! already open.
//!
//! The decision logic ([`open_tab`]) and every parser are pure and tested on
//! any OS. The code that touches the system lives in [`system`] behind the
//! [`Catalog`], [`Launcher`] and [`TabFocuser`] traits.
//!
//! Focusing an existing tab is only possible on macOS, for Safari and
//! Chromium-based browsers, through AppleScript. Everywhere else the tab is
//! opened in a new tab.

use std::io;
use std::path::PathBuf;

use serde::Serialize;
use tabstage_core::{BrowserId, TabUrl};
use thiserror::Error;

pub mod linux;
pub mod listing;
pub mod macos;
pub mod system;

/// Browser family, which decides what the app can do with it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BrowserKind {
    /// Chrome, Edge, Brave, Vivaldi, Arc, Opera, Chromium.
    Chromium,
    /// Safari.
    Safari,
    /// Firefox and its forks.
    Firefox,
    /// Anything else that handles web links.
    Other,
}

impl BrowserKind {
    /// Guesses the family from a macOS bundle id or a Linux desktop id.
    #[must_use]
    pub fn from_id(id: &BrowserId) -> Self {
        const FIREFOX: &[&str] = &[
            "firefox",
            "mozilla",
            "zen",
            "librewolf",
            "waterfox",
            "floorp",
            "icecat",
        ];
        const CHROMIUM: &[&str] = &[
            "chrome",
            "chromium",
            "edge",
            "brave",
            "vivaldi",
            "thebrowser",
            "opera",
            "yandex",
            "thorium",
        ];
        let id = id.as_str().to_ascii_lowercase();
        let has = |needles: &[&str]| needles.iter().any(|needle| id.contains(needle));
        if id.contains("safari") {
            Self::Safari
        } else if has(FIREFOX) {
            Self::Firefox
        } else if has(CHROMIUM) {
            Self::Chromium
        } else {
            Self::Other
        }
    }
}

/// The OS the app runs on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    /// macOS.
    MacOs,
    /// Linux.
    Linux,
}

impl Platform {
    /// The platform this binary was built for.
    #[must_use]
    pub const fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::MacOs
        } else {
            Self::Linux
        }
    }
}

/// Whether the app can find and focus an open tab of this browser family.
#[must_use]
pub fn can_focus_tabs(kind: BrowserKind, platform: Platform) -> bool {
    matches!(
        (kind, platform),
        (BrowserKind::Chromium | BrowserKind::Safari, Platform::MacOs)
    )
}

/// The installed browser with this id, compared without case because macOS
/// Launch Services stores bundle ids in lowercase.
#[must_use]
pub fn find_installed<'a>(installed: &'a [BrowserInfo], id: &BrowserId) -> Option<&'a BrowserInfo> {
    installed
        .iter()
        .find(|browser| browser.id.as_str().eq_ignore_ascii_case(id.as_str()))
}

/// How a browser is started.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", content = "exec", rename_all = "camelCase")]
pub enum Launch {
    /// macOS app opened by its bundle id (`open -b`).
    MacBundle,
    /// Linux desktop entry `Exec` line.
    DesktopExec(String),
}

/// An installed browser.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInfo {
    /// Stable id: bundle id on macOS, desktop entry id on Linux.
    pub id: BrowserId,
    /// Name shown in the UI.
    pub name: String,
    /// Browser family.
    pub kind: BrowserKind,
    /// How to start it.
    pub launch: Launch,
}

/// Errors from finding, opening or focusing browsers.
#[derive(Debug, Error)]
pub enum BrowserError {
    /// A helper program could not be started.
    #[error("could not run {program}")]
    Spawn {
        /// Program name.
        program: String,
        /// Underlying error.
        #[source]
        source: io::Error,
    },
    /// A helper program ran and failed.
    #[error("{program} failed: {stderr}")]
    Failed {
        /// Program name.
        program: String,
        /// What it printed on stderr.
        stderr: String,
    },
    /// A desktop entry `Exec` line could not be parsed.
    #[error("invalid launch command `{0}`")]
    BadExec(String),
    /// A file could not be read.
    #[error("could not read {path}")]
    Io {
        /// File involved.
        path: PathBuf,
        /// Underlying error.
        #[source]
        source: io::Error,
    },
}

/// Result type for browser operations.
pub type Result<T> = std::result::Result<T, BrowserError>;

/// Lists the browsers on this machine.
pub trait Catalog {
    /// Installed browsers, sorted by name.
    ///
    /// # Errors
    ///
    /// When the system cannot be queried.
    fn installed(&self) -> Result<Vec<BrowserInfo>>;

    /// The browser the OS opens links with, when known.
    ///
    /// # Errors
    ///
    /// When the system cannot be queried.
    fn system_default(&self) -> Result<Option<BrowserId>>;
}

/// Opens a URL in a new tab of a browser.
pub trait Launcher {
    /// Opens `url` in a new tab of `browser`.
    ///
    /// # Errors
    ///
    /// When the browser cannot be started.
    fn open(&self, browser: &BrowserInfo, url: &TabUrl) -> Result<()>;
}

/// Result of looking for an open tab.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Focus {
    /// The tab was open and is now in front.
    Focused,
    /// No open tab has this URL.
    NotFound,
}

/// Finds an open tab and brings it to the front.
pub trait TabFocuser {
    /// Focuses the tab of `browser` showing `url`, if there is one.
    ///
    /// # Errors
    ///
    /// When the browser cannot be queried, for example because macOS
    /// Automation permission was denied.
    fn focus(&self, browser: &BrowserInfo, url: &TabUrl) -> Result<Focus>;
}

/// What [`open_tab`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Opened {
    /// An open tab with the same URL was brought to the front.
    FocusedExisting,
    /// The URL was opened in a new tab.
    OpenedNew,
}

/// Opens a tab in `browser`, focusing an already open tab with the same URL
/// when the browser allows it. If looking for the tab fails, it opens a new
/// tab instead of failing.
///
/// # Errors
///
/// Only when opening the new tab fails.
pub fn open_tab(
    browser: &BrowserInfo,
    url: &TabUrl,
    platform: Platform,
    focuser: &impl TabFocuser,
    launcher: &impl Launcher,
) -> Result<Opened> {
    if can_focus_tabs(browser.kind, platform) {
        match focuser.focus(browser, url) {
            Ok(Focus::Focused) => return Ok(Opened::FocusedExisting),
            Ok(Focus::NotFound) => {}
            Err(error) => tracing::warn!(
                browser = %browser.id,
                error = &error as &dyn std::error::Error,
                "could not look for an open tab, opening a new one"
            ),
        }
    }
    launcher.open(browser, url)?;
    Ok(Opened::OpenedNew)
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use super::*;

    fn id(raw: &str) -> BrowserId {
        BrowserId::parse(raw).expect("valid id")
    }

    fn browser(raw: &str) -> BrowserInfo {
        let id = id(raw);
        BrowserInfo {
            kind: BrowserKind::from_id(&id),
            name: raw.to_owned(),
            id,
            launch: Launch::MacBundle,
        }
    }

    fn url() -> TabUrl {
        TabUrl::parse("https://a.dev/issue/1").expect("url")
    }

    #[derive(Default)]
    struct RecordingLauncher {
        opened: RefCell<Vec<String>>,
        fail: bool,
    }

    impl Launcher for RecordingLauncher {
        fn open(&self, browser: &BrowserInfo, url: &TabUrl) -> Result<()> {
            if self.fail {
                return Err(BrowserError::Failed {
                    program: "open".into(),
                    stderr: "boom".into(),
                });
            }
            self.opened
                .borrow_mut()
                .push(format!("{} {}", browser.id, url));
            Ok(())
        }
    }

    struct FakeFocuser {
        answer: fn() -> Result<Focus>,
        calls: Cell<u32>,
    }

    impl FakeFocuser {
        fn new(answer: fn() -> Result<Focus>) -> Self {
            Self {
                answer,
                calls: Cell::new(0),
            }
        }
    }

    impl TabFocuser for FakeFocuser {
        fn focus(&self, _: &BrowserInfo, _: &TabUrl) -> Result<Focus> {
            self.calls.set(self.calls.get() + 1);
            (self.answer)()
        }
    }

    #[test]
    fn classifies_known_browsers() {
        let cases = [
            ("com.google.Chrome", BrowserKind::Chromium),
            ("com.microsoft.edgemac", BrowserKind::Chromium),
            ("com.brave.Browser", BrowserKind::Chromium),
            ("company.thebrowser.Browser", BrowserKind::Chromium),
            ("com.vivaldi.Vivaldi", BrowserKind::Chromium),
            ("google-chrome.desktop", BrowserKind::Chromium),
            ("chromium.desktop", BrowserKind::Chromium),
            ("brave-browser.desktop", BrowserKind::Chromium),
            ("com.apple.Safari", BrowserKind::Safari),
            ("org.mozilla.firefox", BrowserKind::Firefox),
            ("firefox.desktop", BrowserKind::Firefox),
            ("app.zen_browser.zen", BrowserKind::Firefox),
            (
                "io.gitlab.librewolf-community.desktop",
                BrowserKind::Firefox,
            ),
            ("org.gnome.Epiphany.desktop", BrowserKind::Other),
        ];
        for (raw, kind) in cases {
            assert_eq!(BrowserKind::from_id(&id(raw)), kind, "{raw}");
        }
    }

    #[test]
    fn finds_installed_browser_ignoring_case() {
        let installed = [browser("com.google.Chrome"), browser("com.apple.Safari")];

        let found = find_installed(&installed, &id("com.google.chrome"));

        assert_eq!(found.map(|b| b.id.as_str()), Some("com.google.Chrome"));
        assert!(find_installed(&installed, &id("org.mozilla.firefox")).is_none());
    }

    #[test]
    fn only_safari_and_chromium_on_macos_can_focus() {
        assert!(can_focus_tabs(BrowserKind::Chromium, Platform::MacOs));
        assert!(can_focus_tabs(BrowserKind::Safari, Platform::MacOs));
        assert!(!can_focus_tabs(BrowserKind::Firefox, Platform::MacOs));
        assert!(!can_focus_tabs(BrowserKind::Other, Platform::MacOs));
        assert!(!can_focus_tabs(BrowserKind::Chromium, Platform::Linux));
    }

    #[test]
    fn focuses_existing_tab_without_opening_a_new_one() {
        let launcher = RecordingLauncher::default();
        let focuser = FakeFocuser::new(|| Ok(Focus::Focused));

        let opened = open_tab(
            &browser("com.google.Chrome"),
            &url(),
            Platform::MacOs,
            &focuser,
            &launcher,
        )
        .expect("open");

        assert_eq!(opened, Opened::FocusedExisting);
        assert!(launcher.opened.borrow().is_empty());
    }

    #[test]
    fn opens_new_tab_when_none_matches() {
        let launcher = RecordingLauncher::default();
        let focuser = FakeFocuser::new(|| Ok(Focus::NotFound));

        let opened = open_tab(
            &browser("com.apple.Safari"),
            &url(),
            Platform::MacOs,
            &focuser,
            &launcher,
        )
        .expect("open");

        assert_eq!(opened, Opened::OpenedNew);
        assert_eq!(
            *launcher.opened.borrow(),
            ["com.apple.Safari https://a.dev/issue/1"]
        );
    }

    #[test]
    fn opens_new_tab_when_focusing_fails() {
        let launcher = RecordingLauncher::default();
        let focuser = FakeFocuser::new(|| {
            Err(BrowserError::Failed {
                program: "osascript".into(),
                stderr: "not authorized to send Apple events".into(),
            })
        });

        let opened = open_tab(
            &browser("com.google.Chrome"),
            &url(),
            Platform::MacOs,
            &focuser,
            &launcher,
        )
        .expect("open");

        assert_eq!(opened, Opened::OpenedNew);
        assert_eq!(launcher.opened.borrow().len(), 1);
    }

    #[test]
    fn never_asks_firefox_or_linux_for_open_tabs() {
        let launcher = RecordingLauncher::default();
        let focuser = FakeFocuser::new(|| Ok(Focus::Focused));

        open_tab(
            &browser("org.mozilla.firefox"),
            &url(),
            Platform::MacOs,
            &focuser,
            &launcher,
        )
        .expect("firefox");
        open_tab(
            &browser("google-chrome.desktop"),
            &url(),
            Platform::Linux,
            &focuser,
            &launcher,
        )
        .expect("linux chrome");

        assert_eq!(focuser.calls.get(), 0);
        assert_eq!(launcher.opened.borrow().len(), 2);
    }

    #[test]
    fn launcher_failure_is_returned() {
        let launcher = RecordingLauncher {
            fail: true,
            ..RecordingLauncher::default()
        };
        let focuser = FakeFocuser::new(|| Ok(Focus::NotFound));

        let result = open_tab(
            &browser("org.mozilla.firefox"),
            &url(),
            Platform::MacOs,
            &focuser,
            &launcher,
        );

        assert!(matches!(result, Err(BrowserError::Failed { .. })));
    }
}
