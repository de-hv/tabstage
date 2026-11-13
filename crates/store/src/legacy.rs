//! Reads data files from before tickets (versions 1–4) and imports them.
//!
//! Older files held groups, folders and tabs. They are not upgraded in
//! place: the app keeps them aside and the user imports them, choosing what
//! each group, folder and tab becomes (see [`Role`]). Every item without a
//! choice gets a suggestion that depends on what its parent became, so the
//! same rules give the preview and the import.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tabstage_core::{
    Icon, Note, NoteId, Profile, ProfileColor, ProfileId, StatusId, TabUrl, TextOwner, Ticket,
    TicketId, TicketKind, TicketPlace, Workspace, WorkspaceError,
};

use crate::migrate::{self, MigratedBinding};
use crate::{APP, Result, StoreError, TICKETS_VERSION};

/// What an old group, folder or tab becomes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    /// A status; what it held goes into it (groups and folders).
    Status,
    /// A ticket; what it held becomes its sub-tickets and the links in its
    /// note.
    Ticket,
    /// A sub-ticket of the ticket it is in.
    SubTicket,
    /// The address and key of the ticket it is in (tabs).
    OwnLink,
    /// A Markdown link in the note of the ticket or note it is in (tabs).
    Link,
    /// A note; what it held becomes links in its body (groups and folders).
    Note,
    /// Nothing: what it held goes where it is (groups and folders).
    Unwrap,
}

/// Kind of an old item.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LegacyKind {
    /// A group.
    Group,
    /// A folder.
    Folder,
    /// A tab.
    Tab,
}

/// A group, folder or tab of an old file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyItem {
    /// Its id in the old file, used to choose its [`Role`].
    pub id: String,
    /// Group, folder or tab.
    pub kind: LegacyKind,
    /// Its name (a tab's title).
    pub name: String,
    /// A tab's address.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Its ticket id, such as `PROJ-123`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// Its note.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Its custom icon.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<Icon>,
    /// Its color, when it had one of the profile colors.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<ProfileColor>,
    /// What it held.
    pub children: Vec<LegacyItem>,
}

/// A profile of an old file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyProfile {
    /// Its id, kept on import so this machine's browser choice still applies.
    pub id: ProfileId,
    /// Its name.
    pub name: String,
    /// Its dot color.
    pub color: ProfileColor,
    /// Its groups, folders and tabs.
    pub items: Vec<LegacyItem>,
}

/// The content of an old file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyTree {
    /// Version the file was written with.
    pub version: u32,
    /// Its profiles.
    pub profiles: Vec<LegacyProfile>,
    /// Browsers a version 1 file chose, for this machine's config.
    #[serde(skip)]
    pub bindings: Vec<MigratedBinding>,
}

/// Reads a data file from before tickets.
///
/// # Errors
///
/// [`StoreError::Parse`], [`StoreError::NotTabstage`], or
/// [`StoreError::UnsupportedVersion`] for a current or newer file.
pub fn read_legacy(text: &str) -> Result<LegacyTree> {
    let mut value: Value = serde_json::from_str(text).map_err(StoreError::Parse)?;
    if value.get("app").and_then(Value::as_str) != Some(APP) {
        return Err(StoreError::NotTabstage);
    }
    let version = value
        .get("version")
        .and_then(Value::as_u64)
        .and_then(|version| u32::try_from(version).ok())
        .unwrap_or(0);
    if version >= TICKETS_VERSION {
        return Err(StoreError::UnsupportedVersion(version));
    }
    let bindings = if version < 2 {
        migrate::upgrade_v1(&mut value)
    } else {
        Vec::new()
    };
    migrate::fill_profile_colors(&mut value);
    if version < 3 {
        migrate::upgrade_v2(&mut value);
    }
    let file: OldFile = serde_json::from_value(value).map_err(StoreError::Parse)?;
    Ok(LegacyTree {
        version,
        profiles: file
            .workspace
            .profiles
            .into_iter()
            .map(|profile| LegacyProfile {
                id: profile.id,
                name: profile.name,
                color: profile.color,
                items: profile.items.into_iter().map(OldItem::into_item).collect(),
            })
            .collect(),
        bindings,
    })
}

