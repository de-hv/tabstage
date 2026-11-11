//! The workspace: profiles that hold groups, folders and tabs.
//!
//! The hierarchy is fixed: a profile holds groups, folders and tabs; a group
//! holds folders and tabs; a folder holds tabs. Order is the position in
//! each `Vec`, so there are no order fields that can get out of sync. Every
//! change goes through a [`Workspace`] method that checks its references and
//! returns a [`WorkspaceError`] instead of panicking.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::color::AccentColor;
use crate::icon::Icon;
use crate::ids::{FolderId, GroupId, ProfileId, TabId};
use crate::profile::{DEFAULT_PROFILE_NAME, Profile, ProfileColor};
use crate::url::TabUrl;

/// A saved link.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tab {
    /// Stable id.
    pub id: TabId,
    /// Where the tab points.
    pub url: TabUrl,
    /// Title shown in the UI.
    pub title: String,
    /// Custom icon; the UI shows the default tab icon without one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<Icon>,
    /// Ticket key in Jira or a similar tracker, such as `PROJ-123`.
    #[serde(default, rename = "ticketId", skip_serializing_if = "Option::is_none")]
    pub ticket_id: Option<String>,
    /// Free-form note; may span several lines.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// A named folder of tabs. Folders do not nest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Folder {
    /// Stable id.
    pub id: FolderId,
    /// Name shown in the UI.
    pub name: String,
    /// Custom icon; the UI shows the default folder icon without one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<Icon>,
    /// Ticket key in Jira or a similar tracker, such as `PROJ-123`.
    #[serde(default, rename = "ticketId", skip_serializing_if = "Option::is_none")]
    pub ticket_id: Option<String>,
    /// Free-form note; may span several lines.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Whether the folder is shown collapsed.
    #[serde(default)]
    pub collapsed: bool,
    /// Tabs in display order.
    #[serde(default)]
    pub tabs: Vec<Tab>,
}

/// A direct child of a group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Node {
    /// A loose tab.
    Tab(Tab),
    /// A folder of tabs.
    Folder(Folder),
}

/// A group of tabs and folders, such as "In TEST".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Group {
    /// Stable id.
    pub id: GroupId,
    /// Name shown in the UI.
    pub name: String,
    /// Accent color.
    pub color: AccentColor,
    /// Custom icon; the UI shows the default group icon without one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<Icon>,
    /// Ticket key in Jira or a similar tracker, such as `PROJ-123`.
    #[serde(default, rename = "ticketId", skip_serializing_if = "Option::is_none")]
    pub ticket_id: Option<String>,
    /// Free-form note; may span several lines.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Tabs and folders in display order.
    #[serde(default)]
    pub children: Vec<Node>,
}

/// A direct child of a profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Item {
    /// A group.
    Group(Group),
    /// A folder outside any group.
    Folder(Folder),
    /// A tab outside any group or folder.
    Tab(Tab),
}

/// Something that holds tabs, and except for a folder, folders too.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Place {
    /// Directly inside a profile.
    Profile(ProfileId),
    /// Directly inside a group.
    Group(GroupId),
    /// Inside a folder.
    Folder(FolderId),
}

/// A group, folder or tab, for changes that apply to any of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    /// A group.
    Group(GroupId),
    /// A folder.
    Folder(FolderId),
    /// A tab.
    Tab(TabId),
}

/// A tab together with what contains it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TabRef<'a> {
    /// The profile the tab belongs to.
    pub profile: &'a Profile,
    /// The group the tab is in, if any.
    pub group: Option<&'a Group>,
    /// The folder the tab is in, if any.
    pub folder: Option<&'a Folder>,
    /// The tab.
    pub tab: &'a Tab,
}

/// A folder together with what contains it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FolderRef<'a> {
    /// The profile the folder belongs to.
    pub profile: &'a Profile,
    /// The group the folder is in, if any.
    pub group: Option<&'a Group>,
    /// The folder.
    pub folder: &'a Folder,
}

/// Errors returned by [`Workspace`] changes.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum WorkspaceError {
    /// No profile has this id.
    #[error("profile {0} not found")]
    ProfileNotFound(ProfileId),
    /// No group has this id.
    #[error("group {0} not found")]
    GroupNotFound(GroupId),
    /// No folder has this id.
    #[error("folder {0} not found")]
    FolderNotFound(FolderId),
    /// No tab has this id.
    #[error("tab {0} not found")]
    TabNotFound(TabId),
    /// A name was empty or only whitespace.
    #[error("name is empty")]
    EmptyName,
    /// A folder was put inside a folder; folders do not nest.
    #[error("a folder cannot go inside another folder")]
    NestedFolder,
    /// Two profiles, groups, folders or tabs share the same id.
    #[error("id {0} is used more than once")]
    DuplicateId(String),
    /// A profile cannot take over its own items when it is removed.
    #[error("a profile cannot be replaced by itself")]
    SameProfile,
    /// A workspace must have at least one profile.
    #[error("the workspace has no profiles")]
    NoProfiles,
}

