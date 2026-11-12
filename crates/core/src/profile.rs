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

/// One of the [`PROFILE_COLORS`] profile colors, by index.
#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize,
)]
#[serde(try_from = "u8", into = "u8")]
pub struct ProfileColor(u8);

/// Error returned for a color index outside the palette.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
#[error("profile color {0} is outside the palette of {PROFILE_COLORS}")]
pub struct ProfileColorError(pub u8);

impl ProfileColor {
    /// The color at `index`.
    ///
    /// # Errors
    ///
    /// [`ProfileColorError`] when `index` is not below [`PROFILE_COLORS`].
    pub fn new(index: u8) -> Result<Self, ProfileColorError> {
        if index < PROFILE_COLORS {
            Ok(Self(index))
        } else {
            Err(ProfileColorError(index))
        }
    }

    /// Index in the palette.
    #[must_use]
    pub const fn index(self) -> u8 {
        self.0
    }

    /// The color for a new profile: the first one nobody uses, or the least
    /// used one when all are taken.
    #[must_use]
    pub fn next_after(used: impl IntoIterator<Item = Self>) -> Self {
        let mut counts = [0_usize; PROFILE_COLORS as usize];
        for color in used {
            counts[usize::from(color.0)] += 1;
        }
        // First of the least used, so an unused color always wins.
        let least = counts.iter().min().copied().unwrap_or(0);
        let index = counts.iter().position(|&count| count == least).unwrap_or(0);
        Self(u8::try_from(index).unwrap_or(0))
    }
}

impl TryFrom<u8> for ProfileColor {
    type Error = ProfileColorError;

    fn try_from(index: u8) -> Result<Self, Self::Error> {
        Self::new(index)
    }
}

impl From<ProfileColor> for u8 {
    fn from(color: ProfileColor) -> Self {
        color.0
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
        assert_eq!(color(19).index(), 19);
        assert_eq!(ProfileColor::new(20), Err(ProfileColorError(20)));
        assert!(serde_json::from_str::<ProfileColor>("25").is_err());
        assert_eq!(serde_json::to_string(&color(7)).expect("json"), "7");
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