/// What an import did.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    /// The role each old item got, chosen or suggested.
    pub roles: HashMap<String, Role>,
    /// Statuses created.
    pub statuses: usize,
    /// Tickets and sub-tickets created.
    pub tickets: usize,
    /// Notes created.
    pub notes: usize,
    /// Links written into notes.
    pub links: usize,
}

/// Imports an old file into `workspace`, adding to what is there. `chosen`
/// holds the roles the user picked, by old id; every other item gets the
/// suggested one.
///
/// A profile with the same id (or else the same name) takes the imported
/// items; others are created with their old id. A status with the same name
/// is reused. When the workspace was still the untouched default profile,
/// that profile is dropped.
///
/// # Errors
///
/// A [`WorkspaceError`] if the result breaks a workspace rule.
pub fn import_legacy(
    workspace: &mut Workspace,
    tree: &LegacyTree,
    chosen: &HashMap<String, Role>,
) -> std::result::Result<ImportSummary, WorkspaceError> {
    let untouched = untouched_default(workspace);
    let mut importer = Importer {
        workspace,
        chosen,
        summary: ImportSummary::default(),
    };
    for profile in &tree.profiles {
        let id = importer.profile_for(profile)?;
        let context = Context {
            profile: id,
            status: None,
            ticket: None,
            note: None,
        };
        for item in &profile.items {
            importer.item(item, None, context)?;
        }
    }
    let summary = importer.summary;
    if let Some(default) = untouched
        && workspace.profiles().len() > 1
        && let Some(other) = workspace
            .profiles()
            .iter()
            .find(|profile| profile.id != default)
            .map(|profile| profile.id)
    {
        workspace.remove_profile(default, other)?;
    }
    workspace.validate()?;
    Ok(summary)
}

/// The id of the only profile when it is the empty default one a new file
/// starts with.
fn untouched_default(workspace: &Workspace) -> Option<ProfileId> {
    match workspace.profiles() {
        [only]
            if only.name == tabstage_core::DEFAULT_PROFILE_NAME
                && only.tickets.is_empty()
                && only.notes.is_empty() =>
        {
            Some(only.id)
        }
        _ => None,
    }
}

/// Where imported items go.
#[derive(Debug, Clone, Copy)]
struct Context {
    profile: ProfileId,
    status: Option<StatusId>,
    /// The ticket being filled, and whether it is a sub-ticket.
    ticket: Option<(TicketId, bool)>,
    note: Option<NoteId>,
}

struct Importer<'a> {
    workspace: &'a mut Workspace,
    chosen: &'a HashMap<String, Role>,
    summary: ImportSummary,
}

