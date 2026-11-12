//! Pure domain model for Tabstage Desktop.
//!
//! This crate does no IO. It holds the workspace model: statuses, and
//! profiles that hold tickets and notes.

pub mod browser;
pub mod icon;
pub mod ids;
pub mod profile;
pub mod url;
pub mod workspace;

pub use browser::{BrowserId, BrowserIdError};
pub use icon::{Icon, IconError, MAX_TEXT_ICON};
pub use ids::{NoteId, ProfileId, StatusId, TabId, TicketId};
pub use profile::{DEFAULT_PROFILE_NAME, PROFILE_COLORS, Profile, ProfileColor, ProfileColorError};
pub use url::{TabUrl, TabUrlError};
pub use workspace::{
    Link, LinkOwner, LinkRef, MAX_KEY_LEN, MAX_NOTE_LEN, Note, Status, Target, Ticket, TicketPlace,
    TicketRef, Workspace, WorkspaceError, clean_detail,
};
