//! The workspace: groups that hold tabs and folders of tabs.
//!
//! Order is the position in each `Vec`, so there are no order fields that
//! can get out of sync. Every change goes through a [`Workspace`] method
//! that checks its references and returns a [`WorkspaceError`] instead of
//! panicking.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::browser::BrowserChoice;
use crate::ids::{FolderId, GroupId, TabId};
use crate::status::{AccentColor, Status, StatusId, default_statuses};
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
    /// Own status. A folder's status takes precedence over it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<StatusId>,
}

/// A named folder of tabs inside a group. Folders do not nest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Folder {
    /// Stable id.
    pub id: FolderId,
    /// Name shown in the UI.
    pub name: String,
    /// Status that applies to every tab in the folder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<StatusId>,
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

/// A group of tabs and folders that opens in one browser.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Group {
    /// Stable id.
    pub id: GroupId,
    /// Name shown in the UI.
    pub name: String,
    /// Accent color.
    pub color: AccentColor,
    /// Browser that opens this group's tabs.
    #[serde(default)]
    pub browser: BrowserChoice,
    /// Tabs and folders in display order.
    #[serde(default)]
    pub children: Vec<Node>,
}

/// Where a tab lives.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Place {
    /// Directly inside a group.
    Group(GroupId),
    /// Inside a folder.
    Folder(FolderId),
}

/// Something a status can be set on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    /// A tab.
    Tab(TabId),
    /// A folder, and through it all of its tabs.
    Folder(FolderId),
}

/// A tab together with the group and folder that contain it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TabRef<'a> {
    /// The group the tab belongs to.
    pub group: &'a Group,
    /// The folder the tab is in, if any.
    pub folder: Option<&'a Folder>,
    /// The tab.
    pub tab: &'a Tab,
}

/// Errors returned by [`Workspace`] changes.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum WorkspaceError {
    /// No group has this id.
    #[error("group {0} not found")]
    GroupNotFound(GroupId),
    /// No folder has this id.
    #[error("folder {0} not found")]
    FolderNotFound(FolderId),
    /// No tab has this id.
    #[error("tab {0} not found")]
    TabNotFound(TabId),
    /// No status has this id.
    #[error("status `{0}` not found")]
    StatusNotFound(StatusId),
    /// A name was empty or only whitespace.
    #[error("name is empty")]
    EmptyName,
    /// A status cannot be replaced by itself when it is removed.
    #[error("a status cannot be replaced by itself")]
    SameStatus,
    /// Two statuses share the same id.
    #[error("status `{0}` is defined more than once")]
    DuplicateStatus(StatusId),
    /// Two groups, folders or tabs share the same id.
    #[error("id {0} is used more than once")]
    DuplicateId(String),
}

/// Result type for workspace changes.
pub type Result<T> = std::result::Result<T, WorkspaceError>;

/// All groups and statuses of a user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Workspace {
    statuses: Vec<Status>,
    groups: Vec<Group>,
}

impl Default for Workspace {
    fn default() -> Self {
        Self::new()
    }
}

impl Workspace {
    /// An empty workspace with the default statuses.
    #[must_use]
    pub fn new() -> Self {
        Self {
            statuses: default_statuses(),
            groups: Vec::new(),
        }
    }

    /// Groups in display order.
    #[must_use]
    pub fn groups(&self) -> &[Group] {
        &self.groups
    }

    /// Statuses in display order.
    #[must_use]
    pub fn statuses(&self) -> &[Status] {
        &self.statuses
    }

    /// The group with this id.
    #[must_use]
    pub fn group(&self, id: GroupId) -> Option<&Group> {
        self.groups.iter().find(|group| group.id == id)
    }

