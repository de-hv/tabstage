//! The workspace: profiles that hold tickets and notes, and the statuses
//! tickets move through.
//!
//! A profile holds tickets and notes. A ticket holds links and sub-tickets
//! (one level: a sub-ticket holds links only); a note holds links. Statuses
//! are shared by every profile. Order is the position in each `Vec`, so there
//! are no order fields that can get out of sync. Every change goes through a
//! [`Workspace`] method that checks its references and returns a
//! [`WorkspaceError`] instead of panicking.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::icon::Icon;
use crate::ids::{NoteId, ProfileId, StatusId, TabId, TicketId};
use crate::profile::{DEFAULT_PROFILE_NAME, Profile, ProfileColor};
use crate::url::TabUrl;

/// A saved tab of a ticket or a note.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Link {
    /// Stable id.
    pub id: TabId,
    /// Where it points.
    pub url: TabUrl,
    /// Title shown in the UI.
    pub title: String,
    /// Custom icon; the UI shows the default link icon without one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<Icon>,
}

/// A piece of work, such as a Jira issue, with its links and sub-tickets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ticket {
    /// Stable id.
    pub id: TicketId,
    /// Title shown in the UI.
    pub title: String,
    /// Key in Jira or a similar tracker, such as `PROJ-123`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// The ticket's own address, such as its page in the tracker.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<TabUrl>,
    /// Where it is in the workflow; none until one is chosen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<StatusId>,
    /// Custom icon; the UI shows the default ticket icon without one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<Icon>,
    /// Free-form note in Markdown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Other tabs that belong to the ticket.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<Link>,
    /// Sub-tickets. Always empty for a sub-ticket.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Ticket>,
}

/// Something that is not a ticket, such as standup notes, with its links.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Note {
    /// Stable id.
    pub id: NoteId,
    /// Title shown in the UI.
    pub title: String,
    /// Custom icon; the UI shows the default note icon without one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<Icon>,
    /// The note itself, in Markdown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Tabs that belong to the note.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<Link>,
}

/// A step of the workflow, such as "In review", shared by every profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Status {
    /// Stable id.
    pub id: StatusId,
    /// Name shown in the UI.
    pub name: String,
    /// Color of its tickets' rows.
    pub color: ProfileColor,
}

/// Where a ticket goes: directly in a profile, or under a ticket as a
/// sub-ticket.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TicketPlace {
    /// Directly in a profile.
    Profile(ProfileId),
    /// Under a ticket, as a sub-ticket.
    Ticket(TicketId),
}

/// What holds links: a ticket (or sub-ticket) or a note.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkOwner {
    /// A ticket or sub-ticket.
    Ticket(TicketId),
    /// A note.
    Note(NoteId),
}

/// A ticket, note or link, for changes that apply to any of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    /// A ticket or sub-ticket.
    Ticket(TicketId),
    /// A note.
    Note(NoteId),
    /// A link.
    Link(TabId),
}

/// A ticket together with what contains it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TicketRef<'a> {
    /// The profile it belongs to.
    pub profile: &'a Profile,
    /// Its parent, for a sub-ticket.
    pub parent: Option<&'a Ticket>,
    /// The ticket.
    pub ticket: &'a Ticket,
}

/// A link together with what contains it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LinkRef<'a> {
    /// The profile it belongs to.
    pub profile: &'a Profile,
    /// The ticket or note that holds it.
    pub owner: LinkOwner,
    /// The link.
    pub link: &'a Link,
}

/// Errors returned by [`Workspace`] changes.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum WorkspaceError {
    /// No profile has this id.
    #[error("profile {0} not found")]
    ProfileNotFound(ProfileId),
    /// No ticket has this id.
    #[error("ticket {0} not found")]
    TicketNotFound(TicketId),
    /// No note has this id.
    #[error("note {0} not found")]
    NoteNotFound(NoteId),
    /// No link has this id.
    #[error("link {0} not found")]
    LinkNotFound(TabId),
    /// No status has this id.
    #[error("status {0} not found")]
    StatusNotFound(StatusId),
    /// A name was empty or only whitespace.
    #[error("name is empty")]
    EmptyName,
    /// A sub-ticket cannot hold sub-tickets, and a ticket with sub-tickets
    /// cannot become one.
    #[error("sub-tickets cannot hold sub-tickets")]
    NestedTicket,
    /// Two items share the same id.
    #[error("id {0} is used more than once")]
    DuplicateId(String),
    /// A profile cannot take over its own items when it is removed.
    #[error("a profile cannot be replaced by itself")]
    SameProfile,
    /// A workspace must have at least one profile.
    #[error("the workspace has no profiles")]
    NoProfiles,
    /// The ticket has no address of its own.
    #[error("the ticket has no address")]
    NoTicketLink,
}

