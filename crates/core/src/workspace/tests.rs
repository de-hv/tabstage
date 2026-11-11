use super::*;

fn first_profile(workspace: &Workspace) -> ProfileId {
    workspace.profiles()[0].id
}

fn url(raw: &str) -> TabUrl {
    TabUrl::parse(raw).expect("valid test url")
}

/// Ids of the items of a profile, in order, as strings.
fn item_ids(workspace: &Workspace, profile: ProfileId) -> Vec<String> {
    workspace
        .profile(profile)
        .expect("profile")
        .items
        .iter()
        .map(|item| match item {
            Item::Group(group) => group.id.to_string(),
            Item::Folder(folder) => folder.id.to_string(),
            Item::Tab(tab) => tab.id.to_string(),
        })
        .collect()
}

fn child_ids(workspace: &Workspace, group: GroupId) -> Vec<String> {
    workspace
        .group(group)
        .expect("group")
        .children
        .iter()
        .map(|node| match node {
            Node::Tab(tab) => tab.id.to_string(),
            Node::Folder(folder) => folder.id.to_string(),
        })
        .collect()
}

fn folder_tab_ids(workspace: &Workspace, folder: FolderId) -> Vec<TabId> {
    let found = workspace.find_folder(folder).expect("folder");
    found.folder.tabs.iter().map(|tab| tab.id).collect()
}

/// A profile with a group "Work" that holds a folder "Sprint".
fn work() -> (Workspace, ProfileId, GroupId, FolderId) {
    let mut workspace = Workspace::new();
    let profile = first_profile(&workspace);
    let group = workspace
        .add_group(profile, "Work", AccentColor::Blue)
        .expect("add group");
    let folder = workspace
        .add_folder(Place::Group(group), "Sprint")
        .expect("add folder");
    (workspace, profile, group, folder)
}

// ---- profiles -----------------------------------------------------------

#[test]
fn new_workspace_has_one_empty_profile() {
    let workspace = Workspace::new();

    assert_eq!(workspace.profiles().len(), 1);
    assert_eq!(workspace.profiles()[0].name, DEFAULT_PROFILE_NAME);
    assert!(workspace.profiles()[0].items.is_empty());
    assert_eq!(workspace.groups().count(), 0);
}

#[test]
fn add_profile_trims_name_and_appends() {
    let mut workspace = Workspace::new();

    let id = workspace.add_profile("  Cliente ").expect("add");

    assert_eq!(workspace.profiles().len(), 2);
    assert_eq!(
        workspace.profile(id).map(|p| p.name.as_str()),
        Some("Cliente")
    );
    assert_eq!(workspace.add_profile("  "), Err(WorkspaceError::EmptyName));
}

#[test]
fn new_profiles_get_a_color_no_other_profile_uses() {
    let mut workspace = Workspace::new();
    let first = workspace.profiles()[0].color;

    let second = workspace.add_profile("B").expect("add");
    let second = workspace.profile(second).expect("profile").color;

    assert_ne!(first, second);
}

#[test]
fn rename_recolor_and_move_profiles() {
    let mut workspace = Workspace::new();
    let first = first_profile(&workspace);
    let second = workspace.add_profile("Second").expect("add");
    let color = ProfileColor::new(7).expect("color");

    workspace.rename_profile(first, "Work").expect("rename");
    workspace.set_profile_color(first, color).expect("color");
    workspace.move_profile(second, 0).expect("move");

    let names: Vec<_> = workspace
        .profiles()
        .iter()
        .map(|p| p.name.as_str())
        .collect();
    assert_eq!(names, ["Second", "Work"]);
    assert_eq!(workspace.profile(first).expect("p").color, color);
}

#[test]
fn removing_a_profile_appends_its_items_to_the_target() {
    let (mut workspace, first, group, _) = work();
    let second = workspace.add_profile("Second").expect("add");
    let kept = workspace
        .add_tab(Place::Profile(second), url("https://kept.dev"), "")
        .expect("tab");
    let moved = workspace
        .add_tab(Place::Profile(first), url("https://moved.dev"), "")
        .expect("tab");

    workspace.remove_profile(first, second).expect("remove");

    assert_eq!(
        item_ids(&workspace, second),
        [kept.to_string(), group.to_string(), moved.to_string()]
    );
}

