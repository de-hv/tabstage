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
    /// Opens every tab of a group.
    Group {
        /// The group.
        id: GroupId,
        /// Text shown, e.g. "Abrir Trabajo".
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
            Self::Separator => None,
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

/// The tray menu for the current state: search, one item per group, then
/// show and quit.
#[must_use]
pub fn tray_entries(snapshot: &Snapshot) -> Vec<TrayEntry> {
    let groups = snapshot.workspace.groups();
    let mut entries = Vec::with_capacity(groups.len() + 5);
    entries.push(TrayEntry::Search);
    entries.push(TrayEntry::Separator);
    if !groups.is_empty() {
        entries.extend(groups.iter().map(|group| TrayEntry::Group {
            id: group.id,
            label: format!("Abrir {}", group.name),
        }));
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

    fn snapshot(groups: &[&str]) -> Snapshot {
        let mut workspace = Workspace::new();
        for name in groups {
            workspace.add_group(name, AccentColor::Blue).expect("group");
        }
        Snapshot {
            workspace,
            settings: Settings::default(),
            browsers: Vec::new(),
            default_browser: None,
            groups: Vec::new(),
            data_path: String::new(),
        }
    }

    #[test]
    fn lists_search_groups_show_and_quit() {
        let snapshot = snapshot(&["Trabajo", "Personal"]);
        let ids: Vec<_> = snapshot.workspace.groups().iter().map(|g| g.id).collect();

        let entries = tray_entries(&snapshot);

        assert_eq!(
            entries,
            [
                TrayEntry::Search,
                TrayEntry::Separator,
                TrayEntry::Group {
                    id: ids[0],
                    label: "Abrir Trabajo".into()
                },
                TrayEntry::Group {
                    id: ids[1],
                    label: "Abrir Personal".into()
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
            tray_entries(&snapshot(&[])),
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
    }

    #[test]
    fn unknown_menu_ids_are_ignored() {
        assert_eq!(TrayAction::parse("group:not-a-uuid"), None);
        assert_eq!(TrayAction::parse("something"), None);
    }
}