impl Importer<'_> {
    fn profile_for(
        &mut self,
        old: &LegacyProfile,
    ) -> std::result::Result<ProfileId, WorkspaceError> {
        let profiles = self.workspace.profiles();
        if let Some(found) = profiles
            .iter()
            .find(|profile| profile.id == old.id)
            .or_else(|| {
                profiles
                    .iter()
                    .find(|profile| profile.name.eq_ignore_ascii_case(&old.name))
            })
        {
            return Ok(found.id);
        }
        self.workspace.insert_profile(Profile {
            id: old.id,
            name: old.name.clone(),
            color: old.color,
            tickets: Vec::new(),
            notes: Vec::new(),
        })?;
        Ok(old.id)
    }

    fn status_for(&mut self, item: &LegacyItem) -> std::result::Result<StatusId, WorkspaceError> {
        if let Some(found) = self
            .workspace
            .statuses()
            .iter()
            .find(|status| status.name.eq_ignore_ascii_case(item.name.trim()))
        {
            return Ok(found.id);
        }
        let color = item.color.unwrap_or_else(|| {
            ProfileColor::next_after(self.workspace.statuses().iter().map(|status| status.color))
        });
        self.summary.statuses += 1;
        let name = if item.name.trim().is_empty() {
            "Status"
        } else {
            &item.name
        };
        self.workspace.add_status(name, color)
    }

    /// The role of an item: the chosen one if it fits, else the suggested one.
    fn role(&self, item: &LegacyItem, parent: Option<Role>, context: Context) -> Role {
        let suggested = suggest(item, parent, context);
        let role = self.chosen.get(&item.id).copied().unwrap_or(suggested);
        let fits = match item.kind {
            LegacyKind::Tab => matches!(
                role,
                Role::Ticket | Role::SubTicket | Role::OwnLink | Role::Link
            ),
            LegacyKind::Group | LegacyKind::Folder => !matches!(role, Role::OwnLink | Role::Link),
        };
        if fits { role } else { suggested }
    }

    fn item(
        &mut self,
        item: &LegacyItem,
        parent: Option<Role>,
        context: Context,
    ) -> std::result::Result<(), WorkspaceError> {
        let role = self.role(item, parent, context);
        self.summary.roles.insert(item.id.clone(), role);
        match (item.kind, role) {
            (LegacyKind::Tab, Role::SubTicket) => match context.ticket {
                Some((parent_ticket, false)) => {
                    self.ticket_from(item, TicketPlace::Ticket(parent_ticket), context.status)?;
                }
                _ => self.tab_ticket(item, context)?,
            },
            (LegacyKind::Tab, Role::OwnLink) => match context.ticket {
                Some((ticket, _)) => self.own_link(item, ticket)?,
                None => self.tab_ticket(item, context)?,
            },
            (LegacyKind::Tab, Role::Link) => {
                let owner = context
                    .ticket
                    .map(|(ticket, _)| TextOwner::Ticket(ticket))
                    .or(context.note.map(TextOwner::Note));
                match owner {
                    Some(owner) => self.link(item, owner)?,
                    None => self.tab_ticket(item, context)?,
                }
            }
            (LegacyKind::Tab, _) => self.tab_ticket(item, context)?,
            (_, Role::Status) => {
                let status = self.status_for(item)?;
                if let Some(text) = &item.note {
                    self.note(item, context.profile, Some(text))?;
                }
                let inner = Context {
                    status: Some(status),
                    ticket: None,
                    note: None,
                    ..context
                };
                self.children(item, role, inner)?;
            }
            (_, Role::Ticket | Role::SubTicket) => {
                let (place, is_sub) = match (role, context.ticket) {
                    (Role::SubTicket, Some((parent_ticket, false))) => {
                        (TicketPlace::Ticket(parent_ticket), true)
                    }
                    _ => (TicketPlace::Profile(context.profile), false),
                };
                let ticket = self.ticket_from(item, place, context.status)?;
                let inner = Context {
                    ticket: Some((ticket, is_sub)),
                    note: None,
                    ..context
                };
                let effective = if is_sub {
                    Role::SubTicket
                } else {
                    Role::Ticket
                };
                self.children(item, effective, inner)?;
            }
            (_, Role::Note) => {
                let note = self.note(item, context.profile, item.note.as_ref())?;
                let inner = Context {
                    ticket: None,
                    note: Some(note),
                    ..context
                };
                self.children(item, role, inner)?;
            }
            (_, _) => self.children(item, parent.unwrap_or(Role::Unwrap), context)?,
        }
        Ok(())
    }

    fn children(
        &mut self,
        item: &LegacyItem,
        role: Role,
        context: Context,
    ) -> std::result::Result<(), WorkspaceError> {
        for child in &item.children {
            self.item(child, Some(role), context)?;
        }
        Ok(())
    }

    /// A tab as a ticket of its own, directly in the profile.
    fn tab_ticket(
        &mut self,
        item: &LegacyItem,
        context: Context,
    ) -> std::result::Result<(), WorkspaceError> {
        self.ticket_from(item, TicketPlace::Profile(context.profile), context.status)
            .map(drop)
    }

    fn ticket_from(
        &mut self,
        item: &LegacyItem,
        place: TicketPlace,
        status: Option<StatusId>,
    ) -> std::result::Result<TicketId, WorkspaceError> {
        let id = TicketId::new();
        let title = if item.name.trim().is_empty() {
            item.key.clone().unwrap_or_else(|| "Ticket".to_owned())
        } else {
            item.name.trim().to_owned()
        };
        self.workspace.insert_ticket(
            place,
            usize::MAX,
            Ticket {
                id,
                title,
                key: item.key.clone(),
                url: item.url.as_deref().and_then(|url| TabUrl::parse(url).ok()),
                status,
                kind: TicketKind::default(),
                icon: item.icon.clone(),
                note: item.note.clone(),
                children: Vec::new(),
            },
        )?;
        self.summary.tickets += 1;
        Ok(id)
    }

    /// Makes a tab the address and key of the ticket it is in; its note is
    /// added to the ticket's.
    fn own_link(
        &mut self,
        item: &LegacyItem,
        ticket: TicketId,
    ) -> std::result::Result<(), WorkspaceError> {
        let current = self
            .workspace
            .ticket(ticket)
            .ok_or(WorkspaceError::TicketNotFound(ticket))?
            .ticket
            .clone();
        if current.url.is_none()
            && let Some(url) = item.url.as_deref().and_then(|url| TabUrl::parse(url).ok())
        {
            self.workspace.set_ticket_address(ticket, Some(url))?;
        } else if current.url.is_some() {
            // The ticket already has an address: keep this one as a link.
            return self.link(item, TextOwner::Ticket(ticket));
        }
        if current.key.is_none()
            && let Some(key) = &item.key
        {
            self.workspace.set_ticket_key(ticket, key)?;
        }
        if let Some(extra) = &item.note {
            let note = match &current.note {
                Some(existing) => format!("{existing}\n\n{extra}"),
                None => extra.clone(),
            };
            self.workspace.set_text(TextOwner::Ticket(ticket), &note)?;
        }
        Ok(())
    }

    /// Adds a tab as a Markdown link at the end of a ticket's note or a
    /// note's body.
    fn link(
        &mut self,
        item: &LegacyItem,
        owner: TextOwner,
    ) -> std::result::Result<(), WorkspaceError> {
        let Some(url) = item.url.as_deref().and_then(|url| TabUrl::parse(url).ok()) else {
            return Ok(());
        };
        let title = match &item.key {
            Some(key) if !item.name.contains(key.as_str()) => format!("{key} {}", item.name),
            _ => item.name.clone(),
        };
        let current = match owner {
            TextOwner::Ticket(id) => self
                .workspace
                .ticket(id)
                .ok_or(WorkspaceError::TicketNotFound(id))?
                .ticket
                .note
                .clone(),
            TextOwner::Note(id) => self
                .workspace
                .note(id)
                .ok_or(WorkspaceError::NoteNotFound(id))?
                .1
                .body
                .clone(),
        };
        let text = migrate::append_line(
            current.as_deref(),
            &migrate::link_line(&title, url.as_str()),
        );
        self.workspace.set_text(owner, &text)?;
        self.summary.links += 1;
        Ok(())
    }

    fn note(
        &mut self,
        item: &LegacyItem,
        profile: ProfileId,
        body: Option<&String>,
    ) -> std::result::Result<NoteId, WorkspaceError> {
        let id = NoteId::new();
        let title = if item.name.trim().is_empty() {
            "Note".to_owned()
        } else {
            item.name.trim().to_owned()
        };
        self.workspace.insert_note(
            profile,
            Note {
                id,
                title,
                icon: item.icon.clone(),
                body: body.cloned(),
            },
        )?;
        self.summary.notes += 1;
        Ok(id)
    }
}

