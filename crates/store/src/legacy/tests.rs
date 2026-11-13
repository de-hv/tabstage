use serde_json::json;
use tabstage_core::{Workspace, WorkspaceError};

use super::*;

const PROFILE: &str = "00000000-0000-0000-0000-0000000000c1";

fn tab(id: &str, key: &str, title: &str) -> Value {
    json!({ "type": "tab", "id": id, "url": format!("https://arrive.atlassian.net/browse/{key}"),
            "title": title, "ticketId": key })
}

fn folder_tab(id: &str, key: &str, title: &str) -> Value {
    let mut value = tab(id, key, title);
    value.as_object_mut().expect("tab").remove("type");
    value
}

/// The structure of the screenshot: groups used as statuses, tabs used as
/// tickets, folders used as epics, and standup notes.
fn arrive_v4() -> String {
    json!({
        "app": "tabstage-desktop",
        "version": 4,
        "settings": {},
        "workspace": { "profiles": [{
            "id": PROFILE, "name": "Arrive Logistics", "color": 12, "ticketUrl": "https://arrive.atlassian.net/browse/{ticket}",
            "items": [
                { "type": "group", "id": "g-test", "name": "In TEST", "color": 0, "children": [
                    { "type": "folder", "id": "f-cc", "name": "Carrier Commissions 2027", "collapsed": false, "tabs": [
                        folder_tab("t-5899", "CAR-5899", "Epic - Carrier Commissions"),
                        folder_tab("t-6021", "CAR-6021", "10. Matches legacy money"),
                        folder_tab("t-6020", "CAR-6020", "9. Money card: colour by")
                    ] },
                    tab("t-6080", "CAR-6080", "MOB: allow VP+ unrestricted"),
                    tab("t-6163", "CAR-6163", "TEUI: Remove Map")
                ] },
                { "type": "group", "id": "g-stg", "name": "In STG", "color": 5, "children": [
                    tab("t-6100", "CAR-6100", "CSUI GQL to REST"),
                    tab("t-6124", "CAR-6124", "CSUI Federated")
                ] },
                { "type": "folder", "id": "f-rtd", "name": "Ready to Deploy", "color": 7, "collapsed": false, "tabs": [
                    folder_tab("t-5741", "CAR-5741", "CSUI: Onboarded Filter"),
                    folder_tab("t-5946", "CAR-5946", "CCUI: DOT-UI integration")
                ] },
                { "type": "group", "id": "g-rev", "name": "In Review", "color": "parent", "children": [
                    { "type": "folder", "id": "f-dec", "name": "Decouple Unverified Compliance Status", "collapsed": false, "tabs": [
                        folder_tab("t-6206", "CAR-6206", "Story"),
                        folder_tab("t-6210", "CAR-6210", "CSUI: Decouple Unverified")
                    ] }
                ] },
                { "type": "group", "id": "g-notes", "name": "Standup Notes", "note": "Yesterday: CAR-6210", "children": [] }
            ]
        }] }
    })
    .to_string()
}

fn imported(chosen: &HashMap<String, Role>) -> (Workspace, ImportSummary) {
    let tree = read_legacy(&arrive_v4()).expect("read");
    let mut workspace = Workspace::new();
    let summary = import_legacy(&mut workspace, &tree, chosen).expect("import");
    (workspace, summary)
}

fn status_names(workspace: &Workspace) -> Vec<&str> {
    workspace
        .statuses()
        .iter()
        .map(|s| s.name.as_str())
        .collect()
}

#[test]
fn reads_old_files_as_a_tree() {
    let tree = read_legacy(&arrive_v4()).expect("read");
    assert_eq!(tree.version, 4);
    let profile = &tree.profiles[0];
    assert_eq!(profile.name, "Arrive Logistics");
    assert_eq!(profile.items.len(), 5);
    let test = &profile.items[0];
    assert_eq!(
        (test.kind, test.color.and_then(ProfileColor::index)),
        (LegacyKind::Group, Some(0))
    );
    assert_eq!(test.children[0].children.len(), 3);
    assert_eq!(profile.items[3].color, None, "\"parent\" is not a color");
}

