//! Validated tab URLs and the key used to find an already open tab.

use std::fmt;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use url::Url;

/// A URL a tab can point to. Only `http` and `https` are accepted.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct TabUrl(Url);

/// Error returned when a string is not a usable tab URL.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum TabUrlError {
    /// The text could not be parsed as a URL.
    #[error("invalid url: {0}")]
    Invalid(String),
    /// The URL uses a scheme other than http or https.
    #[error("unsupported url scheme `{0}`, only http and https are allowed")]
    UnsupportedScheme(String),
}

impl TabUrl {
    /// Parses a tab URL. Surrounding whitespace is ignored.
    ///
    /// # Errors
    ///
    /// Returns [`TabUrlError::Invalid`] when the text is not a URL and
    /// [`TabUrlError::UnsupportedScheme`] when it is not http or https.
    pub fn parse(raw: &str) -> Result<Self, TabUrlError> {
        let url = Url::parse(raw.trim()).map_err(|err| TabUrlError::Invalid(err.to_string()))?;
        match url.scheme() {
            "http" | "https" => Ok(Self(url)),
            other => Err(TabUrlError::UnsupportedScheme(other.to_owned())),
        }
    }

    /// The URL as a string slice.
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    /// Key used to decide whether two URLs point to the same open tab.
    ///
    /// Drops the `#fragment` and a trailing `/` on the path, so
    /// `https://a.dev/docs/` and `https://a.dev/docs#intro` match.
    #[must_use]
    pub fn match_key(&self) -> String {
        let mut url = self.0.clone();
        url.set_fragment(None);
        let path = url.path();
        if path.len() > 1 && path.ends_with('/') {
            let trimmed = path.trim_end_matches('/').to_owned();
            url.set_path(&trimmed);
        }
        url.into()
    }
}

impl TryFrom<String> for TabUrl {
    type Error = TabUrlError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl From<TabUrl> for String {
    fn from(value: TabUrl) -> Self {
        value.0.into()
    }
}

impl fmt::Display for TabUrl {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(raw: &str) -> TabUrl {
        TabUrl::parse(raw).expect("valid test url")
    }

    #[test]
    fn parse_accepts_https_and_trims() {
        assert_eq!(
            url("  https://example.com/a  ").as_str(),
            "https://example.com/a"
        );
    }

    #[test]
    fn parse_rejects_other_schemes() {
        assert_eq!(
            TabUrl::parse("file:///etc/passwd"),
            Err(TabUrlError::UnsupportedScheme("file".into()))
        );
        assert!(matches!(
            TabUrl::parse("javascript:alert(1)"),
            Err(TabUrlError::UnsupportedScheme(_))
        ));
    }

    #[test]
    fn parse_rejects_text_that_is_not_a_url() {
        assert!(matches!(
            TabUrl::parse("not a url"),
            Err(TabUrlError::Invalid(_))
        ));
    }

    #[test]
    fn match_key_ignores_fragment_and_trailing_slash() {
        assert_eq!(
            url("https://a.dev/docs/").match_key(),
            url("https://a.dev/docs#intro").match_key()
        );
    }

    #[test]
    fn match_key_ignores_host_case() {
        assert_eq!(
            url("https://GitHub.com/x").match_key(),
            url("https://github.com/x").match_key()
        );
    }

    #[test]
    fn match_key_keeps_query() {
        assert_ne!(
            url("https://a.dev/search?q=rust").match_key(),
            url("https://a.dev/search?q=tauri").match_key()
        );
    }

    #[test]
    fn match_key_keeps_root_path() {
        assert_eq!(url("https://a.dev").match_key(), "https://a.dev/");
    }

    #[test]
    fn deserializing_rejects_unsupported_scheme() {
        let result: Result<TabUrl, _> = serde_json::from_str("\"ftp://a.dev\"");
        assert!(result.is_err());
    }

    mod props {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            #[test]
            fn match_key_is_stable_under_any_fragment(path in "[a-z]{1,8}(/[a-z]{1,8}){0,3}", frag in "[a-z0-9]{0,10}") {
                let plain = url(&format!("https://a.dev/{path}"));
                let with_fragment = url(&format!("https://a.dev/{path}#{frag}"));
                prop_assert_eq!(plain.match_key(), with_fragment.match_key());
            }
        }
    }
}