/// The suggested role of an item, from what its parent became.
///
/// - A top-level group or folder becomes a status, or a note when it holds
///   no tabs.
/// - A folder in a status becomes a ticket when it holds an epic (a tab
///   whose title says "epic"), else it is unwrapped so its tabs become
///   tickets.
/// - In a ticket, the epic tab gives the ticket its address and key, tabs
///   with a ticket id become sub-tickets and the others links in its note.
/// - In a note, tabs become links in its body; anywhere else, tickets.
fn suggest(item: &LegacyItem, parent: Option<Role>, context: Context) -> Role {
    match item.kind {
        LegacyKind::Group | LegacyKind::Folder => match parent {
            None if count_tabs(item) == 0 => Role::Note,
            None => Role::Status,
            Some(Role::Status | Role::Unwrap) if context.ticket.is_none() => {
                if item.children.iter().any(is_epic) {
                    Role::Ticket
                } else {
                    Role::Unwrap
                }
            }
            Some(Role::Ticket) => Role::SubTicket,
            _ => Role::Unwrap,
        },
        LegacyKind::Tab => match (context.ticket, context.note) {
            (Some(_), _) if is_epic(item) => Role::OwnLink,
            (Some((_, false)), _) if item.key.is_some() => Role::SubTicket,
            (Some(_), _) => Role::Link,
            (None, Some(_)) => Role::Link,
            (None, None) => Role::Ticket,
        },
    }
}