#[test]
fn refuses_current_files_and_other_apps() {
    assert!(matches!(
        read_legacy(r#"{"app":"tabstage-desktop","version":5}"#),
        Err(StoreError::UnsupportedVersion(5))
    ));
    assert!(matches!(
        read_legacy(r#"{"app":"other","version":2}"#),
        Err(StoreError::NotTabstage)
    ));
}

#[test]
fn suggested_roles_turn_the_screenshot_into_statuses_tickets_and_a_note() {
    let (workspace, summary) = imported(&HashMap::new());

    assert_eq!(
        status_names(&workspace),
        ["In TEST", "In STG", "Ready to Deploy", "In Review"]
    );
    let colors: Vec<_> = workspace
        .statuses()
        .iter()
        .filter_map(|s| s.color.index())
        .collect();
    assert_eq!(&colors[..3], [0, 5, 7]);

    let profile = &workspace.profiles()[0];
    assert_eq!(
        workspace.profiles().len(),
        1,
        "the empty default profile is dropped"
    );
    assert_eq!(
        profile.id.to_string(),
        PROFILE,
        "keeps the id, so the browser choice applies"
    );
    let titles: Vec<_> = profile.tickets.iter().map(|t| t.title.as_str()).collect();
    assert_eq!(
        titles,
        [
            "Carrier Commissions 2027",
            "MOB: allow VP+ unrestricted",
            "TEUI: Remove Map",
            "CSUI GQL to REST",
            "CSUI Federated",
            "CSUI: Onboarded Filter",
            "CCUI: DOT-UI integration",
            "Story",
            "CSUI: Decouple Unverified",
        ]
    );

    // The epic tab gives the folder's ticket its key and address; the other
    // tabs become its sub-tickets, in the same status.
    let epic = &profile.tickets[0];
    let test = workspace.statuses()[0].id;
    assert_eq!(epic.key.as_deref(), Some("CAR-5899"));
    assert_eq!(
        epic.url.as_ref().map(TabUrl::as_str),
        Some("https://arrive.atlassian.net/browse/CAR-5899")
    );
    assert_eq!(epic.status, Some(test));
    let children: Vec<_> = epic.children.iter().map(|t| t.key.as_deref()).collect();
    assert_eq!(children, [Some("CAR-6021"), Some("CAR-6020")]);
    assert!(epic.children.iter().all(|child| child.status == Some(test)));

    // The folder without an epic is unwrapped: its tabs are tickets in review.
    let review = workspace.statuses()[3].id;
    assert_eq!(profile.tickets[7].status, Some(review));
    assert_eq!(profile.tickets[7].key.as_deref(), Some("CAR-6206"));

    // Standup notes become a note.
    assert_eq!(profile.notes.len(), 1);
    assert_eq!(profile.notes[0].title, "Standup Notes");
    assert_eq!(
        profile.notes[0].body.as_deref(),
        Some("Yesterday: CAR-6210")
    );

    assert_eq!(summary.roles["f-dec"], Role::Unwrap);
    assert_eq!(summary.roles["t-5899"], Role::OwnLink);
    assert_eq!(summary.roles["g-notes"], Role::Note);
    assert_eq!(
        (summary.statuses, summary.tickets, summary.notes),
        (4, 11, 1)
    );
}

#[test]
fn chosen_roles_win_and_change_what_their_children_suggest() {
    let chosen = HashMap::from([
        // The review folder as one ticket: its tabs become sub-tickets.
        ("f-dec".to_owned(), Role::Ticket),
        // In STG as a note: its tabs become links in its body.
        ("g-stg".to_owned(), Role::Note),
        // A role that does not fit a tab is ignored.
        ("t-6080".to_owned(), Role::Status),
    ]);
    let (workspace, summary) = imported(&chosen);

    assert_eq!(
        status_names(&workspace),
        ["In TEST", "Ready to Deploy", "In Review"]
    );
    let profile = &workspace.profiles()[0];
    let decouple = profile
        .tickets
        .iter()
        .find(|t| t.title == "Decouple Unverified Compliance Status")
        .expect("ticket");
    assert_eq!(decouple.children.len(), 2);
    let stg = profile
        .notes
        .iter()
        .find(|n| n.title == "In STG")
        .expect("note");
    let body = stg.body.as_deref().expect("body");
    assert_eq!(
        body.lines().filter(|line| line.starts_with("- [")).count(),
        2
    );
    assert!(body.starts_with("- [CAR-6100 CSUI GQL to REST]("), "{body}");
    assert_eq!(summary.roles["t-6080"], Role::Ticket);
}

#[test]
fn importing_into_a_used_workspace_reuses_profiles_and_statuses() {
    let tree = read_legacy(&arrive_v4()).expect("read");
    let mut workspace = Workspace::new();
    let mine = workspace.add_profile("arrive logistics").expect("profile");
    workspace
        .add_status("In TEST", ProfileColor::new(9).expect("color"))
        .expect("status");

    import_legacy(&mut workspace, &tree, &HashMap::new()).expect("import");

    assert_eq!(
        workspace.profiles().len(),
        2,
        "the default profile stays: it was not alone"
    );
    assert_eq!(workspace.statuses().len(), 4);
    assert_eq!(workspace.statuses()[0].color.index(), Some(9));
    assert_eq!(workspace.profile(mine).expect("mine").tickets.len(), 9);
}

#[test]
fn import_keeps_the_workspace_valid() {
    let tree = read_legacy(&arrive_v4()).expect("read");
    let mut workspace = Workspace::new();
    import_legacy(&mut workspace, &tree, &HashMap::new()).expect("first");
    // Importing twice adds copies with new ids.
    let again: std::result::Result<_, WorkspaceError> =
        import_legacy(&mut workspace, &tree, &HashMap::new());
    assert!(again.is_ok());
    assert_eq!(workspace.profiles()[0].tickets.len(), 18);
}

#[test]
fn version_1_files_are_read_with_their_browsers() {
    let v1 = r#"{"app":"tabstage-desktop","version":1,
        "settings":{"defaultBrowser":"org.mozilla.firefox"},
        "workspace":{"statuses":[],"groups":[
          {"id":"00000000-0000-0000-0000-000000000001","name":"Work","color":"blue",
           "browser":{"kind":"specific","browser":"com.google.Chrome"},"children":[]}]}}"#;

    let tree = read_legacy(v1).expect("read");

    assert_eq!(tree.version, 1);
    assert_eq!(tree.bindings.len(), 2);
    let names: Vec<_> = tree.profiles.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(names, ["Default", "com.google.Chrome"]);
}
