//! Linux support: browsers from freedesktop `.desktop` entries.
//!
//! Pure parsing only; [`crate::system`] reads the files and runs commands.

use std::collections::HashSet;

use tabstage_core::BrowserId;

use crate::{BrowserError, BrowserInfo, BrowserKind, Launch, Result};

/// The fields of a `[Desktop Entry]` group the app needs.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DesktopEntry {
    /// `Name` (unlocalized).
    pub name: String,
    /// `Exec` command line.
    pub exec: String,
    /// `MimeType` list.
    pub mime_types: Vec<String>,
    /// `NoDisplay=true`.
    pub no_display: bool,
    /// `Hidden=true`.
    pub hidden: bool,
}

/// Parses the `[Desktop Entry]` group of a `.desktop` file. Returns `None`
/// when the group, `Name` or `Exec` is missing.
#[must_use]
pub fn parse_desktop_entry(text: &str) -> Option<DesktopEntry> {
    let mut entry = DesktopEntry::default();
    let mut in_main_group = false;
    for line in text.lines().map(str::trim) {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') {
            in_main_group = line == "[Desktop Entry]";
            continue;
        }
        if !in_main_group {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = value.trim();
        match key.trim() {
            "Name" => value.clone_into(&mut entry.name),
            "Exec" => value.clone_into(&mut entry.exec),
            "MimeType" => {
                entry.mime_types = value
                    .split(';')
                    .filter(|mime| !mime.is_empty())
                    .map(str::to_owned)
                    .collect();
            }
            "NoDisplay" => entry.no_display = value == "true",
            "Hidden" => entry.hidden = value == "true",
            _ => {}
        }
    }
    (!entry.name.is_empty() && !entry.exec.is_empty()).then_some(entry)
}

/// The entry as a browser when it handles `http` links and is visible.
#[must_use]
pub fn browser_from_entry(desktop_id: &str, entry: &DesktopEntry) -> Option<BrowserInfo> {
    let handles_web = entry
        .mime_types
        .iter()
        .any(|mime| mime == "x-scheme-handler/http" || mime == "x-scheme-handler/https");
    if entry.hidden || entry.no_display || !handles_web {
        return None;
    }
    let id = BrowserId::parse(desktop_id).ok()?;
    Some(BrowserInfo {
        kind: BrowserKind::from_id(&id),
        name: entry.name.clone(),
        id,
        launch: Launch::DesktopExec(entry.exec.clone()),
    })
}

/// Browsers from `(desktop id, file contents)` pairs in XDG precedence
/// order: the first entry with a given id wins, even when it is hidden.
/// Sorted by name.
#[must_use]
pub fn catalog<I, S>(entries: I) -> Vec<BrowserInfo>
where
    I: IntoIterator<Item = (S, String)>,
    S: AsRef<str>,
{
    let mut seen = HashSet::new();
    let mut browsers: Vec<_> = entries
        .into_iter()
        .filter(|(id, _)| seen.insert(id.as_ref().to_owned()))
        .filter_map(|(id, text)| {
            let entry = parse_desktop_entry(&text)?;
            browser_from_entry(id.as_ref(), &entry)
        })
        .collect();
    browsers.sort_by_key(|browser| browser.name.to_lowercase());
    browsers
}

/// Arguments to run an `Exec` line with `url`.
///
/// Expands `%u`, `%U`, `%f` and `%F` to the URL, `%%` to `%`, drops the
/// other field codes, and appends the URL when the line has no field code
/// for it. Honors double quotes and backslash escapes.
///
/// # Errors
///
/// [`BrowserError::BadExec`] for an empty line or an unclosed quote.
pub fn exec_args(exec: &str, url: &str) -> Result<Vec<String>> {
    let bad = || BrowserError::BadExec(exec.to_owned());
    let mut args = Vec::new();
    let mut used_url = false;
    for token in split_exec(exec).ok_or_else(bad)? {
        match token.as_str() {
            "%u" | "%U" | "%f" | "%F" => {
                args.push(url.to_owned());
                used_url = true;
            }
            "%i" | "%c" | "%k" => {}
            _ => {
                let expanded = expand_field_codes(&token, url, &mut used_url);
                if !expanded.is_empty() {
                    args.push(expanded);
                }
            }
        }
    }
    if args.is_empty() {
        return Err(bad());
    }
    if !used_url {
        args.push(url.to_owned());
    }
    Ok(args)
}

/// Splits an `Exec` line into arguments. `None` on an unclosed quote.
fn split_exec(exec: &str) -> Option<Vec<String>> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_token = false;
    let mut quoted = false;
    let mut chars = exec.chars();
    while let Some(c) = chars.next() {
        match (quoted, c) {
            (true, '"') => quoted = false,
            (true, '\\') => current.push(chars.next()?),
            (true, _) => current.push(c),
            (false, '"') => {
                quoted = true;
                in_token = true;
            }
            (false, ' ' | '\t') => {
                if in_token {
                    args.push(std::mem::take(&mut current));
                    in_token = false;
                }
            }
            (false, _) => {
                current.push(c);
                in_token = true;
            }
        }
    }
    if quoted {
        return None;
    }
    if in_token {
        args.push(current);
    }
    Some(args)
}

