//! User-defined statuses (To do, In progress, …) and their accent colors.

use std::fmt;

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// The ten Catppuccin accents a status or group can use.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AccentColor {
    /// Lavender.
    Lavender,
    /// Blue.
    #[default]
    Blue,
    /// Sky.
    Sky,
    /// Teal.
    Teal,
    /// Green.
    Green,
    /// Yellow.
    Yellow,
    /// Peach.
    Peach,
    /// Red.
    Red,
    /// Pink.
    Pink,
    /// Mauve.
    Mauve,
}

/// Identifier of a status, such as `in-progress`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct StatusId(String);

/// Error returned when a [`StatusId`] cannot be parsed.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum StatusIdError {
    /// The id was empty or only whitespace.
    #[error("status id is empty")]
    Empty,
}

impl StatusId {
    /// Parses a status id, trimming surrounding whitespace.
    ///
    /// # Errors
    ///
    /// Returns [`StatusIdError::Empty`] when the id is empty after trimming.
    pub fn parse(raw: &str) -> Result<Self, StatusIdError> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(StatusIdError::Empty);
        }
        Ok(Self(trimmed.to_owned()))
    }

    /// The id as a string slice.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for StatusId {
    type Error = StatusIdError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl From<StatusId> for String {
    fn from(value: StatusId) -> Self {
        value.0
    }
}

impl fmt::Display for StatusId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A status tabs and folders can be marked with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Status {
    /// Stable id.
    pub id: StatusId,
    /// Name shown in the UI.
    pub label: String,
    /// Accent color.
    pub color: AccentColor,
}

/// The statuses a new workspace starts with: only "To do". Users add the
/// ones they actually need.
#[must_use]
pub fn default_statuses() -> Vec<Status> {
    vec![Status {
        id: StatusId("todo".to_owned()),
        label: "To do".to_owned(),
        color: AccentColor::Lavender,
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_trims_and_rejects_blank() {
        assert_eq!(
            StatusId::parse(" in-progress ").map(|id| id.as_str().to_owned()),
            Ok("in-progress".to_owned())
        );
        assert_eq!(StatusId::parse(""), Err(StatusIdError::Empty));
    }

    #[test]
    fn new_workspaces_start_with_only_to_do() {
        let ids: Vec<_> = default_statuses()
            .into_iter()
            .map(|status| status.id.as_str().to_owned())
            .collect();
        assert_eq!(ids, ["todo"]);
    }

    #[test]
    fn default_status_is_lavender_to_do() {
        let statuses = default_statuses();

        assert_eq!(statuses.len(), 1);
        assert_eq!(
            (statuses[0].label.as_str(), statuses[0].color),
            ("To do", AccentColor::Lavender)
        );
    }

    #[test]
    fn accent_color_serializes_in_camel_case() {
        let json = serde_json::to_string(&AccentColor::Lavender).expect("serialize");
        assert_eq!(json, "\"lavender\"");
    }
}