#[test]
fn remove_profile_rejects_itself_or_unknown_target() {
    let mut workspace = Workspace::new();
    let only = first_profile(&workspace);
    let missing = ProfileId::new();

    assert_eq!(
        workspace.remove_profile(only, only),
        Err(WorkspaceError::SameProfile)
    );
    assert_eq!(
        workspace.remove_profile(only, missing),
        Err(WorkspaceError::ProfileNotFound(missing))
    );
    assert_eq!(workspace.profiles().len(), 1);
}

// ---- groups -------------------------------------------------------------

#[test]
fn add_group_trims_name_and_lives_in_its_profile() {
    let mut workspace = Workspace::new();
    let profile = first_profile(&workspace);

    let id = workspace
        .add_group(profile, "  In TEST  ", AccentColor::Mauve)
        .expect("add");

    let group = workspace.group(id).expect("group");
    assert_eq!(group.name, "In TEST");
    assert_eq!(group.color, AccentColor::Mauve);
    assert_eq!(workspace.group_profile(id).map(|p| p.id), Some(profile));
}

#[test]
fn add_group_rejects_blank_name_or_unknown_profile() {
    let mut workspace = Workspace::new();
    let missing = ProfileId::new();

    assert_eq!(
        workspace.add_group(first_profile(&workspace), " ", AccentColor::Blue),
        Err(WorkspaceError::EmptyName)
    );
    assert_eq!(
        workspace.add_group(missing, "G", AccentColor::Blue),
        Err(WorkspaceError::ProfileNotFound(missing))
    );
}

#[test]
fn move_group_reorders_and_crosses_profiles() {
    let (mut workspace, first, work, _) = work();
    let other = workspace
        .add_group(first, "Other", AccentColor::Red)
        .expect("add");
    let second = workspace.add_profile("Second").expect("add");

    workspace.move_group(other, first, 0).expect("reorder");
    assert_eq!(
        item_ids(&workspace, first),
        [other.to_string(), work.to_string()]
    );

    workspace.move_group(work, second, 99).expect("move");
    assert_eq!(item_ids(&workspace, second), [work.to_string()]);
    assert_eq!(workspace.group_profile(work).map(|p| p.id), Some(second));
}

#[test]
fn move_group_to_unknown_profile_changes_nothing() {
    let (mut workspace, first, work, _) = work();
    let missing = ProfileId::new();

    assert_eq!(
        workspace.move_group(work, missing, 0),
        Err(WorkspaceError::ProfileNotFound(missing))
    );
    assert_eq!(item_ids(&workspace, first), [work.to_string()]);
}

#[test]
fn rename_and_remove_groups() {
    let (mut workspace, _, work, _) = work();

    workspace.rename_group(work, " Done ").expect("rename");
    assert_eq!(workspace.group(work).expect("g").name, "Done");

    let removed = workspace.remove_group(work).expect("remove");
    assert_eq!(removed.children.len(), 1);
    assert_eq!(
        workspace.remove_group(work),
        Err(WorkspaceError::GroupNotFound(work))
    );
}

// ---- folders ------------------------------------------------------------

#[test]
fn folders_can_live_in_a_profile_or_a_group_but_not_a_folder() {
    let (mut workspace, profile, group, sprint) = work();

    let loose = workspace
        .add_folder(Place::Profile(profile), "Docs")
        .expect("profile folder");

    assert!(workspace.find_folder(loose).expect("found").group.is_none());
    assert_eq!(
        workspace
            .find_folder(sprint)
            .expect("found")
            .group
            .map(|g| g.id),
        Some(group)
    );
    assert_eq!(
        workspace.add_folder(Place::Folder(sprint), "Nested"),
        Err(WorkspaceError::NestedFolder)
    );
}

