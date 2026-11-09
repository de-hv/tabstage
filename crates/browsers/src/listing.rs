//! Parses the tab list a browser reports and finds a tab by URL.
//!
//! The AppleScripts in [`crate::macos`] print one line per tab:
//! `window<TAB>tab<TAB>url`, with 1-based indices.

use tabstage_core::TabUrl;

/// Where a tab is inside a browser, as 1-based AppleScript indices.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TabPosition {
    /// Window index.
    pub window: u32,
    /// Tab index inside the window.
    pub tab: u32,
}

/// Parses `window<TAB>tab<TAB>url` lines, skipping lines that do not fit.
#[must_use]
pub fn parse_listing(text: &str) -> Vec<(TabPosition, &str)> {
    text.lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let window = parts.next()?.trim().parse().ok()?;
            let tab = parts.next()?.trim().parse().ok()?;
            let url = parts.next()?.trim();
            (!url.is_empty()).then_some((TabPosition { window, tab }, url))
        })
        .collect()
}

/// The first listed tab whose URL matches `url` (ignoring the fragment and
/// a trailing slash). Non-web tabs such as `chrome://newtab` never match.
#[must_use]
pub fn find_tab(text: &str, url: &TabUrl) -> Option<TabPosition> {
    let wanted = url.match_key();
    parse_listing(text).into_iter().find_map(|(position, raw)| {
        TabUrl::parse(raw)
            .ok()
            .filter(|candidate| candidate.match_key() == wanted)
            .map(|_| position)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const LISTING: &str = "1\t1\tchrome://newtab/\n\
                           1\t2\thttps://a.dev/docs/#intro\n\
                           garbage line\n\
                           2\t1\thttps://b.dev/\n\
                           2\t2\thttps://a.dev/docs\n";

    fn url(raw: &str) -> TabUrl {
        TabUrl::parse(raw).expect("url")
    }

    #[test]
    fn parses_valid_lines_and_skips_the_rest() {
        let tabs = parse_listing(LISTING);

        assert_eq!(tabs.len(), 4);
        assert_eq!(
            tabs[1],
            (
                TabPosition { window: 1, tab: 2 },
                "https://a.dev/docs/#intro"
            )
        );
    }

    #[test]
    fn handles_crlf_and_empty_output() {
        assert!(parse_listing("").is_empty());
        assert_eq!(
            parse_listing("3\t4\thttps://c.dev\r\n"),
            [(TabPosition { window: 3, tab: 4 }, "https://c.dev")]
        );
    }

    #[test]
    fn finds_first_tab_with_matching_url() {
        assert_eq!(
            find_tab(LISTING, &url("https://a.dev/docs")),
            Some(TabPosition { window: 1, tab: 2 })
        );
    }

    #[test]
    fn returns_none_when_no_tab_matches() {
        assert_eq!(find_tab(LISTING, &url("https://c.dev")), None);
    }
}