/// Result type for workspace changes.
pub type Result<T> = std::result::Result<T, WorkspaceError>;

/// Everything a user keeps: profiles and their contents.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Workspace {
    profiles: Vec<Profile>,
}

impl Default for Workspace {
    fn default() -> Self {
        Self::new()
    }
}

impl Workspace {
    /// A workspace with one empty profile.
    #[must_use]
    pub fn new() -> Self {
        Self {
            profiles: vec![Profile {
                id: ProfileId::new(),
                name: DEFAULT_PROFILE_NAME.to_owned(),
                color: ProfileColor::default(),
                items: Vec::new(),
            }],
        }
    }

    /// A workspace with these profiles. Call [`Workspace::validate`] before
    /// trusting it.
    #[must_use]
    pub fn from_profiles(profiles: Vec<Profile>) -> Self {
        Self { profiles }
    }

    // ---- profiles -------------------------------------------------------

    /// Profiles in display order. There is always at least one.
    #[must_use]
    pub fn profiles(&self) -> &[Profile] {
        &self.profiles
    }

    /// The profile with this id.
    #[must_use]
    pub fn profile(&self, id: ProfileId) -> Option<&Profile> {
        self.profiles.iter().find(|profile| profile.id == id)
    }

    /// Adds an empty profile at the end, with a color no other profile uses
    /// when one is left.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] when `name` is blank.
    pub fn add_profile(&mut self, name: &str) -> Result<ProfileId> {
        let name = clean_name(name)?;
        let id = ProfileId::new();
        let color = ProfileColor::next_after(self.profiles.iter().map(|profile| profile.color));
        self.profiles.push(Profile {
            id,
            name,
            color,
            items: Vec::new(),
        });
        Ok(id)
    }

    /// Changes the color of a profile's dot.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::ProfileNotFound`].
    pub fn set_profile_color(&mut self, id: ProfileId, color: ProfileColor) -> Result<()> {
        self.profile_mut(id)?.color = color;
        Ok(())
    }

    /// Renames a profile.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] or [`WorkspaceError::ProfileNotFound`].
    pub fn rename_profile(&mut self, id: ProfileId, name: &str) -> Result<()> {
        let name = clean_name(name)?;
        self.profile_mut(id)?.name = name;
        Ok(())
    }

    /// Moves a profile to `index`, clamped to the end.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::ProfileNotFound`].
    pub fn move_profile(&mut self, id: ProfileId, index: usize) -> Result<()> {
        let from = self.profile_index(id)?;
        let profile = self.profiles.remove(from);
        let to = index.min(self.profiles.len());
        self.profiles.insert(to, profile);
        Ok(())
    }

    /// Removes a profile and appends its items to `move_items_to`.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::ProfileNotFound`] for either id, or
    /// [`WorkspaceError::SameProfile`] when both ids are equal. Together
    /// these keep at least one profile.
    pub fn remove_profile(&mut self, id: ProfileId, move_items_to: ProfileId) -> Result<Profile> {
        let index = self.profile_index(id)?;
        // The target must be another existing profile, so the last profile
        // can never be removed.
        if id == move_items_to {
            return Err(WorkspaceError::SameProfile);
        }
        self.profile_index(move_items_to)?;
        let mut removed = self.profiles.remove(index);
        let items = std::mem::take(&mut removed.items);
        self.profile_mut(move_items_to)?.items.extend(items);
        Ok(removed)
    }

    // ---- groups ---------------------------------------------------------

    /// Every group, profile by profile, in display order.
    pub fn groups(&self) -> impl Iterator<Item = &Group> {
        self.profiles
            .iter()
            .flat_map(|profile| &profile.items)
            .filter_map(|item| match item {
                Item::Group(group) => Some(group),
                Item::Folder(_) | Item::Tab(_) => None,
            })
    }

    /// The group with this id.
    #[must_use]
    pub fn group(&self, id: GroupId) -> Option<&Group> {
        self.groups().find(|group| group.id == id)
    }