#[test]
fn move_folder_between_group_and_profile_keeps_its_tabs() {
    let (mut workspace, profile, group, sprint) = work();
    let tab = workspace
        .add_tab(Place::Folder(sprint), url("https://a.dev"), "a")
        .expect("tab");

    workspace
        .move_folder(sprint, Place::Profile(profile), 0)
        .expect("to profile");
    assert_eq!(
        item_ids(&workspace, profile),
        [sprint.to_string(), group.to_string()]
    );
    assert!(child_ids(&workspace, group).is_empty());

    workspace
        .move_folder(sprint, Place::Group(group), 0)
        .expect("back to group");
    assert_eq!(child_ids(&workspace, group), [sprint.to_string()]);
    assert_eq!(folder_tab_ids(&workspace, sprint), [tab]);
}

#[test]
fn move_folder_into_a_folder_or_unknown_place_changes_nothing() {
    let (mut workspace, profile, group, sprint) = work();
    let other = workspace
        .add_folder(Place::Profile(profile), "Other")
        .expect("folder");
    let missing = GroupId::new();

    assert_eq!(
        workspace.move_folder(sprint, Place::Folder(other), 0),
        Err(WorkspaceError::NestedFolder)
    );
    assert_eq!(
        workspace.move_folder(sprint, Place::Group(missing), 0),
        Err(WorkspaceError::GroupNotFound(missing))
    );
    assert_eq!(child_ids(&workspace, group), [sprint.to_string()]);
}

#[test]
fn rename_collapse_and_remove_folders() {
    let (mut workspace, profile, _, sprint) = work();
    let loose = workspace
        .add_folder(Place::Profile(profile), "Loose")
        .expect("folder");

    workspace.rename_folder(loose, " Docs ").expect("rename");
    workspace
        .set_folder_collapsed(loose, true)
        .expect("collapse");
    let found = workspace.find_folder(loose).expect("found").folder;
    assert_eq!((found.name.as_str(), found.collapsed), ("Docs", true));

    workspace.remove_folder(loose).expect("remove loose");
    workspace.remove_folder(sprint).expect("remove grouped");
    assert!(workspace.find_folder(sprint).is_none());
}

// ---- tabs ---------------------------------------------------------------

#[test]
fn tabs_can_live_in_a_profile_group_or_folder() {
    let (mut workspace, profile, group, sprint) = work();

    let in_profile = workspace
        .add_tab(Place::Profile(profile), url("https://p.dev"), "p")
        .expect("tab");
    let in_group = workspace
        .add_tab(Place::Group(group), url("https://g.dev"), "g")
        .expect("tab");
    let in_folder = workspace
        .add_tab(Place::Folder(sprint), url("https://f.dev"), "f")
        .expect("tab");

    let where_is = |id| {
        let found = workspace.find_tab(id).expect("found");
        (
            found.profile.id,
            found.group.map(|g| g.id),
            found.folder.map(|f| f.id),
        )
    };
    assert_eq!(where_is(in_profile), (profile, None, None));
    assert_eq!(where_is(in_group), (profile, Some(group), None));
    assert_eq!(where_is(in_folder), (profile, Some(group), Some(sprint)));
    assert_eq!(workspace.tabs().len(), 3);
}

#[test]
fn add_tab_uses_url_when_title_is_blank() {
    let (mut workspace, profile, _, _) = work();

    let id = workspace
        .add_tab(Place::Profile(profile), url("https://a.dev/x"), "  ")
        .expect("tab");

    assert_eq!(
        workspace.find_tab(id).expect("t").tab.title,
        "https://a.dev/x"
    );
}

#[test]
fn add_tab_to_unknown_place_fails() {
    let (mut workspace, _, _, _) = work();
    let missing = FolderId::new();

    assert_eq!(
        workspace.add_tab(Place::Folder(missing), url("https://a.dev"), ""),
        Err(WorkspaceError::FolderNotFound(missing))
    );
}

#[test]
fn set_tab_url_changes_the_url_and_keeps_a_custom_title() {
    let (mut workspace, profile, _, _) = work();
    let id = workspace
        .add_tab(Place::Profile(profile), url("https://a.dev"), "Docs")
        .expect("tab");

    workspace
        .set_tab_url(id, url("https://b.dev/x"))
        .expect("set url");

    let tab = &workspace.find_tab(id).expect("t").tab;
    assert_eq!(tab.url.as_str(), "https://b.dev/x");
    assert_eq!(tab.title, "Docs");
}

