//! macOS support: AppleScripts for Safari and Chromium browsers, app bundle
//! detection and the default browser from Launch Services.
//!
//! Everything here is pure so it is tested on any OS; the code that runs
//! `osascript` and reads files lives in [`crate::system`].

use plist::Value;
use tabstage_core::{BrowserId, TabUrl};

use crate::listing::{TabPosition, find_tab};
use crate::{BrowserInfo, BrowserKind, Focus, Launch, Result, TabFocuser};

/// Runs an AppleScript and returns what it printed.
pub trait ScriptRunner {
    /// Runs `script`.
    ///
    /// # Errors
    ///
    /// When the script cannot run, for example because Automation
    /// permission was denied.
    fn run(&self, script: &str) -> Result<String>;
}

/// AppleScript that prints every tab as `window<TAB>tab<TAB>url`.
///
/// It only talks to the browser when it is already running, so asking never
/// launches it. Returns `None` for browsers without tab scripting and for
/// ids that are not safe to put in a script.
#[must_use]
pub fn list_tabs_script(kind: BrowserKind, bundle: &BrowserId) -> Option<String> {
    if !matches!(kind, BrowserKind::Chromium | BrowserKind::Safari) || !is_script_safe(bundle) {
        return None;
    }
    // Windows without tabs (settings, downloads) are skipped with `try` but
    // still counted, so indices match `window N` in the focus script.
    Some(format!(
        r#"if application id "{bundle}" is running then
	tell application id "{bundle}"
		set output to ""
		set windowIndex to 0
		repeat with w in windows
			set windowIndex to windowIndex + 1
			try
				set tabIndex to 0
				repeat with t in tabs of w
					set tabIndex to tabIndex + 1
					set output to output & windowIndex & tab & tabIndex & tab & (URL of t) & linefeed
				end repeat
			end try
		end repeat
		return output
	end tell
end if
return """#
    ))
}

/// AppleScript that brings tab `position` of `bundle` to the front.
#[must_use]
pub fn focus_tab_script(
    kind: BrowserKind,
    bundle: &BrowserId,
    position: TabPosition,
) -> Option<String> {
    if !is_script_safe(bundle) {
        return None;
    }
    let TabPosition { window, tab } = position;
    let select_tab = match kind {
        BrowserKind::Chromium => format!("set active tab index of window {window} to {tab}"),
        BrowserKind::Safari => {
            format!("set current tab of window {window} to tab {tab} of window {window}")
        }
        BrowserKind::Firefox | BrowserKind::Other => return None,
    };
    Some(format!(
        r#"tell application id "{bundle}"
	{select_tab}
	set index of window {window} to 1
	activate
end tell"#
    ))
}

/// Bundle ids are reverse-DNS names. Anything else could break out of the
/// quoted string in a script, so it is refused.
fn is_script_safe(bundle: &BrowserId) -> bool {
    bundle
        .as_str()
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

/// Program and arguments that open `url` in the app with this bundle id.
#[must_use]
pub fn open_command(bundle: &BrowserId, url: &TabUrl) -> (&'static str, Vec<String>) {
    (
        "open",
        vec!["-b".to_owned(), bundle.to_string(), url.to_string()],
    )
}

/// Reads an app's `Info.plist` and returns it as a browser when it handles
/// `http` or `https` links.
#[must_use]
pub fn browser_from_info_plist(info: &Value) -> Option<BrowserInfo> {
    let info = info.as_dictionary()?;
    let text = |key: &str| info.get(key).and_then(Value::as_string);
    let handles_web = info
        .get("CFBundleURLTypes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|url_type| {
            url_type
                .as_dictionary()?
                .get("CFBundleURLSchemes")?
                .as_array()
        })
        .flatten()
        .filter_map(Value::as_string)
        .any(|scheme| scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https"));
    if !handles_web {
        return None;
    }
    let id = BrowserId::parse(text("CFBundleIdentifier")?).ok()?;
    let name = text("CFBundleDisplayName")
        .or_else(|| text("CFBundleName"))
        .unwrap_or(id.as_str())
        .to_owned();
    Some(BrowserInfo {
        kind: BrowserKind::from_id(&id),
        name,
        id,
        launch: Launch::MacBundle,
    })
}

/// The `http` handler in the Launch Services preferences
/// (`com.apple.launchservices.secure.plist`).
#[must_use]
pub fn default_from_launch_services(prefs: &Value) -> Option<BrowserId> {
    prefs
        .as_dictionary()?
        .get("LSHandlers")?
        .as_array()?
        .iter()
        .filter_map(Value::as_dictionary)
        .find(|handler| {
            handler
                .get("LSHandlerURLScheme")
                .and_then(Value::as_string)
                .is_some_and(|scheme| scheme.eq_ignore_ascii_case("http"))
        })
        .and_then(|handler| handler.get("LSHandlerRoleAll")?.as_string())
        .and_then(|id| BrowserId::parse(id).ok())
}

/// Focuses tabs by running AppleScripts.
#[derive(Debug)]
pub struct ScriptFocuser<R> {
    runner: R,
}

impl<R: ScriptRunner> ScriptFocuser<R> {
    /// A focuser that runs scripts with `runner`.
    pub const fn new(runner: R) -> Self {
        Self { runner }
    }
}

impl<R: ScriptRunner> TabFocuser for ScriptFocuser<R> {
    fn focus(&self, browser: &BrowserInfo, url: &TabUrl) -> Result<Focus> {
        let Some(list) = list_tabs_script(browser.kind, &browser.id) else {
            return Ok(Focus::NotFound);
        };
        let listing = self.runner.run(&list)?;
        let Some(position) = find_tab(&listing, url) else {
            return Ok(Focus::NotFound);
        };
        let Some(focus) = focus_tab_script(browser.kind, &browser.id, position) else {
            return Ok(Focus::NotFound);
        };
        self.runner.run(&focus)?;
        Ok(Focus::Focused)
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;

    fn id(raw: &str) -> BrowserId {
        BrowserId::parse(raw).expect("id")
    }

    fn plist(xml: &str) -> Value {
        Value::from_reader_xml(xml.as_bytes()).expect("plist")
    }

    fn info_plist(bundle: &str, name: &str, schemes: &str) -> Value {
        plist(&format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>{bundle}</string>
  <key>CFBundleName</key><string>{name}</string>
  <key>CFBundleURLTypes</key><array><dict>
    <key>CFBundleURLSchemes</key><array>{schemes}</array>
  </dict></array>
</dict></plist>"#
        ))
    }

    #[test]
    fn chromium_listing_script_snapshot() {
        let script = list_tabs_script(BrowserKind::Chromium, &id("com.google.Chrome"));
        insta::assert_snapshot!(script.expect("script"));
    }

    #[test]
    fn safari_listing_script_snapshot() {
        let script = list_tabs_script(BrowserKind::Safari, &id("com.apple.Safari"));
        insta::assert_snapshot!(script.expect("script"));
    }

    #[test]
    fn chromium_focus_script_snapshot() {
        let position = TabPosition { window: 2, tab: 5 };
        let script = focus_tab_script(BrowserKind::Chromium, &id("com.brave.Browser"), position);
        insta::assert_snapshot!(script.expect("script"));
    }

    #[test]
    fn safari_focus_script_snapshot() {
        let position = TabPosition { window: 1, tab: 3 };
        let script = focus_tab_script(BrowserKind::Safari, &id("com.apple.Safari"), position);
        insta::assert_snapshot!(script.expect("script"));
    }

    #[test]
    fn listing_script_only_talks_to_a_running_browser() {
        let script =
            list_tabs_script(BrowserKind::Chromium, &id("com.google.Chrome")).expect("script");

        assert!(script.contains(r#"application id "com.google.Chrome" is running"#));
    }

    #[test]
    fn no_scripts_for_firefox_or_unsafe_ids() {
        assert!(list_tabs_script(BrowserKind::Firefox, &id("org.mozilla.firefox")).is_none());
        assert!(
            list_tabs_script(BrowserKind::Chromium, &id(r#"x" & do shell script "rm"#)).is_none()
        );
        let position = TabPosition { window: 1, tab: 1 };
        assert!(focus_tab_script(BrowserKind::Other, &id("org.example"), position).is_none());
    }

    #[test]
    fn open_command_uses_bundle_id() {
        let url = TabUrl::parse("https://a.dev/x").expect("url");

        let (program, args) = open_command(&id("com.google.Chrome"), &url);

        assert_eq!(program, "open");
        assert_eq!(args, ["-b", "com.google.Chrome", "https://a.dev/x"]);
    }

    #[test]
    fn app_handling_http_is_a_browser() {
        let info = info_plist(
            "com.brave.Browser",
            "Brave Browser",
            "<string>http</string><string>https</string>",
        );

        let browser = browser_from_info_plist(&info).expect("browser");

        assert_eq!(browser.id.as_str(), "com.brave.Browser");
        assert_eq!(browser.name, "Brave Browser");
        assert_eq!(browser.kind, BrowserKind::Chromium);
        assert_eq!(browser.launch, Launch::MacBundle);
    }

    #[test]
    fn display_name_wins_over_bundle_name() {
        let info = plist(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.google.Chrome</string>
  <key>CFBundleName</key><string>Chrome</string>
  <key>CFBundleDisplayName</key><string>Google Chrome</string>
  <key>CFBundleURLTypes</key><array><dict>
    <key>CFBundleURLSchemes</key><array><string>HTTPS</string></array>
  </dict></array>
</dict></plist>"#,
        );

        assert_eq!(
            browser_from_info_plist(&info).expect("browser").name,
            "Google Chrome"
        );
    }

    #[test]
    fn app_without_web_schemes_is_not_a_browser() {
        let info = info_plist(
            "com.tinyspeck.slackmacgap",
            "Slack",
            "<string>slack</string>",
        );

        assert!(browser_from_info_plist(&info).is_none());
    }

    #[test]
    fn reads_default_browser_from_launch_services() {
        let prefs = plist(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>LSHandlers</key><array>
  <dict><key>LSHandlerContentType</key><string>public.html</string>
        <key>LSHandlerRoleAll</key><string>com.apple.safari</string></dict>
  <dict><key>LSHandlerURLScheme</key><string>http</string>
        <key>LSHandlerRoleAll</key><string>org.mozilla.firefox</string></dict>
</array></dict></plist>"#,
        );

        assert_eq!(
            default_from_launch_services(&prefs),
            Some(id("org.mozilla.firefox"))
        );
    }

    #[test]
    fn no_default_when_http_handler_is_missing() {
        let prefs = plist(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>LSHandlers</key><array/></dict></plist>"#,
        );

        assert_eq!(default_from_launch_services(&prefs), None);
    }

    struct FakeRunner {
        listing: &'static str,
        scripts: RefCell<Vec<String>>,
    }

    impl ScriptRunner for FakeRunner {
        fn run(&self, script: &str) -> Result<String> {
            self.scripts.borrow_mut().push(script.to_owned());
            Ok(if self.scripts.borrow().len() == 1 {
                self.listing.to_owned()
            } else {
                String::new()
            })
        }
    }

    fn chrome() -> BrowserInfo {
        BrowserInfo {
            id: id("com.google.Chrome"),
            name: "Google Chrome".into(),
            kind: BrowserKind::Chromium,
            launch: Launch::MacBundle,
        }
    }

    #[test]
    fn focuser_focuses_the_matching_tab() {
        let runner = FakeRunner {
            listing: "1\t1\thttps://b.dev/\n2\t3\thttps://a.dev/x#top\n",
            scripts: RefCell::default(),
        };
        let focuser = ScriptFocuser::new(runner);

        let focus = focuser
            .focus(&chrome(), &TabUrl::parse("https://a.dev/x").expect("url"))
            .expect("focus");

        assert_eq!(focus, Focus::Focused);
        let scripts = focuser.runner.scripts.borrow();
        assert_eq!(scripts.len(), 2);
        assert!(scripts[1].contains("active tab index of window 2 to 3"));
    }

    #[test]
    fn focuser_reports_not_found_without_a_second_script() {
        let runner = FakeRunner {
            listing: "",
            scripts: RefCell::default(),
        };
        let focuser = ScriptFocuser::new(runner);

        let focus = focuser
            .focus(&chrome(), &TabUrl::parse("https://a.dev/x").expect("url"))
            .expect("focus");

        assert_eq!(focus, Focus::NotFound);
        assert_eq!(focuser.runner.scripts.borrow().len(), 1);
    }
}