    /// The profile that holds this group.
    #[must_use]
    pub fn group_profile(&self, id: GroupId) -> Option<&Profile> {
        self.profiles.iter().find(|profile| {
            profile
                .items
                .iter()
                .any(|item| matches!(item, Item::Group(group) if group.id == id))
        })
    }

    /// Adds an empty group at the end of `profile`.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] or [`WorkspaceError::ProfileNotFound`].
    pub fn add_group(
        &mut self,
        profile: ProfileId,
        name: &str,
        color: AccentColor,
    ) -> Result<GroupId> {
        let name = clean_name(name)?;
        let id = GroupId::new();
        self.profile_mut(profile)?.items.push(Item::Group(Group {
            id,
            name,
            color,
            icon: None,
            ticket_id: None,
            note: None,
            children: Vec::new(),
        }));
        Ok(id)
    }

    /// Renames a group.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] or [`WorkspaceError::GroupNotFound`].
    pub fn rename_group(&mut self, id: GroupId, name: &str) -> Result<()> {
        let name = clean_name(name)?;
        self.group_mut(id)?.name = name;
        Ok(())
    }

    /// Moves a group to `index` among the items of `profile`, clamped to the
    /// end. Works across profiles. Nothing changes when `profile` is unknown.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::GroupNotFound`] or [`WorkspaceError::ProfileNotFound`].
    pub fn move_group(&mut self, id: GroupId, profile: ProfileId, index: usize) -> Result<()> {
        self.profile_index(profile)?;
        let group = self.take_group(id)?;
        let items = &mut self.profile_mut(profile)?.items;
        items.insert(index.min(items.len()), Item::Group(group));
        Ok(())
    }

    /// Removes a group with all of its tabs and folders.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::GroupNotFound`].
    pub fn remove_group(&mut self, id: GroupId) -> Result<Group> {
        self.take_group(id)
    }

    // ---- folders --------------------------------------------------------

