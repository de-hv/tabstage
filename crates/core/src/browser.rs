//! Which browser opens a group's tabs.
//!
//! Every group either follows the workspace default browser or has one
//! assigned. [`effective_browser`] resolves that choice against the browsers
//! installed on this machine.

use std::collections::BTreeSet;
use std::fmt;

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Stable identifier of an installed browser.
///
/// On macOS this is the bundle id (`com.google.Chrome`); on Linux it is the
/// desktop entry id (`firefox.desktop`).
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct BrowserId(String);

/// Error returned when a [`BrowserId`] cannot be parsed.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum BrowserIdError {
    /// The id was empty or only whitespace.
    #[error("browser id is empty")]
    Empty,
}

impl BrowserId {
    /// Parses a browser id, trimming surrounding whitespace.
    ///
    /// # Errors
    ///
    /// Returns [`BrowserIdError::Empty`] when the id is empty after trimming.
    pub fn parse(raw: &str) -> Result<Self, BrowserIdError> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(BrowserIdError::Empty);
        }
        Ok(Self(trimmed.to_owned()))
    }

    /// The id as a string slice.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for BrowserId {
    type Error = BrowserIdError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl From<BrowserId> for String {
    fn from(value: BrowserId) -> Self {
        value.0
    }
}

impl fmt::Display for BrowserId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// The browser a group asks for.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "browser", rename_all = "camelCase")]
pub enum BrowserChoice {
    /// Follow the workspace default browser.
    #[default]
    Default,
    /// Always use this browser.
    Specific(BrowserId),
}

/// The browser that will actually open a group, and why.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resolved<'a> {
    /// The group follows the default browser.
    Default(&'a BrowserId),
    /// The group's assigned browser is installed and will be used.
    Assigned(&'a BrowserId),
    /// The assigned browser is not installed, so the default is used instead.
    Fallback {
        /// The browser the group asked for.
        wanted: &'a BrowserId,
        /// The default browser used in its place.
        used: &'a BrowserId,
    },
}

impl<'a> Resolved<'a> {
    /// The browser that will open the tabs.
    #[must_use]
    pub fn browser(&self) -> &'a BrowserId {
        match *self {
            Self::Default(id) | Self::Assigned(id) | Self::Fallback { used: id, .. } => id,
        }
    }

    /// Whether the group's assigned browser was replaced by the default.
    #[must_use]
    pub fn is_fallback(&self) -> bool {
        matches!(self, Self::Fallback { .. })
    }
}

/// Resolves which browser opens a group.
///
/// A group that follows the default always gets `default`. A group with an
/// assigned browser gets it when it is in `installed`, otherwise it falls
/// back to `default`.
#[must_use]
pub fn effective_browser<'a>(
    choice: &'a BrowserChoice,
    default: &'a BrowserId,
    installed: &BTreeSet<BrowserId>,
) -> Resolved<'a> {
    match choice {
        BrowserChoice::Default => Resolved::Default(default),
        BrowserChoice::Specific(wanted) if installed.contains(wanted) => Resolved::Assigned(wanted),
        BrowserChoice::Specific(wanted) => Resolved::Fallback {
            wanted,
            used: default,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(raw: &str) -> BrowserId {
        BrowserId::parse(raw).expect("valid test id")
    }

    fn installed(ids: &[&str]) -> BTreeSet<BrowserId> {
        ids.iter().map(|raw| id(raw)).collect()
    }

    #[test]
    fn parse_trims_whitespace() {
        assert_eq!(id("  com.google.Chrome ").as_str(), "com.google.Chrome");
    }

    #[test]
    fn parse_rejects_blank_id() {
        assert_eq!(BrowserId::parse("   "), Err(BrowserIdError::Empty));
    }

    #[test]
    fn deserializing_blank_id_fails() {
        let result: Result<BrowserId, _> = serde_json::from_str("\"\"");
        assert!(result.is_err());
    }

    #[test]
    fn group_following_default_uses_default_browser() {
        // Arrange
        let firefox = id("org.mozilla.firefox");
        let choice = BrowserChoice::Default;

        // Act
        let resolved = effective_browser(&choice, &firefox, &installed(&["org.mozilla.firefox"]));

        // Assert
        assert_eq!(resolved, Resolved::Default(&firefox));
        assert_eq!(resolved.browser(), &firefox);
        assert!(!resolved.is_fallback());
    }

    #[test]
    fn installed_assigned_browser_wins_over_default() {
        let firefox = id("org.mozilla.firefox");
        let choice = BrowserChoice::Specific(id("com.google.Chrome"));

        let resolved = effective_browser(
            &choice,
            &firefox,
            &installed(&["org.mozilla.firefox", "com.google.Chrome"]),
        );

        assert_eq!(resolved.browser().as_str(), "com.google.Chrome");
        assert!(matches!(resolved, Resolved::Assigned(_)));
    }

    #[test]
    fn missing_assigned_browser_falls_back_to_default() {
        let firefox = id("org.mozilla.firefox");
        let choice = BrowserChoice::Specific(id("com.brave.Browser"));

        let resolved = effective_browser(&choice, &firefox, &installed(&["org.mozilla.firefox"]));

        assert_eq!(resolved.browser(), &firefox);
        assert!(resolved.is_fallback());
        assert!(
            matches!(resolved, Resolved::Fallback { wanted, .. } if wanted.as_str() == "com.brave.Browser")
        );
    }

    #[test]
    fn choice_serializes_with_kind_tag() {
        let json = serde_json::to_string(&BrowserChoice::Specific(id("firefox.desktop")))
            .expect("serialize");
        assert_eq!(json, r#"{"kind":"specific","browser":"firefox.desktop"}"#);

        let json = serde_json::to_string(&BrowserChoice::Default).expect("serialize");
        assert_eq!(json, r#"{"kind":"default"}"#);
    }
}
