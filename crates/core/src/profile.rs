//! Tabstage profiles: named contexts such as "Work" or "Personal".
//!
//! A profile holds tickets and notes. Which browser it opens in is decided
//! on each machine, so it is not part of this synced model.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::ids::ProfileId;
use crate::workspace::{Note, Ticket};

/// Name of the profile a new or migrated workspace starts with.
pub const DEFAULT_PROFILE_NAME: &str = "Default";

/// How many colors a profile can take: hues evenly spaced around the wheel.
pub const PROFILE_COLORS: u8 = 20;

/// A color of a profile or status: one of the [`PROFILE_COLORS`] palette
/// colors, which adapt to light and dark mode, or a custom one.
///
/// Saved as the palette index (`7`) or as a hex string (`"#ff6a3d"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "ColorRepr", into = "ColorRepr")]
pub enum ProfileColor {
    /// Index in the palette.
    Palette(u8),
    /// A custom color as red, green and blue.
    Custom([u8; 3]),
}

impl Default for ProfileColor {
    fn default() -> Self {
        Self::Palette(0)
    }
}

/// Error returned for a color outside the palette or a malformed hex color.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ProfileColorError {
    /// The index is not below [`PROFILE_COLORS`].
    #[error("profile color {0} is outside the palette of {PROFILE_COLORS}")]
    OutOfPalette(u8),
    /// The text is not a `#rrggbb` color.
    #[error("{0:?} is not a #rrggbb color")]
    BadHex(String),
}

impl ProfileColor {
    /// The palette color at `index`.
    ///
    /// # Errors
    ///
    /// [`ProfileColorError::OutOfPalette`] when `index` is not below
    /// [`PROFILE_COLORS`].
    pub fn new(index: u8) -> Result<Self, ProfileColorError> {
        if index < PROFILE_COLORS {
            Ok(Self::Palette(index))
        } else {
            Err(ProfileColorError::OutOfPalette(index))
        }
    }

    /// A custom color from `#rrggbb` (the `#` is optional, case is ignored).
    ///
    /// # Errors
    ///
    /// [`ProfileColorError::BadHex`] when `text` is not six hex digits.
    pub fn from_hex(text: &str) -> Result<Self, ProfileColorError> {
        let bad = || ProfileColorError::BadHex(text.to_owned());
        let digits = text.trim().trim_start_matches('#');
        if digits.len() != 6 || !digits.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(bad());
        }
        let channel = |at: usize| u8::from_str_radix(&digits[at..at + 2], 16).map_err(|_| bad());
        Ok(Self::Custom([channel(0)?, channel(2)?, channel(4)?]))
    }

    /// Index in the palette; `None` for a custom color.
    #[must_use]
    pub const fn index(self) -> Option<u8> {
        match self {
            Self::Palette(index) => Some(index),
            Self::Custom(_) => None,
        }
    }

    /// The color for a new profile or status: the first palette color nobody
    /// uses, or the least used one when all are taken. Custom colors are
    /// ignored.
    #[must_use]
    pub fn next_after(used: impl IntoIterator<Item = Self>) -> Self {
        let mut counts = [0_usize; PROFILE_COLORS as usize];
        for index in used.into_iter().filter_map(Self::index) {
            counts[usize::from(index)] += 1;
        }
        // First of the least used, so an unused color always wins.
        let least = counts.iter().min().copied().unwrap_or(0);
        let index = counts.iter().position(|&count| count == least).unwrap_or(0);
        Self::Palette(u8::try_from(index).unwrap_or(0))
    }
}

/// How a [`ProfileColor`] is written in JSON.
#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum ColorRepr {
    Index(u8),
    Hex(String),
}

impl TryFrom<ColorRepr> for ProfileColor {
    type Error = ProfileColorError;

    fn try_from(repr: ColorRepr) -> Result<Self, Self::Error> {
        match repr {
            ColorRepr::Index(index) => Self::new(index),
            ColorRepr::Hex(text) => Self::from_hex(&text),
        }
    }
}

impl From<ProfileColor> for ColorRepr {
    fn from(color: ProfileColor) -> Self {
        match color {
            ProfileColor::Palette(index) => Self::Index(index),
            ProfileColor::Custom([r, g, b]) => Self::Hex(format!("#{r:02x}{g:02x}{b:02x}")),
        }
    }
}

/// A named context such as "Work" that holds tickets and notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Profile {
    /// Stable id.
    pub id: ProfileId,
    /// Name shown in the UI.
    pub name: String,
    /// Color of its dot in the UI.
    pub color: ProfileColor,
    /// Tickets in display order (within each status lane too).
    #[serde(default)]
    pub tickets: Vec<Ticket>,
    /// Notes in display order.
    #[serde(default)]
    pub notes: Vec<Note>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn color(index: u8) -> ProfileColor {
        ProfileColor::new(index).expect("color")
    }

    #[test]
    fn colors_stay_inside_the_palette() {
        assert_eq!(color(19).index(), Some(19));
        assert_eq!(
            ProfileColor::new(20),
            Err(ProfileColorError::OutOfPalette(20))
        );
        assert!(serde_json::from_str::<ProfileColor>("25").is_err());
        assert_eq!(serde_json::to_string(&color(7)).expect("json"), "7");
    }

    #[test]
    fn custom_colors_are_saved_as_hex() {
        let custom: ProfileColor = serde_json::from_str("\"#FF6A3D\"").expect("parse");
        assert_eq!(custom, ProfileColor::Custom([0xff, 0x6a, 0x3d]));
        assert_eq!(custom.index(), None);
        assert_eq!(serde_json::to_string(&custom).expect("json"), "\"#ff6a3d\"");
        assert!(serde_json::from_str::<ProfileColor>("\"#12345\"").is_err());
        assert!(serde_json::from_str::<ProfileColor>("\"red\"").is_err());
    }

    #[test]
    fn custom_colors_do_not_take_palette_slots() {
        assert_eq!(
            ProfileColor::next_after([ProfileColor::Custom([1, 2, 3]), color(0)]),
            color(1)
        );
    }

    #[test]
    fn next_color_is_the_first_unused_one() {
        assert_eq!(ProfileColor::next_after([]), color(0));
        assert_eq!(
            ProfileColor::next_after([color(0), color(1), color(3)]),
            color(2)
        );
    }

    #[test]
    fn with_every_color_taken_the_least_used_comes_next() {
        let mut used: Vec<_> = (0..PROFILE_COLORS).map(color).collect();
        used.extend([color(0), color(1)]);

        assert_eq!(ProfileColor::next_after(used), color(2));
    }
}