/// Expands field codes inside one argument, such as `--url=%u` or `100%%`.
fn expand_field_codes(arg: &str, url: &str, used_url: &mut bool) -> String {
    let mut out = String::with_capacity(arg.len());
    let mut chars = arg.chars();
    while let Some(c) = chars.next() {
        if c != '%' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('%') => out.push('%'),
            Some('u' | 'U' | 'f' | 'F') => {
                out.push_str(url);
                *used_url = true;
            }
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIREFOX: &str = "[Desktop Entry]
Version=1.0
Name=Firefox
Name[es]=Firefox es
Exec=firefox %u
MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;
Type=Application

[Desktop Action new-window]
Name=New Window
Exec=firefox --new-window %u
";

    #[test]
    fn parses_main_group_and_ignores_actions_and_locales() {
        let entry = parse_desktop_entry(FIREFOX).expect("entry");

        assert_eq!(entry.name, "Firefox");
        assert_eq!(entry.exec, "firefox %u");
        assert_eq!(
            entry.mime_types,
            [
                "text/html",
                "x-scheme-handler/http",
                "x-scheme-handler/https"
            ]
        );
        assert!(!entry.no_display);
    }

    #[test]
    fn entry_without_exec_is_ignored() {
        assert!(parse_desktop_entry("[Desktop Entry]\nName=X\n").is_none());
    }

    #[test]
    fn http_handler_becomes_a_browser() {
        let entry = parse_desktop_entry(FIREFOX).expect("entry");

        let browser = browser_from_entry("firefox.desktop", &entry).expect("browser");

        assert_eq!(browser.id.as_str(), "firefox.desktop");
        assert_eq!(browser.kind, BrowserKind::Firefox);
        assert_eq!(browser.launch, Launch::DesktopExec("firefox %u".into()));
    }

    #[test]
    fn hidden_or_non_web_entries_are_not_browsers() {
        let mut entry = parse_desktop_entry(FIREFOX).expect("entry");
        entry.no_display = true;
        assert!(browser_from_entry("firefox.desktop", &entry).is_none());

        let editor = parse_desktop_entry(
            "[Desktop Entry]\nName=Gedit\nExec=gedit %U\nMimeType=text/plain;\n",
        )
        .expect("entry");
        assert!(browser_from_entry("gedit.desktop", &editor).is_none());
    }

    #[test]
    fn catalog_keeps_first_entry_per_id_and_sorts_by_name() {
        let user_override = "[Desktop Entry]\nName=Firefox\nExec=firefox %u\nHidden=true\n";
        let chrome = "[Desktop Entry]\nName=Google Chrome\nExec=google-chrome-stable %U\nMimeType=x-scheme-handler/http;\n";
        let brave = "[Desktop Entry]\nName=Brave\nExec=brave %U\nMimeType=x-scheme-handler/http;\n";

        let browsers = catalog([
            ("firefox.desktop", user_override.to_owned()),
            ("google-chrome.desktop", chrome.to_owned()),
            ("firefox.desktop", FIREFOX.to_owned()),
            ("brave-browser.desktop", brave.to_owned()),
        ]);

        let names: Vec<_> = browsers.iter().map(|b| b.name.as_str()).collect();
        assert_eq!(names, ["Brave", "Google Chrome"]);
    }

    #[test]
    fn exec_replaces_url_field_codes() {
        assert_eq!(
            exec_args("firefox %u", "https://a.dev").expect("args"),
            ["firefox", "https://a.dev"]
        );
        assert_eq!(
            exec_args("/usr/bin/google-chrome-stable %U", "https://a.dev").expect("args"),
            ["/usr/bin/google-chrome-stable", "https://a.dev"]
        );
    }

    #[test]
    fn exec_keeps_flatpak_markers_and_drops_other_codes() {
        assert_eq!(
            exec_args(
                "flatpak run --command=brave com.brave.Browser @@u %U @@ %i %c",
                "https://a.dev"
            )
            .expect("args"),
            [
                "flatpak",
                "run",
                "--command=brave",
                "com.brave.Browser",
                "@@u",
                "https://a.dev",
                "@@"
            ]
        );
    }

    #[test]
    fn exec_honors_quotes_and_percent_escape() {
        assert_eq!(
            exec_args(
                r#""/opt/My Browser/browser" --title=100%% %u"#,
                "https://a.dev"
            )
            .expect("args"),
            ["/opt/My Browser/browser", "--title=100%", "https://a.dev"]
        );
    }

    #[test]
    fn exec_appends_url_without_field_code() {
        assert_eq!(
            exec_args("epiphany", "https://a.dev").expect("args"),
            ["epiphany", "https://a.dev"]
        );
    }

    #[test]
    fn exec_rejects_empty_or_unclosed_quote() {
        assert!(matches!(
            exec_args("  ", "u"),
            Err(BrowserError::BadExec(_))
        ));
        assert!(matches!(
            exec_args(r#""/opt/x %u"#, "u"),
            Err(BrowserError::BadExec(_))
        ));
    }
}