/// Result type for workspace changes.
pub type Result<T> = std::result::Result<T, WorkspaceError>;

/// Everything a user keeps: statuses, profiles and what they hold.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Workspace {
    /// The workflow, in order.
    #[serde(default)]
    statuses: Vec<Status>,
    profiles: Vec<Profile>,
    /// Items shown in the sidebar's "Pinned" section, in order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pinned: Vec<Target>,
}

impl Default for Workspace {
    fn default() -> Self {
        Self::new()
    }
}

impl Workspace {
    /// A workspace with one empty profile and no statuses.
    #[must_use]
    pub fn new() -> Self {
        Self {
            statuses: Vec::new(),
            profiles: vec![Profile {
                id: ProfileId::new(),
                name: DEFAULT_PROFILE_NAME.to_owned(),
                color: ProfileColor::default(),
                tickets: Vec::new(),
                notes: Vec::new(),
            }],
            pinned: Vec::new(),
        }
    }

    /// A workspace with these statuses and profiles. Call
    /// [`Workspace::validate`] before trusting it.
    #[must_use]
    pub fn from_parts(statuses: Vec<Status>, profiles: Vec<Profile>) -> Self {
        Self {
            statuses,
            profiles,
            pinned: Vec::new(),
        }
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
            tickets: Vec::new(),
            notes: Vec::new(),
        });
        Ok(id)
    }

    /// Adds a profile as it is, such as one imported from an older file.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::DuplicateId`] when its id is taken.
    pub fn insert_profile(&mut self, profile: Profile) -> Result<()> {
        if self.profile(profile.id).is_some() {
            return Err(WorkspaceError::DuplicateId(profile.id.to_string()));
        }
        self.profiles.push(profile);
        Ok(())
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

    /// Removes a profile and appends its tickets and notes to `move_items_to`.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::ProfileNotFound`] for either id, or
    /// [`WorkspaceError::SameProfile`] when both ids are equal. Together
    /// these keep at least one profile.
    pub fn remove_profile(&mut self, id: ProfileId, move_items_to: ProfileId) -> Result<Profile> {
        let index = self.profile_index(id)?;
        if id == move_items_to {
            return Err(WorkspaceError::SameProfile);
        }
        self.profile_index(move_items_to)?;
        let mut removed = self.profiles.remove(index);
        let tickets = std::mem::take(&mut removed.tickets);
        let notes = std::mem::take(&mut removed.notes);
        let target = self.profile_mut(move_items_to)?;
        target.tickets.extend(tickets);
        target.notes.extend(notes);
        Ok(removed)
    }

    // ---- statuses -------------------------------------------------------

    /// Statuses in workflow order.
    #[must_use]
    pub fn statuses(&self) -> &[Status] {
        &self.statuses
    }

    /// The status with this id.
    #[must_use]
    pub fn status(&self, id: StatusId) -> Option<&Status> {
        self.statuses.iter().find(|status| status.id == id)
    }

    /// Adds a status at the end of the workflow.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`].
    pub fn add_status(&mut self, name: &str, color: ProfileColor) -> Result<StatusId> {
        let name = clean_name(name)?;
        let id = StatusId::new();
        self.statuses.push(Status { id, name, color });
        Ok(id)
    }

    /// Renames a status.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] or [`WorkspaceError::StatusNotFound`].
    pub fn rename_status(&mut self, id: StatusId, name: &str) -> Result<()> {
        let name = clean_name(name)?;
        self.status_mut(id)?.name = name;
        Ok(())
    }

    /// Changes a status's color.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::StatusNotFound`].
    pub fn set_status_color(&mut self, id: StatusId, color: ProfileColor) -> Result<()> {
        self.status_mut(id)?.color = color;
        Ok(())
    }

    /// Moves a status to `index` of the workflow, clamped to the end.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::StatusNotFound`].
    pub fn move_status(&mut self, id: StatusId, index: usize) -> Result<()> {
        let from = self
            .statuses
            .iter()
            .position(|status| status.id == id)
            .ok_or(WorkspaceError::StatusNotFound(id))?;
        let status = self.statuses.remove(from);
        let to = index.min(self.statuses.len());
        self.statuses.insert(to, status);
        Ok(())
    }

    /// Removes a status; its tickets are left without one.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::StatusNotFound`].
    pub fn remove_status(&mut self, id: StatusId) -> Result<Status> {
        let index = self
            .statuses
            .iter()
            .position(|status| status.id == id)
            .ok_or(WorkspaceError::StatusNotFound(id))?;
        let clear = |ticket: &mut Ticket| {
            if ticket.status == Some(id) {
                ticket.status = None;
            }
        };
        for ticket in self
            .profiles
            .iter_mut()
            .flat_map(|profile| &mut profile.tickets)
        {
            ticket.children.iter_mut().for_each(clear);
            clear(ticket);
        }
        Ok(self.statuses.remove(index))
    }

    // ---- tickets --------------------------------------------------------

    /// Finds a ticket or sub-ticket with its profile and parent.
    #[must_use]
    pub fn ticket(&self, id: TicketId) -> Option<TicketRef<'_>> {
        self.profiles.iter().find_map(|profile| {
            profile.tickets.iter().find_map(|ticket| {
                if ticket.id == id {
                    return Some(TicketRef {
                        profile,
                        parent: None,
                        ticket,
                    });
                }
                ticket
                    .children
                    .iter()
                    .find(|child| child.id == id)
                    .map(|child| TicketRef {
                        profile,
                        parent: Some(ticket),
                        ticket: child,
                    })
            })
        })
    }

    /// Adds a ticket at the end of `place`.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`], [`WorkspaceError::NestedTicket`] when
    /// `place` is a sub-ticket, or the not-found error of `place` or `status`.
    pub fn add_ticket(
        &mut self,
        place: TicketPlace,
        title: &str,
        status: Option<StatusId>,
    ) -> Result<TicketId> {
        self.add_ticket_as(TicketId::new(), place, title, status)
    }

    /// Adds a ticket with an id chosen by the caller, so the UI can show it
    /// right away.
    ///
    /// # Errors
    ///
    /// As [`Workspace::add_ticket`], or [`WorkspaceError::DuplicateId`] when
    /// the id is taken.
    pub fn add_ticket_as(
        &mut self,
        id: TicketId,
        place: TicketPlace,
        title: &str,
        status: Option<StatusId>,
    ) -> Result<TicketId> {
        let title = clean_name(title)?;
        if let Some(status) = status {
            self.ensure_status(status)?;
        }
        if self.ticket(id).is_some() {
            return Err(WorkspaceError::DuplicateId(id.to_string()));
        }
        let ticket = Ticket {
            id,
            title,
            key: None,
            url: None,
            status,
            icon: None,
            note: None,
            links: Vec::new(),
            children: Vec::new(),
        };
        self.insert_ticket(place, usize::MAX, ticket)?;
        Ok(id)
    }

    /// Adds a ticket as it is, such as one imported from an older file.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::NestedTicket`] or the not-found error of `place`.
    pub fn insert_ticket(
        &mut self,
        place: TicketPlace,
        index: usize,
        ticket: Ticket,
    ) -> Result<()> {
        let list = match place {
            TicketPlace::Profile(id) => &mut self.profile_mut(id)?.tickets,
            TicketPlace::Ticket(id) => {
                if !ticket.children.is_empty() {
                    return Err(WorkspaceError::NestedTicket);
                }
                if self
                    .ticket(id)
                    .ok_or(WorkspaceError::TicketNotFound(id))?
                    .parent
                    .is_some()
                {
                    return Err(WorkspaceError::NestedTicket);
                }
                &mut self.ticket_mut(id)?.children
            }
        };
        list.insert(index.min(list.len()), ticket);
        Ok(())
    }

    /// Sets the key of a ticket, such as `PROJ-123`; blank clears it.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TicketNotFound`].
    pub fn set_ticket_key(&mut self, id: TicketId, key: &str) -> Result<()> {
        self.ticket_mut(id)?.key = clean_detail(key, MAX_KEY_LEN);
        Ok(())
    }

    /// Sets or clears a ticket's own address.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TicketNotFound`].
    pub fn set_ticket_address(&mut self, id: TicketId, url: Option<TabUrl>) -> Result<()> {
        self.ticket_mut(id)?.url = url;
        Ok(())
    }

    /// Sets or clears a ticket's status.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TicketNotFound`] or [`WorkspaceError::StatusNotFound`].
    pub fn set_ticket_status(&mut self, id: TicketId, status: Option<StatusId>) -> Result<()> {
        if let Some(status) = status {
            self.ensure_status(status)?;
        }
        self.ticket_mut(id)?.status = status;
        Ok(())
    }

    /// Moves a ticket to `index` of `place`, clamped to the end: within its
    /// profile, to another profile, or under a ticket as a sub-ticket.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::NestedTicket`] when a ticket with sub-tickets would
    /// become one, or one would go under a sub-ticket or itself, or the
    /// not-found error of the ticket or `place`.
    pub fn move_ticket(&mut self, id: TicketId, place: TicketPlace, index: usize) -> Result<()> {
        let moving = self.ticket(id).ok_or(WorkspaceError::TicketNotFound(id))?;
        if let TicketPlace::Ticket(parent) = place {
            let target = self
                .ticket(parent)
                .ok_or(WorkspaceError::TicketNotFound(parent))?;
            if parent == id || target.parent.is_some() || !moving.ticket.children.is_empty() {
                return Err(WorkspaceError::NestedTicket);
            }
        } else if let TicketPlace::Profile(profile) = place {
            self.profile_index(profile)?;
        }
        let ticket = self.take_ticket(id)?;
        self.insert_ticket(place, index, ticket)
    }

    /// Removes a ticket with its links and sub-tickets.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TicketNotFound`].
    pub fn remove_ticket(&mut self, id: TicketId) -> Result<Ticket> {
        let ticket = self.take_ticket(id)?;
        self.prune_pinned();
        Ok(ticket)
    }

    /// The address that opens a ticket: its own.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::TicketNotFound`] or [`WorkspaceError::NoTicketLink`].
    pub fn ticket_address(&self, id: TicketId) -> Result<&TabUrl> {
        let found = self.ticket(id).ok_or(WorkspaceError::TicketNotFound(id))?;
        found
            .ticket
            .url
            .as_ref()
            .ok_or(WorkspaceError::NoTicketLink)
    }

    // ---- notes ----------------------------------------------------------

    /// Finds a note with its profile.
    #[must_use]
    pub fn note(&self, id: NoteId) -> Option<(&Profile, &Note)> {
        self.profiles.iter().find_map(|profile| {
            profile
                .notes
                .iter()
                .find(|note| note.id == id)
                .map(|note| (profile, note))
        })
    }

    /// Adds an empty note at the end of a profile's notes.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] or [`WorkspaceError::ProfileNotFound`].
    pub fn add_note(&mut self, profile: ProfileId, title: &str) -> Result<NoteId> {
        self.add_note_as(NoteId::new(), profile, title)
    }

    /// Adds a note with an id chosen by the caller.
    ///
    /// # Errors
    ///
    /// As [`Workspace::add_note`], or [`WorkspaceError::DuplicateId`] when
    /// the id is taken.
    pub fn add_note_as(&mut self, id: NoteId, profile: ProfileId, title: &str) -> Result<NoteId> {
        let title = clean_name(title)?;
        if self.note(id).is_some() {
            return Err(WorkspaceError::DuplicateId(id.to_string()));
        }
        self.profile_mut(profile)?.notes.push(Note {
            id,
            title,
            icon: None,
            body: None,
            links: Vec::new(),
        });
        Ok(id)
    }

    /// Adds a note as it is, such as one imported from an older file.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::ProfileNotFound`].
    pub fn insert_note(&mut self, profile: ProfileId, note: Note) -> Result<()> {
        self.profile_mut(profile)?.notes.push(note);
        Ok(())
    }

    /// Moves a note to `index` of a profile's notes, clamped to the end.
    ///
    /// # Errors
    ///
    /// The not-found error of the note or the profile.
    pub fn move_note(&mut self, id: NoteId, profile: ProfileId, index: usize) -> Result<()> {
        self.profile_index(profile)?;
        let note = self.take_note(id)?;
        let notes = &mut self.profile_mut(profile)?.notes;
        notes.insert(index.min(notes.len()), note);
        Ok(())
    }

    /// Removes a note with its links.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::NoteNotFound`].
    pub fn remove_note(&mut self, id: NoteId) -> Result<Note> {
        let note = self.take_note(id)?;
        self.prune_pinned();
        Ok(note)
    }

    // ---- links ----------------------------------------------------------

    /// Finds a link with its profile and owner.
    #[must_use]
    pub fn link(&self, id: TabId) -> Option<LinkRef<'_>> {
        fn in_ticket<'a>(
            profile: &'a Profile,
            ticket: &'a Ticket,
            id: TabId,
        ) -> Option<LinkRef<'a>> {
            ticket
                .links
                .iter()
                .find(|link| link.id == id)
                .map(|link| LinkRef {
                    profile,
                    owner: LinkOwner::Ticket(ticket.id),
                    link,
                })
        }
        self.profiles.iter().find_map(|profile| {
            profile
                .tickets
                .iter()
                .find_map(|ticket| {
                    in_ticket(profile, ticket, id).or_else(|| {
                        ticket
                            .children
                            .iter()
                            .find_map(|child| in_ticket(profile, child, id))
                    })
                })
                .or_else(|| {
                    profile.notes.iter().find_map(|note| {
                        note.links
                            .iter()
                            .find(|link| link.id == id)
                            .map(|link| LinkRef {
                                profile,
                                owner: LinkOwner::Note(note.id),
                                link,
                            })
                    })
                })
        })
    }

    /// Adds a link at the end of a ticket's or note's links. A blank title
    /// uses the URL.
    ///
    /// # Errors
    ///
    /// The not-found error of `owner`.
    pub fn add_link(&mut self, owner: LinkOwner, url: TabUrl, title: &str) -> Result<TabId> {
        let id = TabId::new();
        let title = link_title(title, &url);
        self.links_mut(owner)?.push(Link {
            id,
            url,
            title,
            icon: None,
        });
        Ok(id)
    }

    /// Adds a link as it is, such as one imported from an older file.
    ///
    /// # Errors
    ///
    /// The not-found error of `owner`.
    pub fn insert_link(&mut self, owner: LinkOwner, link: Link) -> Result<()> {
        self.links_mut(owner)?.push(link);
        Ok(())
    }

    /// Changes where a link points.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::LinkNotFound`].
    pub fn set_link_url(&mut self, id: TabId, url: TabUrl) -> Result<()> {
        self.link_mut(id)?.url = url;
        Ok(())
    }

    /// Moves a link to `index` of a ticket's or note's links, clamped.
    ///
    /// # Errors
    ///
    /// The not-found error of the link or `owner`.
    pub fn move_link(&mut self, id: TabId, owner: LinkOwner, index: usize) -> Result<()> {
        self.links_mut(owner)?;
        let link = self.take_link(id)?;
        let links = self.links_mut(owner)?;
        links.insert(index.min(links.len()), link);
        Ok(())
    }

    /// Removes a link.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::LinkNotFound`].
    pub fn remove_link(&mut self, id: TabId) -> Result<Link> {
        let link = self.take_link(id)?;
        self.prune_pinned();
        Ok(link)
    }

    // ---- any item -------------------------------------------------------

    /// Renames a ticket, note or link. A link with a blank title uses its URL.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::EmptyName`] for a ticket or note, or the not-found
    /// error of `target`.
    pub fn rename(&mut self, target: Target, name: &str) -> Result<()> {
        match target {
            Target::Ticket(id) => {
                let name = clean_name(name)?;
                self.ticket_mut(id)?.title = name;
            }
            Target::Note(id) => {
                let name = clean_name(name)?;
                self.note_mut(id)?.title = name;
            }
            Target::Link(id) => {
                let link = self.link_mut(id)?;
                link.title = link_title(name, &link.url);
            }
        }
        Ok(())
    }

    /// Sets or clears the custom icon of a ticket, note or link.
    ///
    /// # Errors
    ///
    /// The not-found error of `target`.
    pub fn set_icon(&mut self, target: Target, icon: Option<Icon>) -> Result<()> {
        match target {
            Target::Ticket(id) => self.ticket_mut(id)?.icon = icon,
            Target::Note(id) => self.note_mut(id)?.icon = icon,
            Target::Link(id) => self.link_mut(id)?.icon = icon,
        }
        Ok(())
    }

    /// Sets the Markdown text of a ticket (its note) or a note (its body),
    /// trimmed; blank clears it.
    ///
    /// # Errors
    ///
    /// The not-found error of `owner`.
    pub fn set_text(&mut self, owner: LinkOwner, text: &str) -> Result<()> {
        let text = clean_detail(text, MAX_NOTE_LEN);
        match owner {
            LinkOwner::Ticket(id) => self.ticket_mut(id)?.note = text,
            LinkOwner::Note(id) => self.note_mut(id)?.body = text,
        }
        Ok(())
    }

    /// The profile a ticket, note or link belongs to.
    #[must_use]
    pub fn target_profile(&self, target: Target) -> Option<&Profile> {
        match target {
            Target::Ticket(id) => self.ticket(id).map(|found| found.profile),
            Target::Note(id) => self.note(id).map(|(profile, _)| profile),
            Target::Link(id) => self.link(id).map(|found| found.profile),
        }
    }

    // ---- pinned ---------------------------------------------------------

    /// Items pinned to the top of the sidebar, in order.
    #[must_use]
    pub fn pinned(&self) -> &[Target] {
        &self.pinned
    }

    /// Pins an item at the end; pinning it again changes nothing.
    ///
    /// # Errors
    ///
    /// The not-found error of `target`.
    pub fn pin(&mut self, target: Target) -> Result<()> {
        if !self.exists(target) {
            return Err(not_found(target));
        }
        if !self.pinned.contains(&target) {
            self.pinned.push(target);
        }
        Ok(())
    }

    /// Unpins an item; unpinning one that is not pinned changes nothing.
    pub fn unpin(&mut self, target: Target) {
        self.pinned.retain(|pinned| *pinned != target);
    }

    /// Moves a pinned item to `index`, clamped to the end.
    ///
    /// # Errors
    ///
    /// The not-found error of `target` when it is not pinned.
    pub fn move_pinned(&mut self, target: Target, index: usize) -> Result<()> {
        let Some(from) = self.pinned.iter().position(|pinned| *pinned == target) else {
            return Err(not_found(target));
        };
        self.pinned.remove(from);
        self.pinned.insert(index.min(self.pinned.len()), target);
        Ok(())
    }

    /// Checks the invariants a deserialized workspace must hold: at least
    /// one profile, unique ids, one level of sub-tickets and known statuses.
    ///
    /// # Errors
    ///
    /// [`WorkspaceError::NoProfiles`], the first
    /// [`WorkspaceError::DuplicateId`], [`WorkspaceError::NestedTicket`] or
    /// [`WorkspaceError::StatusNotFound`].
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
        for status in &self.statuses {
            unique(status.id.to_string())?;
        }
        let links = |links: &[Link], unique: &mut dyn FnMut(String) -> Result<()>| {
            links
                .iter()
                .try_for_each(|link| unique(link.id.to_string()))
        };
        for profile in &self.profiles {
            unique(profile.id.to_string())?;
            for ticket in &profile.tickets {
                self.check_ticket(ticket, &mut unique)?;
                links(&ticket.links, &mut unique)?;
                for child in &ticket.children {
                    if !child.children.is_empty() {
                        return Err(WorkspaceError::NestedTicket);
                    }
                    self.check_ticket(child, &mut unique)?;
                    links(&child.links, &mut unique)?;
                }
            }
            for note in &profile.notes {
                unique(note.id.to_string())?;
                links(&note.links, &mut unique)?;
            }
        }
        Ok(())
    }

    // ---- internals ------------------------------------------------------

    fn check_ticket(
        &self,
        ticket: &Ticket,
        unique: &mut dyn FnMut(String) -> Result<()>,
    ) -> Result<()> {
        unique(ticket.id.to_string())?;
        if let Some(status) = ticket.status {
            self.ensure_status(status)?;
        }
        Ok(())
    }

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

    fn ensure_status(&self, id: StatusId) -> Result<()> {
        self.status(id)
            .map(drop)
            .ok_or(WorkspaceError::StatusNotFound(id))
    }

    fn status_mut(&mut self, id: StatusId) -> Result<&mut Status> {
        self.statuses
            .iter_mut()
            .find(|status| status.id == id)
            .ok_or(WorkspaceError::StatusNotFound(id))
    }

    fn ticket_mut(&mut self, id: TicketId) -> Result<&mut Ticket> {
        self.profiles
            .iter_mut()
            .flat_map(|profile| &mut profile.tickets)
            .find_map(|ticket| {
                if ticket.id == id {
                    Some(ticket)
                } else {
                    ticket.children.iter_mut().find(|child| child.id == id)
                }
            })
            .ok_or(WorkspaceError::TicketNotFound(id))
    }

    fn note_mut(&mut self, id: NoteId) -> Result<&mut Note> {
        self.profiles
            .iter_mut()
            .flat_map(|profile| &mut profile.notes)
            .find(|note| note.id == id)
            .ok_or(WorkspaceError::NoteNotFound(id))
    }

    fn links_mut(&mut self, owner: LinkOwner) -> Result<&mut Vec<Link>> {
        Ok(match owner {
            LinkOwner::Ticket(id) => &mut self.ticket_mut(id)?.links,
            LinkOwner::Note(id) => &mut self.note_mut(id)?.links,
        })
    }

    fn link_mut(&mut self, id: TabId) -> Result<&mut Link> {
        let owner = self
            .link(id)
            .map(|found| found.owner)
            .ok_or(WorkspaceError::LinkNotFound(id))?;
        self.links_mut(owner)?
            .iter_mut()
            .find(|link| link.id == id)
            .ok_or(WorkspaceError::LinkNotFound(id))
    }

    fn take_ticket(&mut self, id: TicketId) -> Result<Ticket> {
        for profile in &mut self.profiles {
            if let Some(index) = profile.tickets.iter().position(|ticket| ticket.id == id) {
                return Ok(profile.tickets.remove(index));
            }
            for ticket in &mut profile.tickets {
                if let Some(index) = ticket.children.iter().position(|child| child.id == id) {
                    return Ok(ticket.children.remove(index));
                }
            }
        }
        Err(WorkspaceError::TicketNotFound(id))
    }

    fn take_note(&mut self, id: NoteId) -> Result<Note> {
        for profile in &mut self.profiles {
            if let Some(index) = profile.notes.iter().position(|note| note.id == id) {
                return Ok(profile.notes.remove(index));
            }
        }
        Err(WorkspaceError::NoteNotFound(id))
    }

    fn take_link(&mut self, id: TabId) -> Result<Link> {
        let owner = self
            .link(id)
            .map(|found| found.owner)
            .ok_or(WorkspaceError::LinkNotFound(id))?;
        let links = self.links_mut(owner)?;
        let index = links
            .iter()
            .position(|link| link.id == id)
            .ok_or(WorkspaceError::LinkNotFound(id))?;
        Ok(links.remove(index))
    }

    fn exists(&self, target: Target) -> bool {
        match target {
            Target::Ticket(id) => self.ticket(id).is_some(),
            Target::Note(id) => self.note(id).is_some(),
            Target::Link(id) => self.link(id).is_some(),
        }
    }

    /// Drops pinned items that no longer exist, after a removal.
    fn prune_pinned(&mut self) {
        let pinned = std::mem::take(&mut self.pinned);
        self.pinned = pinned
            .into_iter()
            .filter(|target| self.exists(*target))
            .collect();
    }
}

/// The not-found error of a target.
fn not_found(target: Target) -> WorkspaceError {
    match target {
        Target::Ticket(id) => WorkspaceError::TicketNotFound(id),
        Target::Note(id) => WorkspaceError::NoteNotFound(id),
        Target::Link(id) => WorkspaceError::LinkNotFound(id),
    }
}

/// Trims a link title, using the URL when it is blank.
fn link_title(raw: &str, url: &TabUrl) -> String {
    match raw.trim() {
        "" => url.as_str().to_owned(),
        trimmed => trimmed.to_owned(),
    }
}

/// Longest ticket key kept, in characters.
pub const MAX_KEY_LEN: usize = 64;
/// Longest note kept, in characters.
pub const MAX_NOTE_LEN: usize = 20_000;

/// Trims a key or note and caps its length; `None` when blank.
#[must_use]
pub fn clean_detail(raw: &str, max: usize) -> Option<String> {
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
