//! Stable identifier of an installed browser.

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

#[cfg(test)]
mod tests {
    use super::*;

    fn id(raw: &str) -> BrowserId {
        BrowserId::parse(raw).expect("valid test id")
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
}
