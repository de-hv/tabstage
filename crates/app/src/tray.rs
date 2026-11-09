//! What the tray (menu bar) menu shows and what its items do. The shell
//! turns [`TrayEntry`] values into native menu items and sends clicks back
//! through [`TrayAction::parse`].

use tabstage_core::GroupId;

use crate::Snapshot;

/// One line of the tray menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrayEntry {
    /// Opens the quick search.
    Search,
    /// A profile name above its groups; not clickable.
    Header {
        /// Profile name.
        label: String,
    },
    /// Opens every tab of a group.
    Group {
        /// The group.
        id: GroupId,
        /// Text shown, e.g. "Open Work".
        label: String,
    },
    /// Shows the main window.
    Show,
    /// Quits the app.
    Quit,
    /// A divider.
    Separator,
}

/// What a click on a tray item asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayAction {
    /// Open the quick search.
    Search,
    /// Open every tab of a group.
    OpenGroup(GroupId),
    /// Show the main window.
    Show,
    /// Quit.
    Quit,
}

impl TrayEntry {
    /// Stable id of the native menu item; `None` for separators.
    #[must_use]
    pub fn menu_id(&self) -> Option<String> {
        match self {
            Self::Search => Some(SEARCH.to_owned()),
            Self::Group { id, .. } => Some(format!("{GROUP_PREFIX}{id}")),
            Self::Show => Some(SHOW.to_owned()),
            Self::Quit => Some(QUIT.to_owned()),
            Self::Separator | Self::Header { .. } => None,
        }
    }
}

const SEARCH: &str = "search";
const SHOW: &str = "show";
const QUIT: &str = "quit";
const GROUP_PREFIX: &str = "group:";

impl TrayAction {
    /// Reads back a menu id made by [`TrayEntry::menu_id`].
    #[must_use]
    pub fn parse(menu_id: &str) -> Option<Self> {
        match menu_id {
            SEARCH => Some(Self::Search),
            SHOW => Some(Self::Show),
            QUIT => Some(Self::Quit),
            other => other
                .strip_prefix(GROUP_PREFIX)?
                .parse()
                .ok()
                .map(Self::OpenGroup),
        }
    }
}

/// The tray menu for the current state: search, the groups under the name
/// of their profile, then show and quit.
#[must_use]
pub fn tray_entries(snapshot: &Snapshot) -> Vec<TrayEntry> {
    let workspace = &snapshot.workspace;
    let mut entries = vec![TrayEntry::Search, TrayEntry::Separator];
    let mut any_group = false;
    for profile in workspace.profiles() {
        let mut groups = workspace
            .groups()
            .iter()
            .filter(|group| group.profile == profile.id)
            .peekable();
        if groups.peek().is_none() {
            continue;
        }
        any_group = true;
        entries.push(TrayEntry::Header {
            label: profile.name.clone(),
        });
        entries.extend(groups.map(|group| TrayEntry::Group {
            id: group.id,
            label: format!("Open {}", group.name),
        }));
    }
    if any_group {
        entries.push(TrayEntry::Separator);
    }
    entries.push(TrayEntry::Show);
    entries.push(TrayEntry::Quit);
    entries
}

#[cfg(test)]
mod tests {
    use tabstage_core::{AccentColor, Workspace};
    use tabstage_store::Settings;

    use super::*;

    /// `layout` is (profile name, its group names); profiles are created in
    /// order, and groups are added in the order given.
    fn snapshot(layout: &[(&str, &[&str])]) -> Snapshot {
        let mut workspace = Workspace::new();
        let first = workspace.profiles()[0].id;
        for (index, (profile, groups)) in layout.iter().enumerate() {
            let id = if index == 0 {
                workspace.rename_profile(first, profile).expect("rename");
                first
            } else {
                workspace.add_profile(profile).expect("profile")
            };
            for name in *groups {
                workspace
                    .add_group(id, name, AccentColor::Blue)
                    .expect("group");
            }
        }
        Snapshot {
            workspace,
            settings: Settings::default(),
            browsers: Vec::new(),
            browser_profiles: std::collections::BTreeMap::new(),
            system_browser: None,
            data_path: String::new(),
            data_location: crate::DataLocation {
                kind: crate::DataLocationKind::AppData,
                folder: String::new(),
            },
            profiles: Vec::new(),
        }
    }

    #[test]
    fn lists_groups_under_their_profile_and_skips_empty_profiles() {
        let snapshot = snapshot(&[
            ("Trabajo", &["Jira", "Clientes"]),
            ("Vacío", &[]),
            ("Personal", &["Lecturas"]),
        ]);
        let ids: Vec<_> = snapshot.workspace.groups().iter().map(|g| g.id).collect();

        let entries = tray_entries(&snapshot);

        assert_eq!(
            entries,
            [
                TrayEntry::Search,
                TrayEntry::Separator,
                TrayEntry::Header {
                    label: "Trabajo".into()
                },
                TrayEntry::Group {
                    id: ids[0],
                    label: "Open Jira".into()
                },
                TrayEntry::Group {
                    id: ids[1],
                    label: "Open Clientes".into()
                },
                TrayEntry::Header {
                    label: "Personal".into()
                },
                TrayEntry::Group {
                    id: ids[2],
                    label: "Open Lecturas".into()
                },
                TrayEntry::Separator,
                TrayEntry::Show,
                TrayEntry::Quit,
            ]
        );
    }

    #[test]
    fn no_group_section_without_groups() {
        assert_eq!(
            tray_entries(&snapshot(&[("Trabajo", &[])])),
            [
                TrayEntry::Search,
                TrayEntry::Separator,
                TrayEntry::Show,
                TrayEntry::Quit
            ]
        );
    }

    #[test]
    fn menu_ids_parse_back_to_actions() {
        let id = GroupId::new();

        let parse = |entry: TrayEntry| TrayAction::parse(&entry.menu_id().expect("id"));

        assert_eq!(parse(TrayEntry::Search), Some(TrayAction::Search));
        assert_eq!(
            parse(TrayEntry::Group {
                id,
                label: String::new()
            }),
            Some(TrayAction::OpenGroup(id))
        );
        assert_eq!(parse(TrayEntry::Show), Some(TrayAction::Show));
        assert_eq!(parse(TrayEntry::Quit), Some(TrayAction::Quit));
        assert_eq!(TrayEntry::Separator.menu_id(), None);
        assert_eq!(TrayEntry::Header { label: "P".into() }.menu_id(), None);
    }

    #[test]
    fn unknown_menu_ids_are_ignored() {
        assert_eq!(TrayAction::parse("group:not-a-uuid"), None);
        assert_eq!(TrayAction::parse("something"), None);
    }
}
