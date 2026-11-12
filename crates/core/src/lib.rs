//! Pure domain model for Tabstage Desktop.
//!
//! This crate does no IO. It holds the workspace model: profiles that hold
//! groups, folders and tabs.

pub mod browser;
pub mod color;
pub mod icon;
pub mod ids;
pub mod profile;
pub mod url;
pub mod workspace;

pub use browser::{BrowserId, BrowserIdError};
pub use color::{ContainerColor, ContainerColorError};
pub use icon::{Icon, IconError, MAX_TEXT_ICON};
pub use ids::{FolderId, GroupId, ProfileId, TabId};
pub use profile::{DEFAULT_PROFILE_NAME, PROFILE_COLORS, Profile, ProfileColor, ProfileColorError};
pub use url::{TabUrl, TabUrlError};
pub use workspace::{
    Container, Folder, FolderRef, Group, Item, Node, Place, TICKET_PLACEHOLDER, Tab, TabRef,
    Target, Workspace, WorkspaceError,
};
