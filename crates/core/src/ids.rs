//! Typed identifiers, so a ticket id can never be passed where a link id is expected.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! uuid_id {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(Uuid);

        impl $name {
            /// Creates a new random identifier.
            #[must_use]
            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl From<Uuid> for $name {
            fn from(value: Uuid) -> Self {
                Self(value)
            }
        }

        impl FromStr for $name {
            type Err = uuid::Error;

            fn from_str(text: &str) -> Result<Self, Self::Err> {
                Uuid::parse_str(text).map(Self)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(f)
            }
        }
    };
}

uuid_id!(
    /// Identifies a ticket or a sub-ticket.
    TicketId
);
uuid_id!(
    /// Identifies a note.
    NoteId
);
uuid_id!(
    /// Identifies a status.
    StatusId
);
uuid_id!(
    /// Identifies a link (a saved tab) of a ticket or a note.
    TabId
);
uuid_id!(
    /// Identifies a Tabstage profile.
    ProfileId
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_ids_are_unique() {
        assert_ne!(TicketId::new(), TicketId::new());
    }

    #[test]
    fn id_parses_from_its_display_form() {
        let id = TicketId::new();

        assert_eq!(id.to_string().parse::<TicketId>(), Ok(id));
        assert!("not-a-uuid".parse::<TicketId>().is_err());
    }

    #[test]
    fn id_serializes_as_plain_uuid_string() {
        let uuid = Uuid::nil();
        let json = serde_json::to_string(&TabId::from(uuid)).expect("serialize");
        assert_eq!(json, "\"00000000-0000-0000-0000-000000000000\"");
    }
}