fn is_epic(item: &LegacyItem) -> bool {
    item.kind == LegacyKind::Tab && item.name.to_lowercase().contains("epic")
}

fn count_tabs(item: &LegacyItem) -> usize {
    match item.kind {
        LegacyKind::Tab => 1,
        _ => item.children.iter().map(count_tabs).sum(),
    }
}

// ---- the old format -----------------------------------------------------------

#[derive(Deserialize)]
struct OldFile {
    workspace: OldWorkspace,
}

#[derive(Deserialize)]
struct OldWorkspace {
    #[serde(default)]
    profiles: Vec<OldProfile>,
}

#[derive(Deserialize)]
struct OldProfile {
    id: ProfileId,
    name: String,
    color: ProfileColor,
    #[serde(default)]
    items: Vec<OldItem>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum OldItem {
    Group(OldContainer),
    Folder(OldContainer),
    Tab(OldTab),
}

#[derive(Deserialize)]
struct OldContainer {
    id: String,
    #[serde(default)]
    name: String,
    /// An accent name (v3), a palette index or `"none"`/`"parent"` (v4).
    #[serde(default)]
    color: Value,
    #[serde(default)]
    icon: Option<Icon>,
    #[serde(default, rename = "ticketId")]
    ticket_id: Option<String>,
    #[serde(default)]
    note: Option<String>,
    /// A group's tabs and folders.
    #[serde(default)]
    children: Vec<OldItem>,
    /// A folder's tabs.
    #[serde(default)]
    tabs: Vec<OldTab>,
}

#[derive(Deserialize)]
struct OldTab {
    id: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    icon: Option<Icon>,
    #[serde(default, rename = "ticketId")]
    ticket_id: Option<String>,
    #[serde(default)]
    note: Option<String>,
}

impl OldItem {
    fn into_item(self) -> LegacyItem {
        match self {
            Self::Group(container) => container.into_item(LegacyKind::Group),
            Self::Folder(container) => container.into_item(LegacyKind::Folder),
            Self::Tab(tab) => tab.into_item(),
        }
    }
}

impl OldContainer {
    fn into_item(self, kind: LegacyKind) -> LegacyItem {
        let color = self
            .color
            .as_u64()
            .and_then(|index| u8::try_from(index).ok())
            .and_then(|index| ProfileColor::new(index).ok());
        let mut children: Vec<LegacyItem> =
            self.children.into_iter().map(OldItem::into_item).collect();
        children.extend(self.tabs.into_iter().map(OldTab::into_item));
        LegacyItem {
            id: self.id,
            kind,
            name: self.name,
            url: None,
            key: self.ticket_id,
            note: self.note,
            icon: self.icon,
            color,
            children,
        }
    }
}

impl OldTab {
    fn into_item(self) -> LegacyItem {
        LegacyItem {
            id: self.id,
            kind: LegacyKind::Tab,
            name: self.title,
            url: Some(self.url),
            key: self.ticket_id,
            note: self.note,
            icon: self.icon,
            color: None,
            children: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests;