#[test]
fn set_tab_url_updates_a_title_that_was_the_old_url() {
    let (mut workspace, profile, _, _) = work();
    let id = workspace
        .add_tab(Place::Profile(profile), url("https://a.dev"), "")
        .expect("tab");

    workspace
        .set_tab_url(id, url("https://b.dev/"))
        .expect("set url");

    assert_eq!(
        workspace.find_tab(id).expect("t").tab.title,
        "https://b.dev/"
    );
}

#[test]
fn set_tab_url_of_unknown_tab_fails() {
    let (mut workspace, _, _, _) = work();
    let missing = TabId::new();

    assert_eq!(
        workspace.set_tab_url(missing, url("https://a.dev")),
        Err(WorkspaceError::TabNotFound(missing))
    );
}

#[test]
fn rename_tab_trims_and_falls_back_to_url() {
    let (mut workspace, profile, _, _) = work();
    let id = workspace
        .add_tab(Place::Profile(profile), url("https://a.dev"), "a")
        .expect("tab");

    workspace.rename_tab(id, " Docs ").expect("rename");
    assert_eq!(workspace.find_tab(id).expect("t").tab.title, "Docs");
    workspace.rename_tab(id, "").expect("rename");
    assert_eq!(
        workspace.find_tab(id).expect("t").tab.title,
        "https://a.dev/"
    );
}

#[test]
fn move_tab_out_of_a_folder_to_the_profile_and_into_a_group() {
    let (mut workspace, profile, group, sprint) = work();
    let tab = workspace
        .add_tab(Place::Folder(sprint), url("https://a.dev"), "a")
        .expect("tab");

    workspace
        .move_tab(tab, Place::Profile(profile), 0)
        .expect("to profile");
    assert_eq!(
        item_ids(&workspace, profile),
        [tab.to_string(), group.to_string()]
    );
    assert!(folder_tab_ids(&workspace, sprint).is_empty());

    workspace
        .move_tab(tab, Place::Group(group), usize::MAX)
        .expect("to group");
    assert_eq!(
        child_ids(&workspace, group),
        [sprint.to_string(), tab.to_string()]
    );
}

#[test]
fn move_tab_to_unknown_place_keeps_the_tab() {
    let (mut workspace, profile, _, _) = work();
    let tab = workspace
        .add_tab(Place::Profile(profile), url("https://a.dev"), "a")
        .expect("tab");
    let missing = GroupId::new();

    assert_eq!(
        workspace.move_tab(tab, Place::Group(missing), 0),
        Err(WorkspaceError::GroupNotFound(missing))
    );
    assert!(workspace.find_tab(tab).is_some());
}

#[test]
fn remove_tab_from_anywhere() {
    let (mut workspace, profile, _, sprint) = work();
    let loose = workspace
        .add_tab(Place::Profile(profile), url("https://a.dev"), "a")
        .expect("tab");
    let nested = workspace
        .add_tab(Place::Folder(sprint), url("https://b.dev"), "b")
        .expect("tab");

    workspace.remove_tab(loose).expect("loose");
    workspace.remove_tab(nested).expect("nested");

    assert!(workspace.tabs().is_empty());
    assert_eq!(
        workspace.remove_tab(loose),
        Err(WorkspaceError::TabNotFound(loose))
    );
}

// ---- icons --------------------------------------------------------------