    /// Adds a group at the end.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] when `name` is blank.
    pub fn add_group(&mut self, name: &str, color: AccentColor) -> Result<GroupId> {
        let name = clean_name(name)?;
        let id = GroupId::new();
        self.groups.push(Group {
            id,
            name,
            color,
            browser: BrowserChoice::Default,
            children: Vec::new(),
        });
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

    /// Sets which browser opens a group.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::GroupNotFound`].
    pub fn set_group_browser(&mut self, id: GroupId, browser: BrowserChoice) -> Result<()> {
        self.group_mut(id)?.browser = browser;
        Ok(())
    }

    /// Moves a group to `index`, clamped to the end of the list.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::GroupNotFound`].
    pub fn move_group(&mut self, id: GroupId, index: usize) -> Result<()> {
        let from = self.group_index(id)?;
        let group = self.groups.remove(from);
        let to = index.min(self.groups.len());
        self.groups.insert(to, group);
        Ok(())
    }

    /// Removes a group with all of its tabs and folders.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::GroupNotFound`].
    pub fn remove_group(&mut self, id: GroupId) -> Result<Group> {
        let index = self.group_index(id)?;
        Ok(self.groups.remove(index))
    }

    /// Adds an empty folder at the end of a group.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] or [`WorkspaceError::GroupNotFound`].
    pub fn add_folder(&mut self, group: GroupId, name: &str) -> Result<FolderId> {
        let name = clean_name(name)?;
        let id = FolderId::new();
        self.group_mut(group)?.children.push(Node::Folder(Folder {
            id,
            name,
            status: None,
            collapsed: false,
            tabs: Vec::new(),
        }));
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

    /// Moves a folder to `index` among the children of `group`, clamped to
    /// the end. Works across groups. Nothing changes when `group` is unknown.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::FolderNotFound`] or [`WorkspaceError::GroupNotFound`].
    pub fn move_folder(&mut self, id: FolderId, group: GroupId, index: usize) -> Result<()> {
        self.group_index(group)?;
        let folder = self.remove_folder(id)?;
        let children = &mut self.group_mut(group)?.children;
        children.insert(index.min(children.len()), Node::Folder(folder));
        Ok(())
    }

    /// Removes a folder together with its tabs.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::FolderNotFound`].
    pub fn remove_folder(&mut self, id: FolderId) -> Result<Folder> {
        for group in &mut self.groups {
            let found = group
                .children
                .iter()
                .position(|node| matches!(node, Node::Folder(folder) if folder.id == id));
            if let Some(index) = found
                && let Node::Folder(folder) = group.children.remove(index)
            {
                return Ok(folder);
            }
        }
        Err(WorkspaceError::FolderNotFound(id))
    }

    /// Adds a tab at the end of `place`. A blank title falls back to the URL.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::GroupNotFound`] or [`WorkspaceError::FolderNotFound`].
    pub fn add_tab(&mut self, place: Place, url: TabUrl, title: &str) -> Result<TabId> {
        let title = tab_title(title, &url);
        let id = TabId::new();
        let tab = Tab {
            id,
            url,
            title,
            status: None,
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

    /// Removes a tab.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TabNotFound`].
    pub fn remove_tab(&mut self, id: TabId) -> Result<Tab> {
        self.take_tab(id).ok_or(WorkspaceError::TabNotFound(id))
    }

    /// Moves a tab to `index` within `place`, clamped to the end. Works
    /// across folders and groups. Nothing changes when `place` is unknown.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TabNotFound`], [`WorkspaceError::GroupNotFound`] or
    /// [`WorkspaceError::FolderNotFound`].
    pub fn move_tab(&mut self, id: TabId, place: Place, index: usize) -> Result<()> {
        self.ensure_place(place)?;
        let tab = self.take_tab(id).ok_or(WorkspaceError::TabNotFound(id))?;
        self.insert_tab(place, index, tab)
    }

    /// Finds a tab with its group and folder.
    #[must_use]
    pub fn find_tab(&self, id: TabId) -> Option<TabRef<'_>> {
        self.groups.iter().find_map(|group| {
            group.children.iter().find_map(|node| match node {
                Node::Tab(tab) if tab.id == id => Some(TabRef {
                    group,
                    folder: None,
                    tab,
                }),
                Node::Tab(_) => None,
                Node::Folder(folder) => {
                    folder
                        .tabs
                        .iter()
                        .find(|tab| tab.id == id)
                        .map(|tab| TabRef {
                            group,
                            folder: Some(folder),
                            tab,
                        })
                }
            })
        })
    }

    /// Sets or clears the status of a tab or folder.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::StatusNotFound`], [`WorkspaceError::TabNotFound`] or
    /// [`WorkspaceError::FolderNotFound`].
    pub fn set_status(&mut self, target: Target, status: Option<StatusId>) -> Result<()> {
        if let Some(status) = &status {
            self.ensure_status(status)?;
        }
        match target {
            Target::Tab(id) => self.tab_mut(id)?.status = status,
            Target::Folder(id) => self.folder_mut(id)?.status = status,
        }
        Ok(())
    }

    /// The status a tab shows: its folder's status when set, else its own.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TabNotFound`].
    pub fn effective_status(&self, id: TabId) -> Result<Option<&StatusId>> {
        let found = self.find_tab(id).ok_or(WorkspaceError::TabNotFound(id))?;
        let folder_status = found.folder.and_then(|folder| folder.status.as_ref());
        Ok(folder_status.or(found.tab.status.as_ref()))
    }

    /// Checks the invariants a deserialized workspace must hold: unique ids
    /// and statuses that exist.
    ///
    /// # Errors
    ///
    /// The first [`WorkspaceError::DuplicateStatus`],
    /// [`WorkspaceError::DuplicateId`] or [`WorkspaceError::StatusNotFound`]
    /// found.
    pub fn validate(&self) -> Result<()> {
        let mut status_ids = HashSet::with_capacity(self.statuses.len());
        for status in &self.statuses {
            if !status_ids.insert(&status.id) {
                return Err(WorkspaceError::DuplicateStatus(status.id.clone()));
            }
        }
        let check_status = |slot: &Option<StatusId>| match slot {
            Some(id) if !status_ids.contains(id) => Err(WorkspaceError::StatusNotFound(id.clone())),
            _ => Ok(()),
        };

        let mut ids = HashSet::new();
        let mut unique = |id: String| {
            if ids.insert(id.clone()) {
                Ok(())
            } else {
                Err(WorkspaceError::DuplicateId(id))
            }
        };
        for group in &self.groups {
            unique(group.id.to_string())?;
            for node in &group.children {
                match node {
                    Node::Tab(tab) => {
                        unique(tab.id.to_string())?;
                        check_status(&tab.status)?;
                    }
                    Node::Folder(folder) => {
                        unique(folder.id.to_string())?;
                        check_status(&folder.status)?;
                        for tab in &folder.tabs {
                            unique(tab.id.to_string())?;
                            check_status(&tab.status)?;
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Adds a status at the end. Its id is derived from the label and made
    /// unique (`blocked`, `blocked-2`…).
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] when `label` is blank.
    pub fn add_status(&mut self, label: &str, color: AccentColor) -> Result<StatusId> {
        let label = clean_name(label)?;
        let base = slug(&label);
        let id = (1..)
            .map(|n| {
                if n == 1 {
                    base.clone()
                } else {
                    format!("{base}-{n}")
                }
            })
            .find(|candidate| {
                self.statuses
                    .iter()
                    .all(|status| status.id.as_str() != candidate)
            })
            .and_then(|candidate| StatusId::parse(&candidate).ok())
            .ok_or(WorkspaceError::EmptyName)?;
        self.statuses.push(Status {
            id: id.clone(),
            label,
            color,
        });
        Ok(id)
    }

    /// Renames a status. Its id stays the same.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] or [`WorkspaceError::StatusNotFound`].
    pub fn rename_status(&mut self, id: &StatusId, label: &str) -> Result<()> {
        let label = clean_name(label)?;
        self.status_mut(id)?.label = label;
        Ok(())
    }

    /// Changes the color of a status.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::StatusNotFound`].
    pub fn set_status_color(&mut self, id: &StatusId, color: AccentColor) -> Result<()> {
        self.status_mut(id)?.color = color;
        Ok(())
    }

    /// Moves a status to `index`, clamped to the end.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::StatusNotFound`].
    pub fn move_status(&mut self, id: &StatusId, index: usize) -> Result<()> {
        let from = self
            .statuses
            .iter()
            .position(|status| &status.id == id)
            .ok_or_else(|| WorkspaceError::StatusNotFound(id.clone()))?;
        let status = self.statuses.remove(from);
        let to = index.min(self.statuses.len());
        self.statuses.insert(to, status);
        Ok(())
    }

    fn status_mut(&mut self, id: &StatusId) -> Result<&mut Status> {
        self.statuses
            .iter_mut()
            .find(|status| &status.id == id)
            .ok_or_else(|| WorkspaceError::StatusNotFound(id.clone()))
    }

    /// Removes a status. Tabs and folders that used it move to
    /// `replacement`, or lose their status when it is `None`.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::StatusNotFound`] for either id, or
    /// [`WorkspaceError::SameStatus`] when both ids are equal.
    pub fn remove_status(
        &mut self,
        id: &StatusId,
        replacement: Option<&StatusId>,
    ) -> Result<Status> {
        if replacement == Some(id) {
            return Err(WorkspaceError::SameStatus);
        }
        if let Some(replacement) = replacement {
            self.ensure_status(replacement)?;
        }
        let index = self
            .statuses
            .iter()
            .position(|status| &status.id == id)
            .ok_or_else(|| WorkspaceError::StatusNotFound(id.clone()))?;

        let reassign = |slot: &mut Option<StatusId>| {
            if slot.as_ref() == Some(id) {
                *slot = replacement.cloned();
            }
        };
        for node in self.groups.iter_mut().flat_map(|group| &mut group.children) {
            match node {
                Node::Tab(tab) => reassign(&mut tab.status),
                Node::Folder(folder) => {
                    reassign(&mut folder.status);
                    folder
                        .tabs
                        .iter_mut()
                        .for_each(|tab| reassign(&mut tab.status));
                }
            }
        }
        Ok(self.statuses.remove(index))
    }

    fn group_index(&self, id: GroupId) -> Result<usize> {
        self.groups
            .iter()
            .position(|group| group.id == id)
            .ok_or(WorkspaceError::GroupNotFound(id))
    }

    fn group_mut(&mut self, id: GroupId) -> Result<&mut Group> {
        self.groups
            .iter_mut()
            .find(|group| group.id == id)
            .ok_or(WorkspaceError::GroupNotFound(id))
    }

    fn folder_mut(&mut self, id: FolderId) -> Result<&mut Folder> {
        self.groups
            .iter_mut()
            .flat_map(|group| &mut group.children)
            .find_map(|node| match node {
                Node::Folder(folder) if folder.id == id => Some(folder),
                _ => None,
            })
            .ok_or(WorkspaceError::FolderNotFound(id))
    }

    fn tab_mut(&mut self, id: TabId) -> Result<&mut Tab> {
        self.groups
            .iter_mut()
            .flat_map(|group| &mut group.children)
            .find_map(|node| match node {
                Node::Tab(tab) if tab.id == id => Some(tab),
                Node::Tab(_) => None,
                Node::Folder(folder) => folder.tabs.iter_mut().find(|tab| tab.id == id),
            })
            .ok_or(WorkspaceError::TabNotFound(id))
    }

    fn ensure_status(&self, id: &StatusId) -> Result<()> {
        if self.statuses.iter().any(|status| &status.id == id) {
            Ok(())
        } else {
            Err(WorkspaceError::StatusNotFound(id.clone()))
        }
    }

    fn ensure_place(&mut self, place: Place) -> Result<()> {
        match place {
            Place::Group(id) => self.group_index(id).map(drop),
            Place::Folder(id) => self.folder_mut(id).map(drop),
        }
    }

    /// Removes a tab from wherever it is.
    fn take_tab(&mut self, id: TabId) -> Option<Tab> {
        for group in &mut self.groups {
            let loose = group
                .children
                .iter()
                .position(|node| matches!(node, Node::Tab(tab) if tab.id == id));
            if let Some(index) = loose
                && let Node::Tab(tab) = group.children.remove(index)
            {
                return Some(tab);
            }
            for node in &mut group.children {
                if let Node::Folder(folder) = node
                    && let Some(index) = folder.tabs.iter().position(|tab| tab.id == id)
                {
                    return Some(folder.tabs.remove(index));
                }
            }
        }
        None
    }

    /// Inserts a tab at `index` (clamped) within `place`.
    fn insert_tab(&mut self, place: Place, index: usize, tab: Tab) -> Result<()> {
        match place {
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
}

/// Lowercase id from a label: letters and digits kept, anything else
/// becomes a single `-`. Falls back to `status` when nothing is left.
fn slug(label: &str) -> String {
    let mut slug = String::with_capacity(label.len());
    for c in label.chars().flat_map(char::to_lowercase) {
        if c.is_alphanumeric() {
            slug.push(c);
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() {
        "status".to_owned()
    } else {
        slug.to_owned()
    }
}

/// Trims a title, using the URL when it is blank.
fn tab_title(raw: &str, url: &TabUrl) -> String {
    match raw.trim() {
        "" => url.as_str().to_owned(),
        trimmed => trimmed.to_owned(),
    }
}

/// Trims a name and rejects it when blank.
fn clean_name(raw: &str) -> Result<String> {
    match raw.trim() {
        "" => Err(WorkspaceError::EmptyName),
        trimmed => Ok(trimmed.to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::browser::BrowserId;

    fn url(raw: &str) -> TabUrl {
        TabUrl::parse(raw).expect("valid test url")
    }

    fn status(raw: &str) -> StatusId {
        StatusId::parse(raw).expect("valid test status")
    }

    fn group_tab_ids(workspace: &Workspace, group: GroupId) -> Vec<TabId> {
        workspace
            .group(group)
            .expect("group exists")
            .children
            .iter()
            .filter_map(|node| match node {
                Node::Tab(tab) => Some(tab.id),
                Node::Folder(_) => None,
            })
            .collect()
    }

    fn folder(workspace: &Workspace, id: FolderId) -> &Folder {
        workspace
            .groups()
            .iter()
            .flat_map(|group| &group.children)
            .find_map(|node| match node {
                Node::Folder(folder) if folder.id == id => Some(folder),
                _ => None,
            })
            .expect("folder exists")
    }

    /// A workspace with one group "Work" holding a folder "Sprint".
    fn work() -> (Workspace, GroupId, FolderId) {
        let mut workspace = Workspace::new();
        let group = workspace
            .add_group("Work", AccentColor::Blue)
            .expect("add group");
        let folder = workspace.add_folder(group, "Sprint").expect("add folder");
        (workspace, group, folder)
    }

    #[test]
    fn new_workspace_has_default_statuses_and_no_groups() {
        let workspace = Workspace::new();

        assert_eq!(workspace.statuses(), default_statuses().as_slice());
        assert!(workspace.groups().is_empty());
    }

    #[test]
    fn add_group_trims_name_and_follows_default_browser() {
        let mut workspace = Workspace::new();

        let id = workspace
            .add_group("  Work  ", AccentColor::Mauve)
            .expect("add group");

        let group = workspace.group(id).expect("group exists");
        assert_eq!(group.name, "Work");
        assert_eq!(group.color, AccentColor::Mauve);
        assert_eq!(group.browser, BrowserChoice::Default);
    }

    #[test]
    fn add_group_rejects_blank_name() {
        let mut workspace = Workspace::new();

        assert_eq!(
            workspace.add_group("   ", AccentColor::Blue),
            Err(WorkspaceError::EmptyName)
        );
        assert!(workspace.groups().is_empty());
    }

    #[test]
    fn rename_unknown_group_fails() {
        let mut workspace = Workspace::new();
        let missing = GroupId::new();

        assert_eq!(
            workspace.rename_group(missing, "X"),
            Err(WorkspaceError::GroupNotFound(missing))
        );
    }

    #[test]
    fn set_group_browser_assigns_a_specific_browser() {
        let (mut workspace, group, _) = work();
        let chrome = BrowserChoice::Specific(BrowserId::parse("com.google.Chrome").expect("id"));

        workspace
            .set_group_browser(group, chrome.clone())
            .expect("set browser");

        assert_eq!(workspace.group(group).expect("group").browser, chrome);
    }

    #[test]
    fn move_group_reorders_and_clamps_index() {
        let mut workspace = Workspace::new();
        let a = workspace.add_group("A", AccentColor::Blue).expect("a");
        let b = workspace.add_group("B", AccentColor::Blue).expect("b");
        let c = workspace.add_group("C", AccentColor::Blue).expect("c");

        workspace.move_group(a, 99).expect("move");

        let order: Vec<_> = workspace.groups().iter().map(|group| group.id).collect();
        assert_eq!(order, [b, c, a]);
    }

    #[test]
    fn remove_group_returns_it() {
        let (mut workspace, group, _) = work();

        let removed = workspace.remove_group(group).expect("remove");

        assert_eq!(removed.name, "Work");
        assert!(workspace.groups().is_empty());
    }

    #[test]
    fn add_tab_uses_url_when_title_is_blank() {
        let (mut workspace, group, _) = work();

        let id = workspace
            .add_tab(Place::Group(group), url("https://a.dev/x"), "  ")
            .expect("add tab");

        assert_eq!(
            workspace.find_tab(id).expect("tab").tab.title,
            "https://a.dev/x"
        );
    }

    #[test]
    fn add_tab_into_folder_is_found_with_its_group_and_folder() {
        let (mut workspace, group, folder_id) = work();

        let id = workspace
            .add_tab(Place::Folder(folder_id), url("https://a.dev"), "Docs")
            .expect("add tab");

        let found = workspace.find_tab(id).expect("tab");
        assert_eq!(found.group.id, group);
        assert_eq!(found.folder.map(|folder| folder.id), Some(folder_id));
        assert_eq!(found.tab.title, "Docs");
    }

    #[test]
    fn add_tab_to_unknown_folder_fails() {
        let (mut workspace, _, _) = work();
        let missing = FolderId::new();

        assert_eq!(
            workspace.add_tab(Place::Folder(missing), url("https://a.dev"), "x"),
            Err(WorkspaceError::FolderNotFound(missing))
        );
    }

    #[test]
    fn set_folder_collapsed_toggles_it() {
        let (mut workspace, _, folder_id) = work();

        workspace
            .set_folder_collapsed(folder_id, true)
            .expect("collapse");

        assert!(folder(&workspace, folder_id).collapsed);
    }

    #[test]
    fn place_and_target_serialize_as_tagged_ids() {
        let id = FolderId::from(uuid::Uuid::nil());
        let nil = "00000000-0000-0000-0000-000000000000";

        assert_eq!(
            serde_json::to_string(&Place::Folder(id)).expect("json"),
            format!(r#"{{"folder":"{nil}"}}"#)
        );
        assert_eq!(
            serde_json::to_string(&Target::Folder(id)).expect("json"),
            format!(r#"{{"folder":"{nil}"}}"#)
        );
    }

    #[test]
    fn remove_folder_removes_its_tabs() {
        let (mut workspace, _, folder_id) = work();
        let tab = workspace
            .add_tab(Place::Folder(folder_id), url("https://a.dev"), "x")
            .expect("add tab");

        let removed = workspace.remove_folder(folder_id).expect("remove");

        assert_eq!(removed.tabs.len(), 1);
        assert!(workspace.find_tab(tab).is_none());
    }

    #[test]
    fn rename_tab_trims_and_falls_back_to_url() {
        let (mut workspace, group, _) = work();
        let tab = workspace
            .add_tab(Place::Group(group), url("https://a.dev/"), "a")
            .expect("tab");

        workspace.rename_tab(tab, "  Docs  ").expect("rename");
        assert_eq!(workspace.find_tab(tab).expect("tab").tab.title, "Docs");

        workspace.rename_tab(tab, " ").expect("rename");
        assert_eq!(
            workspace.find_tab(tab).expect("tab").tab.title,
            "https://a.dev/"
        );
    }

    #[test]
    fn move_folder_reorders_within_its_group() {
        let (mut workspace, group, sprint) = work();
        let tab = workspace
            .add_tab(Place::Group(group), url("https://a.dev/"), "a")
            .expect("tab");

        workspace.move_folder(sprint, group, 99).expect("move");

        let children: Vec<_> = workspace
            .group(group)
            .expect("group")
            .children
            .iter()
            .map(node_id)
            .collect();
        assert_eq!(children, [tab.to_string(), sprint.to_string()]);
    }

    #[test]
    fn move_folder_to_another_group_keeps_its_tabs() {
        let (mut workspace, _, sprint) = work();
        let tab = workspace
            .add_tab(Place::Folder(sprint), url("https://a.dev/"), "a")
            .expect("tab");
        let other = workspace
            .add_group("Other", AccentColor::Green)
            .expect("group");

        workspace.move_folder(sprint, other, 0).expect("move");

        let found = workspace.find_tab(tab).expect("tab");
        assert_eq!(found.group.id, other);
        assert_eq!(found.folder.map(|f| f.id), Some(sprint));
    }

    #[test]
    fn move_folder_to_unknown_group_changes_nothing() {
        let (mut workspace, group, sprint) = work();
        let missing = GroupId::new();

        assert_eq!(
            workspace.move_folder(sprint, missing, 0),
            Err(WorkspaceError::GroupNotFound(missing))
        );
        assert_eq!(workspace.group(group).expect("group").children.len(), 1);
    }

    fn node_id(node: &Node) -> String {
        match node {
            Node::Tab(tab) => tab.id.to_string(),
            Node::Folder(folder) => folder.id.to_string(),
        }
    }

    #[test]
    fn remove_tab_from_folder() {
        let (mut workspace, _, folder_id) = work();
        let tab = workspace
            .add_tab(Place::Folder(folder_id), url("https://a.dev"), "x")
            .expect("add tab");

        workspace.remove_tab(tab).expect("remove");

        assert!(folder(&workspace, folder_id).tabs.is_empty());
        assert_eq!(
            workspace.remove_tab(tab),
            Err(WorkspaceError::TabNotFound(tab))
        );
    }

    #[test]
    fn move_tab_within_group_reorders() {
        let (mut workspace, group, _) = work();
        let a = workspace
            .add_tab(Place::Group(group), url("https://a.dev"), "a")
            .expect("a");
        let b = workspace
            .add_tab(Place::Group(group), url("https://b.dev"), "b")
            .expect("b");

        workspace.move_tab(b, Place::Group(group), 0).expect("move");

        assert_eq!(group_tab_ids(&workspace, group), [b, a]);
    }

    #[test]
    fn move_tab_from_group_into_another_groups_folder() {
        let (mut workspace, work_group, _) = work();
        let other = workspace
            .add_group("Other", AccentColor::Green)
            .expect("other");
        let research = workspace.add_folder(other, "Research").expect("folder");
        let tab = workspace
            .add_tab(Place::Group(work_group), url("https://a.dev"), "a")
            .expect("tab");

        workspace
            .move_tab(tab, Place::Folder(research), 0)
            .expect("move");

        let found = workspace.find_tab(tab).expect("tab");
        assert_eq!(found.group.id, other);
        assert_eq!(found.folder.map(|folder| folder.id), Some(research));
        assert!(group_tab_ids(&workspace, work_group).is_empty());
    }

    #[test]
    fn move_tab_to_unknown_place_keeps_the_tab() {
        let (mut workspace, group, _) = work();
        let tab = workspace
            .add_tab(Place::Group(group), url("https://a.dev"), "a")
            .expect("tab");
        let missing = FolderId::new();

        let result = workspace.move_tab(tab, Place::Folder(missing), 0);

        assert_eq!(result, Err(WorkspaceError::FolderNotFound(missing)));
        assert_eq!(group_tab_ids(&workspace, group), [tab]);
    }

    #[test]
    fn folder_status_overrides_tab_status() {
        let (mut workspace, _, folder_id) = work();
        let tab = workspace
            .add_tab(Place::Folder(folder_id), url("https://a.dev"), "a")
            .expect("tab");
        workspace
            .set_status(Target::Tab(tab), Some(status("todo")))
            .expect("tab status");

        assert_eq!(workspace.effective_status(tab), Ok(Some(&status("todo"))));

        workspace
            .set_status(Target::Folder(folder_id), Some(status("done")))
            .expect("folder status");

        assert_eq!(workspace.effective_status(tab), Ok(Some(&status("done"))));
    }

    #[test]
    fn set_unknown_status_fails() {
        let (mut workspace, _, folder_id) = work();

        assert_eq!(
            workspace.set_status(Target::Folder(folder_id), Some(status("nope"))),
            Err(WorkspaceError::StatusNotFound(status("nope")))
        );
    }

    #[test]
    fn remove_status_moves_users_to_replacement() {
        let (mut workspace, group, folder_id) = work();
        let tab = workspace
            .add_tab(Place::Group(group), url("https://a.dev"), "a")
            .expect("tab");
        workspace
            .set_status(Target::Tab(tab), Some(status("in-dev")))
            .expect("tab");
        workspace
            .set_status(Target::Folder(folder_id), Some(status("in-dev")))
            .expect("folder");

        let removed = workspace
            .remove_status(&status("in-dev"), Some(&status("done")))
            .expect("remove");

        assert_eq!(removed.label, "In dev");
        assert_eq!(workspace.effective_status(tab), Ok(Some(&status("done"))));
        assert_eq!(folder(&workspace, folder_id).status, Some(status("done")));
        assert!(
            workspace
                .statuses()
                .iter()
                .all(|s| s.id != status("in-dev"))
        );
    }

    #[test]
    fn remove_status_without_replacement_clears_it() {
        let (mut workspace, group, _) = work();
        let tab = workspace
            .add_tab(Place::Group(group), url("https://a.dev"), "a")
            .expect("tab");
        workspace
            .set_status(Target::Tab(tab), Some(status("todo")))
            .expect("tab");

        workspace
            .remove_status(&status("todo"), None)
            .expect("remove");

        assert_eq!(workspace.effective_status(tab), Ok(None));
    }

    #[test]
    fn add_status_derives_a_unique_id_from_the_label() {
        let mut workspace = Workspace::new();

        let blocked = workspace
            .add_status("  Blocked by QA ", AccentColor::Red)
            .expect("add");
        let again = workspace
            .add_status("Blocked by QA", AccentColor::Red)
            .expect("add");
        let accented = workspace
            .add_status("Revisión", AccentColor::Pink)
            .expect("add");
        let symbols = workspace.add_status("!!!", AccentColor::Sky).expect("add");

        assert_eq!(blocked.as_str(), "blocked-by-qa");
        assert_eq!(again.as_str(), "blocked-by-qa-2");
        assert_eq!(accented.as_str(), "revisión");
        assert_eq!(symbols.as_str(), "status");
        let last = workspace.statuses().last().expect("status");
        assert_eq!((last.label.as_str(), last.color), ("!!!", AccentColor::Sky));
        assert_eq!(workspace.validate(), Ok(()));
    }

    #[test]
    fn add_status_rejects_blank_label() {
        let mut workspace = Workspace::new();

        assert_eq!(
            workspace.add_status(" ", AccentColor::Red),
            Err(WorkspaceError::EmptyName)
        );
    }

    #[test]
    fn rename_and_recolor_keep_the_id() {
        let mut workspace = Workspace::new();

        workspace
            .rename_status(&status("todo"), " Pendiente ")
            .expect("rename");
        workspace
            .set_status_color(&status("todo"), AccentColor::Teal)
            .expect("color");

        let todo = &workspace.statuses()[0];
        assert_eq!(todo.id, status("todo"));
        assert_eq!(
            (todo.label.as_str(), todo.color),
            ("Pendiente", AccentColor::Teal)
        );
        assert_eq!(
            workspace.rename_status(&status("nope"), "x"),
            Err(WorkspaceError::StatusNotFound(status("nope")))
        );
    }

    #[test]
    fn move_status_reorders_and_clamps() {
        let mut workspace = Workspace::new();

        workspace.move_status(&status("todo"), 99).expect("move");

        let ids: Vec<_> = workspace.statuses().iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["in-progress", "in-review", "in-dev", "done", "todo"]);
    }

    #[test]
    fn remove_status_rejects_itself_or_unknown_replacement() {
        let mut workspace = Workspace::new();

        assert_eq!(
            workspace.remove_status(&status("todo"), Some(&status("todo"))),
            Err(WorkspaceError::SameStatus)
        );
        assert_eq!(
            workspace.remove_status(&status("todo"), Some(&status("nope"))),
            Err(WorkspaceError::StatusNotFound(status("nope")))
        );
        assert_eq!(workspace.statuses().len(), default_statuses().len());
    }

    #[test]
    fn workspace_round_trips_through_json() {
        let (mut workspace, group, folder_id) = work();
        workspace
            .add_tab(Place::Folder(folder_id), url("https://a.dev"), "a")
            .expect("tab");
        workspace
            .add_tab(Place::Group(group), url("https://b.dev"), "b")
            .expect("tab");

        let json = serde_json::to_string(&workspace).expect("serialize");
        let back: Workspace = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(back, workspace);
    }

    #[test]
    fn built_workspace_is_valid() {
        let (mut workspace, group, folder_id) = work();
        let tab = workspace
            .add_tab(Place::Group(group), url("https://a.dev"), "a")
            .expect("tab");
        workspace
            .set_status(Target::Tab(tab), Some(status("todo")))
            .expect("status");
        workspace
            .set_status(Target::Folder(folder_id), Some(status("done")))
            .expect("status");

        assert_eq!(workspace.validate(), Ok(()));
    }

    fn from_json(json: &str) -> Workspace {
        serde_json::from_str(json).expect("valid json shape")
    }

    const TAB_A: &str = "00000000-0000-0000-0000-00000000000a";
    const GROUP_1: &str = "00000000-0000-0000-0000-000000000001";

    #[test]
    fn validate_rejects_unknown_status_reference() {
        let workspace = from_json(&format!(
            r#"{{"statuses":[],"groups":[{{"id":"{GROUP_1}","name":"G","color":"blue",
            "children":[{{"type":"tab","id":"{TAB_A}","url":"https://a.dev","title":"a","status":"ghost"}}]}}]}}"#
        ));

        assert_eq!(
            workspace.validate(),
            Err(WorkspaceError::StatusNotFound(status("ghost")))
        );
    }

    #[test]
    fn validate_rejects_duplicate_status() {
        let workspace = from_json(
            r#"{"statuses":[{"id":"todo","label":"A","color":"blue"},{"id":"todo","label":"B","color":"red"}],"groups":[]}"#,
        );

        assert_eq!(
            workspace.validate(),
            Err(WorkspaceError::DuplicateStatus(status("todo")))
        );
    }

    #[test]
    fn validate_rejects_tab_id_used_twice() {
        let workspace = from_json(&format!(
            r#"{{"statuses":[],"groups":[{{"id":"{GROUP_1}","name":"G","color":"blue","children":[
            {{"type":"tab","id":"{TAB_A}","url":"https://a.dev","title":"a"}},
            {{"type":"folder","id":"00000000-0000-0000-0000-0000000000f1","name":"F","tabs":[
              {{"id":"{TAB_A}","url":"https://b.dev","title":"b"}}]}}]}}]}}"#
        ));

        assert_eq!(
            workspace.validate(),
            Err(WorkspaceError::DuplicateId(TAB_A.to_owned()))
        );
    }

    mod props {
        use super::*;
        use proptest::prelude::*;

        fn all_tab_ids(workspace: &Workspace) -> Vec<TabId> {
            let mut ids: Vec<_> = workspace
                .groups()
                .iter()
                .flat_map(|group| &group.children)
                .flat_map(|node| match node {
                    Node::Tab(tab) => vec![tab.id],
                    Node::Folder(folder) => folder.tabs.iter().map(|tab| tab.id).collect(),
                })
                .collect();
            ids.sort();
            ids
        }

        proptest! {
            /// Any sequence of moves keeps every tab exactly once.
            #[test]
            fn moves_never_lose_or_duplicate_tabs(
                moves in prop::collection::vec((0usize..6, 0usize..4, 0usize..8), 0..40)
            ) {
                let (mut workspace, group, folder_id) = work();
                let other = workspace.add_group("Other", AccentColor::Green).expect("other");
                let other_folder = workspace.add_folder(other, "F").expect("folder");
                let places = [
                    Place::Group(group),
                    Place::Folder(folder_id),
                    Place::Group(other),
                    Place::Folder(other_folder),
                ];
                let tabs: Vec<_> = (0..6)
                    .map(|n| {
                        workspace
                            .add_tab(places[n % 4], url(&format!("https://t{n}.dev")), "t")
                            .expect("tab")
                    })
                    .collect();
                let before = all_tab_ids(&workspace);

                for (tab, place, index) in moves {
                    workspace.move_tab(tabs[tab], places[place], index).expect("move");
                }

                prop_assert_eq!(all_tab_ids(&workspace), before);
            }
        }
    }
}
