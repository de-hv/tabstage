//! Colors a group or folder can choose.

use serde::{Deserialize, Serialize};

use crate::profile::{ProfileColor, ProfileColorError};

/// The color a group or folder chooses; none until the user picks one.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "ColorValue", into = "ColorValue")]
pub enum ContainerColor {
    /// No color: no tint for its rows and the default icon color.
    #[default]
    None,
    /// The color its parent shows (for a group, its profile's).
    Parent,
    /// One of the profile colors.
    Color(ProfileColor),
}

impl ContainerColor {
    /// Whether it is the default, so the data file can leave it out.
    #[must_use]
    pub fn is_none(&self) -> bool {
        *self == Self::None
    }
}

/// How a [`ContainerColor`] is written: a palette index, `"parent"` or `"none"`.
#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum ColorValue {
    Index(u8),
    Word(String),
}

/// The words that stand for [`ContainerColor::None`] and [`ContainerColor::Parent`].
const NONE: &str = "none";
const PARENT: &str = "parent";

/// Error returned for a color that is not a palette index, `"parent"` or `"none"`.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ContainerColorError {
    /// An index outside the palette.
    #[error(transparent)]
    Palette(#[from] ProfileColorError),
    /// A word other than `"parent"` or `"none"`.
    #[error("unknown color {0:?}")]
    Unknown(String),
}

impl TryFrom<ColorValue> for ContainerColor {
    type Error = ContainerColorError;

    fn try_from(value: ColorValue) -> Result<Self, Self::Error> {
        match value {
            ColorValue::Index(index) => Ok(Self::Color(ProfileColor::new(index)?)),
            ColorValue::Word(word) if word == NONE => Ok(Self::None),
            ColorValue::Word(word) if word == PARENT => Ok(Self::Parent),
            ColorValue::Word(word) => Err(ContainerColorError::Unknown(word)),
        }
    }
}

impl From<ContainerColor> for ColorValue {
    fn from(color: ContainerColor) -> Self {
        match color {
            ContainerColor::Color(color) => Self::Index(color.index()),
            ContainerColor::None => Self::Word(NONE.to_owned()),
            ContainerColor::Parent => Self::Word(PARENT.to_owned()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_color_is_an_index_parent_or_none() {
        let teal = ContainerColor::Color(ProfileColor::new(10).expect("color"));
        assert_eq!(serde_json::to_string(&teal).expect("json"), "10");
        assert_eq!(
            serde_json::to_string(&ContainerColor::None).expect("json"),
            r#""none""#
        );
        assert_eq!(
            serde_json::from_str::<ContainerColor>("10").expect("index"),
            teal
        );
        assert_eq!(
            serde_json::from_str::<ContainerColor>(r#""none""#).expect("none"),
            ContainerColor::None
        );
        assert_eq!(
            serde_json::from_str::<ContainerColor>(r#""parent""#).expect("parent"),
            ContainerColor::Parent
        );
        assert_eq!(ContainerColor::default(), ContainerColor::None);
        assert!(serde_json::from_str::<ContainerColor>("25").is_err());
        assert!(serde_json::from_str::<ContainerColor>(r#""blue""#).is_err());
    }
}