    /// Finds a folder with its profile and group.
    #[must_use]
    pub fn find_folder(&self, id: FolderId) -> Option<FolderRef<'_>> {
        self.profiles.iter().find_map(|profile| {
            profile.items.iter().find_map(|item| match item {
                Item::Folder(folder) if folder.id == id => Some(FolderRef {
                    profile,
                    group: None,
                    folder,
                }),
                Item::Group(group) => group.children.iter().find_map(|node| match node {
                    Node::Folder(folder) if folder.id == id => Some(FolderRef {
                        profile,
                        group: Some(group),
                        folder,
                    }),
                    _ => None,
                }),
                Item::Folder(_) | Item::Tab(_) => None,
            })
        })
    }

    /// Adds an empty folder at the end of a profile or group.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`], [`WorkspaceError::NestedFolder`] for a
    /// folder place, or the not-found error of `place`.
    pub fn add_folder(&mut self, place: Place, name: &str) -> Result<FolderId> {
        let name = clean_name(name)?;
        let id = FolderId::new();
        let folder = Folder {
            id,
            name,
            icon: None,
            ticket_id: None,
            note: None,
            collapsed: false,
            tabs: Vec::new(),
        };
        self.insert_folder(place, usize::MAX, folder)?;
        Ok(id)
    }

    /// Shows a folder collapsed or expanded.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::FolderNotFound`].
    pub fn set_folder_collapsed(&mut self, id: FolderId, collapsed: bool) -> Result<()> {
        self.folder_mut(id)?.collapsed = collapsed;
        Ok(())
    }

    /// Renames a folder.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] or [`WorkspaceError::FolderNotFound`].
    pub fn rename_folder(&mut self, id: FolderId, name: &str) -> Result<()> {
        let name = clean_name(name)?;
        self.folder_mut(id)?.name = name;
        Ok(())
    }

    /// Moves a folder to `index` within a profile or group, clamped to the
    /// end. Nothing changes when `place` is unknown or a folder.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::FolderNotFound`], [`WorkspaceError::NestedFolder`]
    /// or the not-found error of `place`.
    pub fn move_folder(&mut self, id: FolderId, place: Place, index: usize) -> Result<()> {
        if matches!(place, Place::Folder(_)) {
            return Err(WorkspaceError::NestedFolder);
        }
        self.ensure_place(place)?;
        let folder = self.take_folder(id)?;
        self.insert_folder(place, index, folder)
    }

    /// Removes a folder together with its tabs.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::FolderNotFound`].
    pub fn remove_folder(&mut self, id: FolderId) -> Result<Folder> {
        self.take_folder(id)
    }

    // ---- tabs -----------------------------------------------------------

    /// Every tab with what contains it, in display order.
    #[must_use]
    pub fn tabs(&self) -> Vec<TabRef<'_>> {
        let mut found = Vec::new();
        for profile in &self.profiles {
            let at = |group, folder, tab| TabRef {
                profile,
                group,
                folder,
                tab,
            };
            for item in &profile.items {
                match item {
                    Item::Tab(tab) => found.push(at(None, None, tab)),
                    Item::Folder(folder) => {
                        found.extend(folder.tabs.iter().map(|tab| at(None, Some(folder), tab)));
                    }
                    Item::Group(group) => {
                        for node in &group.children {
                            match node {
                                Node::Tab(tab) => found.push(at(Some(group), None, tab)),
                                Node::Folder(folder) => found.extend(
                                    folder
                                        .tabs
                                        .iter()
                                        .map(|tab| at(Some(group), Some(folder), tab)),
                                ),
                            }
                        }
                    }
                }
            }
        }
        found
    }

    /// Finds a tab with its profile, group and folder.
    #[must_use]
    pub fn find_tab(&self, id: TabId) -> Option<TabRef<'_>> {
        self.tabs().into_iter().find(|found| found.tab.id == id)
    }

    /// Adds a tab at the end of `place`. A blank title falls back to the URL.
    ///
    /// # Errors
    ///
    /// The not-found error of `place`.
    pub fn add_tab(&mut self, place: Place, url: TabUrl, title: &str) -> Result<TabId> {
        let title = tab_title(title, &url);
        let id = TabId::new();
        let tab = Tab {
            id,
            url,
            title,
            icon: None,
            ticket_id: None,
            note: None,
        };
        self.insert_tab(place, usize::MAX, tab)?;
        Ok(id)
    }

    /// Changes a tab's title. A blank title falls back to the URL.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TabNotFound`].
    pub fn rename_tab(&mut self, id: TabId, title: &str) -> Result<()> {
        let tab = self.tab_mut(id)?;
        tab.title = tab_title(title, &tab.url);
        Ok(())
    }

    /// Changes a tab's URL. A title that was only the old URL (the fallback
    /// for a blank title) follows the new one.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TabNotFound`].
    pub fn set_tab_url(&mut self, id: TabId, url: TabUrl) -> Result<()> {
        let tab = self.tab_mut(id)?;
        if tab.title == tab.url.as_str() {
            url.as_str().clone_into(&mut tab.title);
        }
        tab.url = url;
        Ok(())
    }

    /// Removes a tab.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TabNotFound`].
    pub fn remove_tab(&mut self, id: TabId) -> Result<Tab> {
        self.take_tab(id).ok_or(WorkspaceError::TabNotFound(id))
    }

    /// Moves a tab to `index` within `place`, clamped to the end. Works
    /// across profiles, groups and folders. Nothing changes when `place` is
    /// unknown.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TabNotFound`] or the not-found error of `place`.
    pub fn move_tab(&mut self, id: TabId, place: Place, index: usize) -> Result<()> {
        self.ensure_place(place)?;
        let tab = self.take_tab(id).ok_or(WorkspaceError::TabNotFound(id))?;
        self.insert_tab(place, index, tab)
    }

    // ---- any item -------------------------------------------------------

    /// Sets or clears the custom icon of a group, folder or tab.
    ///
    /// # Errors
    ///
    /// The not-found error of `target`.
    pub fn set_icon(&mut self, target: Target, icon: Option<Icon>) -> Result<()> {
        match target {
            Target::Group(id) => self.group_mut(id)?.icon = icon,
            Target::Folder(id) => self.folder_mut(id)?.icon = icon,
            Target::Tab(id) => self.tab_mut(id)?.icon = icon,
        }
        Ok(())
    }

    /// Sets the ticket id and note of a group, folder or tab. Both are
    /// trimmed (the note keeps its inner line breaks); a blank one is
    /// cleared.
    ///
    /// # Errors
    ///
    /// The not-found error of `target`.
    pub fn set_details(&mut self, target: Target, ticket_id: &str, note: &str) -> Result<()> {
        let ticket_id = clean_detail(ticket_id, MAX_TICKET_ID_LEN);
        let note = clean_detail(note, MAX_NOTE_LEN);
        let (slot_ticket, slot_note) = match target {
            Target::Group(id) => {
                let group = self.group_mut(id)?;
                (&mut group.ticket_id, &mut group.note)
            }
            Target::Folder(id) => {
                let folder = self.folder_mut(id)?;
                (&mut folder.ticket_id, &mut folder.note)
            }
            Target::Tab(id) => {
                let tab = self.tab_mut(id)?;
                (&mut tab.ticket_id, &mut tab.note)
            }
        };
        *slot_ticket = ticket_id;
        *slot_note = note;
        Ok(())
    }

    /// Checks the invariants a deserialized workspace must hold: at least
    /// one profile and unique ids.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::NoProfiles`] or the first
    /// [`WorkspaceError::DuplicateId`] found.
    pub fn validate(&self) -> Result<()> {
        if self.profiles.is_empty() {
            return Err(WorkspaceError::NoProfiles);
        }
        let mut ids = HashSet::new();
        let mut unique = |id: String| {
            if ids.insert(id.clone()) {
                Ok(())
            } else {
                Err(WorkspaceError::DuplicateId(id))
            }
        };
        let folder = |folder: &Folder, unique: &mut dyn FnMut(String) -> Result<()>| {
            unique(folder.id.to_string())?;
            folder
                .tabs
                .iter()
                .try_for_each(|tab| unique(tab.id.to_string()))
        };
        for profile in &self.profiles {
            unique(profile.id.to_string())?;
            for item in &profile.items {
                match item {
                    Item::Tab(tab) => unique(tab.id.to_string())?,
                    Item::Folder(found) => folder(found, &mut unique)?,
                    Item::Group(group) => {
                        unique(group.id.to_string())?;
                        for node in &group.children {
                            match node {
                                Node::Tab(tab) => unique(tab.id.to_string())?,
                                Node::Folder(found) => folder(found, &mut unique)?,
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    // ---- internals ------------------------------------------------------

    fn profile_index(&self, id: ProfileId) -> Result<usize> {
        self.profiles
            .iter()
            .position(|profile| profile.id == id)
            .ok_or(WorkspaceError::ProfileNotFound(id))
    }

    fn profile_mut(&mut self, id: ProfileId) -> Result<&mut Profile> {
        self.profiles
            .iter_mut()
            .find(|profile| profile.id == id)
            .ok_or(WorkspaceError::ProfileNotFound(id))
    }

    fn group_mut(&mut self, id: GroupId) -> Result<&mut Group> {
        self.profiles
            .iter_mut()
            .flat_map(|profile| &mut profile.items)
            .find_map(|item| match item {
                Item::Group(group) if group.id == id => Some(group),
                _ => None,
            })
            .ok_or(WorkspaceError::GroupNotFound(id))
    }

    fn folder_mut(&mut self, id: FolderId) -> Result<&mut Folder> {
        self.profiles
            .iter_mut()
            .flat_map(|profile| &mut profile.items)
            .find_map(|item| match item {
                Item::Folder(folder) => (folder.id == id).then_some(folder),
                Item::Group(group) => group.children.iter_mut().find_map(|node| match node {
                    Node::Folder(folder) if folder.id == id => Some(folder),
                    _ => None,
                }),
                Item::Tab(_) => None,
            })
            .ok_or(WorkspaceError::FolderNotFound(id))
    }

    fn tab_mut(&mut self, id: TabId) -> Result<&mut Tab> {
        self.profiles
            .iter_mut()
            .flat_map(|profile| &mut profile.items)
            .find_map(|item| match item {
                Item::Tab(tab) => (tab.id == id).then_some(tab),
                Item::Folder(folder) => folder.tabs.iter_mut().find(|tab| tab.id == id),
                Item::Group(group) => group.children.iter_mut().find_map(|node| match node {
                    Node::Tab(tab) => (tab.id == id).then_some(tab),
                    Node::Folder(folder) => folder.tabs.iter_mut().find(|tab| tab.id == id),
                }),
            })
            .ok_or(WorkspaceError::TabNotFound(id))
    }

    fn ensure_place(&mut self, place: Place) -> Result<()> {
        match place {
            Place::Profile(id) => self.profile_index(id).map(drop),
            Place::Group(id) => self.group_mut(id).map(drop),
            Place::Folder(id) => self.folder_mut(id).map(drop),
        }
    }

    fn take_group(&mut self, id: GroupId) -> Result<Group> {
        for profile in &mut self.profiles {
            let found = profile
                .items
                .iter()
                .position(|item| matches!(item, Item::Group(group) if group.id == id));
            if let Some(index) = found
                && let Item::Group(group) = profile.items.remove(index)
            {
                return Ok(group);
            }
        }
        Err(WorkspaceError::GroupNotFound(id))
    }

    fn take_folder(&mut self, id: FolderId) -> Result<Folder> {
        for profile in &mut self.profiles {
            let loose = profile
                .items
                .iter()
                .position(|item| matches!(item, Item::Folder(folder) if folder.id == id));
            if let Some(index) = loose
                && let Item::Folder(folder) = profile.items.remove(index)
            {
                return Ok(folder);
            }
            for item in &mut profile.items {
                if let Item::Group(group) = item
                    && let Some(index) = group
                        .children
                        .iter()
                        .position(|node| matches!(node, Node::Folder(folder) if folder.id == id))
                    && let Node::Folder(folder) = group.children.remove(index)
                {
                    return Ok(folder);
                }
            }
        }
        Err(WorkspaceError::FolderNotFound(id))
    }

    /// Removes a tab from wherever it is.
    fn take_tab(&mut self, id: TabId) -> Option<Tab> {
        fn from_folder(folder: &mut Folder, id: TabId) -> Option<Tab> {
            let index = folder.tabs.iter().position(|tab| tab.id == id)?;
            Some(folder.tabs.remove(index))
        }
        for profile in &mut self.profiles {
            let loose = profile
                .items
                .iter()
                .position(|item| matches!(item, Item::Tab(tab) if tab.id == id));
            if let Some(index) = loose
                && let Item::Tab(tab) = profile.items.remove(index)
            {
                return Some(tab);
            }
            for item in &mut profile.items {
                let taken = match item {
                    Item::Tab(_) => None,
                    Item::Folder(folder) => from_folder(folder, id),
                    Item::Group(group) => {
                        let loose = group
                            .children
                            .iter()
                            .position(|node| matches!(node, Node::Tab(tab) if tab.id == id));
                        match loose.map(|index| group.children.remove(index)) {
                            Some(Node::Tab(tab)) => Some(tab),
                            _ => group.children.iter_mut().find_map(|node| match node {
                                Node::Folder(folder) => from_folder(folder, id),
                                Node::Tab(_) => None,
                            }),
                        }
                    }
                };
                if taken.is_some() {
                    return taken;
                }
            }
        }
        None
    }

    /// Inserts a tab at `index` (clamped) within `place`.
    fn insert_tab(&mut self, place: Place, index: usize, tab: Tab) -> Result<()> {
        match place {
            Place::Profile(id) => {
                let items = &mut self.profile_mut(id)?.items;
                items.insert(index.min(items.len()), Item::Tab(tab));
            }
            Place::Group(id) => {
                let children = &mut self.group_mut(id)?.children;
                children.insert(index.min(children.len()), Node::Tab(tab));
            }
            Place::Folder(id) => {
                let tabs = &mut self.folder_mut(id)?.tabs;
                tabs.insert(index.min(tabs.len()), tab);
            }
        }
        Ok(())
    }

    /// Inserts a folder at `index` (clamped) within a profile or group.
    fn insert_folder(&mut self, place: Place, index: usize, folder: Folder) -> Result<()> {
        match place {
            Place::Profile(id) => {
                let items = &mut self.profile_mut(id)?.items;
                items.insert(index.min(items.len()), Item::Folder(folder));
            }
            Place::Group(id) => {
                let children = &mut self.group_mut(id)?.children;
                children.insert(index.min(children.len()), Node::Folder(folder));
            }
            Place::Folder(_) => return Err(WorkspaceError::NestedFolder),
        }
        Ok(())
    }
}

/// Trims a title, using the URL when it is blank.
fn tab_title(raw: &str, url: &TabUrl) -> String {
    match raw.trim() {
        "" => url.as_str().to_owned(),
        trimmed => trimmed.to_owned(),
    }
}

/// Longest ticket id kept, in characters.
pub const MAX_TICKET_ID_LEN: usize = 64;
/// Longest note kept, in characters.
pub const MAX_NOTE_LEN: usize = 5000;

/// Trims a ticket id or note and caps its length; `None` when blank.
fn clean_detail(raw: &str, max: usize) -> Option<String> {
    let trimmed = raw.trim();
    (!trimmed.is_empty()).then(|| trimmed.chars().take(max).collect())
}

/// Trims a name and rejects it when blank.
fn clean_name(raw: &str) -> Result<String> {
    match raw.trim() {
        "" => Err(WorkspaceError::EmptyName),
        trimmed => Ok(trimmed.to_owned()),
    }
}

#[cfg(test)]
mod tests;
