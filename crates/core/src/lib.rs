//! Pure domain model for Tabstage Desktop.
//!
//! This crate does no IO. It holds the workspace model (groups, folders,
//! tabs, statuses) and the rules that decide which browser opens a group.

pub mod browser;
pub mod ids;
pub mod status;
pub mod url;
pub mod workspace;

pub use browser::{BrowserChoice, BrowserId, BrowserIdError, Resolved, effective_browser};
pub use ids::{FolderId, GroupId, TabId};
pub use status::{AccentColor, Status, StatusId, StatusIdError, default_statuses};
pub use url::{TabUrl, TabUrlError};
pub use workspace::{Folder, Group, Node, Place, Tab, TabRef, Target, Workspace, WorkspaceError};
