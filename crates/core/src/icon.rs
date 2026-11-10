//! Custom icons for groups, folders and tabs. Without one, the UI shows the
//! default icon of the item's kind.

use serde::{Deserialize, Serialize};
use thiserror::Error;
use unicode_segmentation::UnicodeSegmentation;

/// Longest text icon, in user-perceived characters.
pub const MAX_TEXT_ICON: usize = 3;

/// Longest icon-set name.
const MAX_SYMBOL: usize = 64;

/// A custom icon.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "RawIcon", into = "RawIcon")]
pub enum Icon {
    /// One emoji, such as `🧪`.
    Emoji(String),
    /// The name of an icon in the UI's icon set, such as `git-pull-request`.
    Symbol(String),
    /// Up to [`MAX_TEXT_ICON`] characters, such as `142` or `★`.
    Text(String),
}

/// Error returned for an icon that cannot be shown.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum IconError {
    /// An emoji icon must be exactly one emoji.
    #[error("an emoji icon must be a single emoji")]
    Emoji,
    /// Icon-set names are lowercase letters, digits and dashes.
    #[error("`{0}` is not an icon name")]
    Symbol(String),
    /// Text icons are 1 to 3 visible characters.
    #[error("a text icon must be 1 to {MAX_TEXT_ICON} visible characters")]
    Text,
}

impl Icon {
    /// An emoji icon.
    ///
    /// # Errors
    ///
    /// [`IconError::Emoji`] unless `value` is one visible grapheme that is
    /// not a letter or digit.
    pub fn emoji(value: &str) -> Result<Self, IconError> {
        let value = value.trim();
        let mut graphemes = value.graphemes(true);
        match (graphemes.next(), graphemes.next()) {
            (Some(one), None) if visible(one) && !one.chars().all(char::is_alphanumeric) => {
                Ok(Self::Emoji(value.to_owned()))
            }
            _ => Err(IconError::Emoji),
        }
    }

    /// An icon from the UI's icon set.
    ///
    /// # Errors
    ///
    /// [`IconError::Symbol`] unless `name` is 1 to 64 lowercase letters,
    /// digits and dashes that starts with a letter.
    pub fn symbol(name: &str) -> Result<Self, IconError> {
        let valid = name.len() <= MAX_SYMBOL
            && name.starts_with(|c: char| c.is_ascii_lowercase())
            && name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        if valid {
            Ok(Self::Symbol(name.to_owned()))
        } else {
            Err(IconError::Symbol(name.to_owned()))
        }
    }

    /// A short text icon.
    ///
    /// # Errors
    ///
    /// [`IconError::Text`] unless `value` is 1 to [`MAX_TEXT_ICON`]
    /// graphemes with no whitespace or control characters.
    pub fn text(value: &str) -> Result<Self, IconError> {
        let value = value.trim();
        let count = value.graphemes(true).count();
        if (1..=MAX_TEXT_ICON).contains(&count) && value.graphemes(true).all(visible) {
            Ok(Self::Text(value.to_owned()))
        } else {
            Err(IconError::Text)
        }
    }
}

fn visible(grapheme: &str) -> bool {
    !grapheme
        .chars()
        .any(|c| c.is_whitespace() || c.is_control())
}

/// The JSON shape: `{"kind": "emoji", "value": "🧪"}`.
#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
enum RawIcon {
    Emoji(String),
    Symbol(String),
    Text(String),
}

impl TryFrom<RawIcon> for Icon {
    type Error = IconError;

    fn try_from(raw: RawIcon) -> Result<Self, Self::Error> {
        match raw {
            RawIcon::Emoji(value) => Self::emoji(&value),
            RawIcon::Symbol(name) => Self::symbol(&name),
            RawIcon::Text(value) => Self::text(&value),
        }
    }
}

impl From<Icon> for RawIcon {
    fn from(icon: Icon) -> Self {
        match icon {
            Icon::Emoji(value) => Self::Emoji(value),
            Icon::Symbol(name) => Self::Symbol(name),
            Icon::Text(value) => Self::Text(value),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emoji_is_one_grapheme_even_when_it_has_several_code_points() {
        assert_eq!(Icon::emoji("🧪"), Ok(Icon::Emoji("🧪".into())));
        assert_eq!(Icon::emoji(" 👩‍💻 "), Ok(Icon::Emoji("👩‍💻".into())));
        assert_eq!(Icon::emoji("🇨🇴"), Ok(Icon::Emoji("🇨🇴".into())));
    }

    #[test]
    fn emoji_rejects_empty_several_or_plain_letters() {
        assert_eq!(Icon::emoji(""), Err(IconError::Emoji));
        assert_eq!(Icon::emoji("🧪🚀"), Err(IconError::Emoji));
        assert_eq!(Icon::emoji("a"), Err(IconError::Emoji));
    }

    #[test]
    fn symbol_names_are_kebab_case() {
        assert_eq!(
            Icon::symbol("git-pull-request"),
            Ok(Icon::Symbol("git-pull-request".into()))
        );
        assert!(Icon::symbol("Bug").is_err());
        assert!(Icon::symbol("1password").is_err());
        assert!(Icon::symbol("").is_err());
        assert!(Icon::symbol(&"a".repeat(65)).is_err());
    }

    #[test]
    fn text_is_one_to_three_visible_characters() {
        assert_eq!(Icon::text("142"), Ok(Icon::Text("142".into())));
        assert_eq!(Icon::text("★"), Ok(Icon::Text("★".into())));
        assert_eq!(Icon::text(" QA "), Ok(Icon::Text("QA".into())));
        assert_eq!(Icon::text("ñé✓"), Ok(Icon::Text("ñé✓".into())));
        assert_eq!(Icon::text("1234"), Err(IconError::Text));
        assert_eq!(Icon::text("a b"), Err(IconError::Text));
        assert_eq!(Icon::text(""), Err(IconError::Text));
        assert_eq!(Icon::text("a\u{7}"), Err(IconError::Text));
    }

    #[test]
    fn serializes_as_kind_and_value_and_validates_on_read() {
        let json = serde_json::to_string(&Icon::Emoji("🧪".into())).expect("json");
        assert_eq!(json, r#"{"kind":"emoji","value":"🧪"}"#);
        let back: Icon = serde_json::from_str(r#"{"kind":"text","value":"QA"}"#).expect("read");
        assert_eq!(back, Icon::Text("QA".into()));
        assert!(serde_json::from_str::<Icon>(r#"{"kind":"text","value":"toolong"}"#).is_err());
    }
}