#[test]
fn set_icon_on_group_folder_and_tab_and_clear_it() {
    let (mut workspace, profile, group, sprint) = work();
    let tab = workspace
        .add_tab(Place::Profile(profile), url("https://a.dev"), "a")
        .expect("tab");
    let emoji = Icon::emoji("🧪").expect("icon");
    let text = Icon::text("142").expect("icon");
    let symbol = Icon::symbol("bug").expect("icon");

    workspace
        .set_icon(Target::Group(group), Some(emoji.clone()))
        .expect("group");
    workspace
        .set_icon(Target::Folder(sprint), Some(text.clone()))
        .expect("folder");
    workspace
        .set_icon(Target::Tab(tab), Some(symbol.clone()))
        .expect("tab");

    assert_eq!(workspace.group(group).expect("g").icon, Some(emoji));
    assert_eq!(
        workspace.find_folder(sprint).expect("f").folder.icon,
        Some(text)
    );
    assert_eq!(workspace.find_tab(tab).expect("t").tab.icon, Some(symbol));

    workspace.set_icon(Target::Tab(tab), None).expect("clear");
    assert_eq!(workspace.find_tab(tab).expect("t").tab.icon, None);
}

#[test]
fn set_icon_on_unknown_target_fails() {
    let mut workspace = Workspace::new();
    let missing = TabId::new();

    assert_eq!(
        workspace.set_icon(Target::Tab(missing), None),
        Err(WorkspaceError::TabNotFound(missing))
    );
}

// ---- serialization and validation ---------------------------------------

#[test]
fn place_and_target_serialize_as_tagged_ids() {
    let id = ProfileId::new();
    let json = serde_json::to_string(&Place::Profile(id)).expect("json");
    assert_eq!(json, format!(r#"{{"profile":"{id}"}}"#));
    let group = GroupId::new();
    let json = serde_json::to_string(&Target::Group(group)).expect("json");
    assert_eq!(json, format!(r#"{{"group":"{group}"}}"#));
}

#[test]
fn workspace_round_trips_through_json_without_empty_icons() {
    let (mut workspace, profile, group, sprint) = work();
    workspace
        .add_tab(Place::Folder(sprint), url("https://a.dev"), "a")
        .expect("tab");
    workspace
        .add_tab(Place::Profile(profile), url("https://b.dev"), "b")
        .expect("tab");
    workspace
        .set_icon(Target::Group(group), Some(Icon::emoji("🚀").expect("i")))
        .expect("icon");

    let json = serde_json::to_string(&workspace).expect("serialize");
    let back: Workspace = serde_json::from_str(&json).expect("deserialize");

    assert_eq!(back, workspace);
    assert_eq!(json.matches("\"icon\"").count(), 1);
    assert_eq!(back.validate(), Ok(()));
}

const TAB_A: &str = "00000000-0000-0000-0000-00000000000a";
const PROFILE_1: &str = "00000000-0000-0000-0000-0000000000aa";

fn from_json(json: &str) -> Workspace {
    serde_json::from_str(json).expect("valid json shape")
}

#[test]
fn validate_rejects_an_id_used_twice() {
    let workspace = from_json(&format!(
        r#"{{"profiles":[{{"id":"{PROFILE_1}","name":"P","color":0,"items":[
        {{"type":"tab","id":"{TAB_A}","url":"https://a.dev","title":"a"}},
        {{"type":"folder","id":"00000000-0000-0000-0000-0000000000f1","name":"F","tabs":[
          {{"id":"{TAB_A}","url":"https://b.dev","title":"b"}}]}}]}}]}}"#
    ));

    assert_eq!(
        workspace.validate(),
        Err(WorkspaceError::DuplicateId(TAB_A.to_owned()))
    );
}

