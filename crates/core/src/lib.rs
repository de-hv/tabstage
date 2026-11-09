//! Pure domain model for Tabstage Desktop.
//!
//! This crate does no IO. It holds the workspace model (groups, folders,
//! tabs, statuses and profiles).

pub mod browser;
pub mod ids;
pub mod profile;
pub mod status;
pub mod url;
pub mod workspace;

pub use browser::{BrowserId, BrowserIdError};
pub use ids::{FolderId, GroupId, ProfileId, TabId};
pub use profile::{DEFAULT_PROFILE_NAME, PROFILE_COLORS, Profile, ProfileColor, ProfileColorError};
pub use status::{AccentColor, Status, StatusId, StatusIdError, default_statuses};
pub use url::{TabUrl, TabUrlError};
pub use workspace::{Folder, Group, Node, Place, Tab, TabRef, Target, Workspace, WorkspaceError};
