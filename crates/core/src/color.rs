//! Accent colors a group can use.

use serde::{Deserialize, Serialize};

/// The ten Catppuccin accents a group can use.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accent_color_serializes_in_camel_case() {
        let json = serde_json::to_string(&AccentColor::Lavender).expect("serialize");
        assert_eq!(json, r#""lavender""#);
    }
}