#[test]
fn validate_rejects_a_workspace_without_profiles() {
    assert_eq!(
        from_json(r#"{"profiles":[]}"#).validate(),
        Err(WorkspaceError::NoProfiles)
    );
}

mod props {
    use super::*;
    use proptest::prelude::*;

    fn all_tab_ids(workspace: &Workspace) -> Vec<TabId> {
        let mut ids: Vec<_> = workspace.tabs().iter().map(|found| found.tab.id).collect();
        ids.sort();
        ids
    }

    fn all_folder_ids(workspace: &Workspace, folders: &[FolderId]) -> usize {
        folders
            .iter()
            .filter(|id| workspace.find_folder(**id).is_some())
            .count()
    }

    proptest! {
        /// Any sequence of tab and folder moves keeps every tab and folder
        /// exactly once, and the workspace valid.
        #[test]
        fn moves_never_lose_or_duplicate_anything(
            moves in prop::collection::vec((any::<bool>(), 0usize..6, 0usize..6, 0usize..8), 0..40)
        ) {
            let (mut workspace, profile, group, sprint) = work();
            let other = workspace.add_profile("Other").expect("profile");
            let loose = workspace.add_folder(Place::Profile(other), "Loose").expect("folder");
            let places = [
                Place::Profile(profile),
                Place::Group(group),
                Place::Folder(sprint),
                Place::Profile(other),
                Place::Folder(loose),
                Place::Group(GroupId::new()),
            ];
            let folders = [sprint, loose];
            let tabs: Vec<_> = (0..6)
                .map(|n| {
                    workspace
                        .add_tab(places[n % 5], url(&format!("https://t{n}.dev")), "t")
                        .expect("tab")
                })
                .collect();
            let before = all_tab_ids(&workspace);

            for (is_folder, item, place, index) in moves {
                // Errors (nested folders, unknown places) must change nothing.
                if is_folder {
                    let _ = workspace.move_folder(folders[item % 2], places[place], index);
                } else {
                    let _ = workspace.move_tab(tabs[item], places[place], index);
                }
            }

            prop_assert_eq!(all_tab_ids(&workspace), before);
            prop_assert_eq!(all_folder_ids(&workspace, &folders), 2);
            prop_assert_eq!(workspace.validate(), Ok(()));
        }
    }
}

#[test]
fn set_details_trims_keeps_line_breaks_and_clears_blank_values() {
    let (mut workspace, profile, _, _) = work();
    let tab = workspace
        .add_tab(Place::Profile(profile), url("https://a.dev"), "a")
        .expect("tab");

    workspace
        .set_details(Target::Tab(tab), " PROJ-1 ", "\n line 1\nline 2 \n")
        .expect("details");
    let found = &workspace.find_tab(tab).expect("t").tab;
    assert_eq!(found.ticket_id.as_deref(), Some("PROJ-1"));
    assert_eq!(found.note.as_deref(), Some("line 1\nline 2"));

    workspace
        .set_details(Target::Tab(tab), "", "  ")
        .expect("clear");
    let found = &workspace.find_tab(tab).expect("t").tab;
    assert_eq!(found.ticket_id, None);
    assert_eq!(found.note, None);
}

#[test]
fn set_details_works_on_groups_and_folders_and_caps_the_ticket() {
    let (mut workspace, profile, _, _) = work();
    let group = workspace
        .add_group(profile, "G", AccentColor::Blue)
        .expect("group");
    let folder = workspace
        .add_folder(Place::Group(group), "F")
        .expect("folder");

    workspace
        .set_details(Target::Group(group), &"x".repeat(100), "g")
        .expect("group");
    workspace
        .set_details(Target::Folder(folder), "F-1", "f")
        .expect("folder");

    let group = workspace.group(group).expect("g");
    assert_eq!(
        group.ticket_id.as_ref().map(String::len),
        Some(MAX_TICKET_ID_LEN)
    );
    assert_eq!(group.note.as_deref(), Some("g"));
    assert_eq!(
        workspace
            .find_folder(folder)
            .expect("f")
            .folder
            .ticket_id
            .as_deref(),
        Some("F-1")
    );
}

#[test]
fn set_details_of_unknown_target_fails() {
    let (mut workspace, _, _, _) = work();
    let missing = TabId::new();

    assert_eq!(
        workspace.set_details(Target::Tab(missing), "A-1", ""),
        Err(WorkspaceError::TabNotFound(missing))
    );
}

#[test]
fn details_are_left_out_of_the_json_when_empty() {
    let (mut workspace, profile, _, _) = work();
    let tab = workspace
        .add_tab(Place::Profile(profile), url("https://a.dev"), "a")
        .expect("tab");
    let plain = serde_json::to_string(&workspace).expect("json");
    assert!(!plain.contains("ticketId"));

    workspace
        .set_details(Target::Tab(tab), "A-1", "n")
        .expect("details");
    let json = serde_json::to_string(&workspace).expect("json");
    assert!(json.contains(r#""ticketId":"A-1""#));
    assert!(json.contains(r#""note":"n""#));
}
