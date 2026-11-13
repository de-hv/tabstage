use super::*;

fn url(raw: &str) -> TabUrl {
    TabUrl::parse(raw).expect("valid test url")
}

fn color(index: u8) -> ProfileColor {
    ProfileColor::new(index).expect("color")
}

fn first_profile(workspace: &Workspace) -> ProfileId {
    workspace.profiles()[0].id
}

/// A profile with a status "In TEST" and a ticket in it.
fn work() -> (Workspace, ProfileId, StatusId, TicketId) {
    let mut workspace = Workspace::new();
    let profile = first_profile(&workspace);
    let status = workspace.add_status("In TEST", color(0)).expect("status");
    let ticket = workspace
        .add_ticket(
            TicketPlace::Profile(profile),
            "Carrier Commissions",
            Some(status),
        )
        .expect("ticket");
    (workspace, profile, status, ticket)
}

fn titles(workspace: &Workspace, profile: ProfileId) -> Vec<String> {
    workspace
        .profile(profile)
        .expect("profile")
        .tickets
        .iter()
        .map(|ticket| ticket.title.clone())
        .collect()
}

#[test]
fn a_new_workspace_has_one_empty_profile_and_no_statuses() {
    let workspace = Workspace::new();
    assert_eq!(workspace.profiles().len(), 1);
    assert!(workspace.statuses().is_empty());
    assert!(workspace.validate().is_ok());
}

// ---- statuses -------------------------------------------------------------

#[test]
fn statuses_keep_their_order_and_can_be_changed() {
    let mut workspace = Workspace::new();
    let review = workspace.add_status("In review", color(1)).expect("review");
    let test = workspace.add_status(" In TEST ", color(2)).expect("test");
    assert_eq!(workspace.status(test).expect("test").name, "In TEST");

    workspace.move_status(test, 0).expect("move");
    workspace.rename_status(review, "Review").expect("rename");
    workspace.set_status_color(review, color(5)).expect("color");

    let names: Vec<_> = workspace
        .statuses()
        .iter()
        .map(|s| s.name.as_str())
        .collect();
    assert_eq!(names, ["In TEST", "Review"]);
    assert_eq!(workspace.status(review).expect("review").color, color(5));
    assert_eq!(
        workspace.add_status(" ", color(0)),
        Err(WorkspaceError::EmptyName)
    );
}

#[test]
fn removing_a_status_leaves_its_tickets_and_sub_tickets_without_one() {
    let (mut workspace, _, status, ticket) = work();
    let child = workspace
        .add_ticket(TicketPlace::Ticket(ticket), "Story", Some(status))
        .expect("child");

    workspace.remove_status(status).expect("remove");

    assert_eq!(
        workspace.ticket(ticket).expect("ticket").ticket.status,
        None
    );
    assert_eq!(workspace.ticket(child).expect("child").ticket.status, None);
    assert!(workspace.validate().is_ok());
}

// ---- tickets --------------------------------------------------------------

#[test]
fn tickets_take_a_key_an_address_a_status_and_a_note() {
    let (mut workspace, _, status, ticket) = work();

    workspace.set_ticket_key(ticket, " CAR-5899 ").expect("key");
    workspace
        .set_ticket_address(ticket, Some(url("https://jira.dev/browse/CAR-5899")))
        .expect("address");
    workspace
        .set_text(TextOwner::Ticket(ticket), "  ## Steps\n- [ ] QA  ")
        .expect("note");
    workspace
        .set_ticket_status(ticket, None)
        .expect("no status");
    workspace
        .set_ticket_status(ticket, Some(status))
        .expect("status");

    let found = workspace.ticket(ticket).expect("ticket").ticket;
    assert_eq!(found.key.as_deref(), Some("CAR-5899"));
    assert_eq!(found.note.as_deref(), Some("## Steps\n- [ ] QA"));
    assert_eq!(found.status, Some(status));
    assert_eq!(
        workspace.ticket_address(ticket).map(TabUrl::as_str),
        Ok("https://jira.dev/browse/CAR-5899")
    );
    let missing = StatusId::new();
    assert_eq!(
        workspace.set_ticket_status(ticket, Some(missing)),
        Err(WorkspaceError::StatusNotFound(missing))
    );
}

#[test]
fn a_ticket_without_its_own_address_has_none_to_open() {
    let (workspace, _, _, ticket) = work();
    assert_eq!(
        workspace.ticket_address(ticket),
        Err(WorkspaceError::NoTicketLink)
    );
}

#[test]
fn sub_tickets_go_one_level_deep() {
    let (mut workspace, profile, _, ticket) = work();
    let child = workspace
        .add_ticket(TicketPlace::Ticket(ticket), "CAR-6020", None)
        .expect("child");

    let found = workspace.ticket(child).expect("child");
    assert_eq!(found.parent.map(|parent| parent.id), Some(ticket));
    assert_eq!(
        workspace.add_ticket(TicketPlace::Ticket(child), "Too deep", None),
        Err(WorkspaceError::NestedTicket)
    );
    // A ticket with sub-tickets cannot become one.
    let other = workspace
        .add_ticket(TicketPlace::Profile(profile), "Other", None)
        .expect("other");
    assert_eq!(
        workspace.move_ticket(ticket, TicketPlace::Ticket(other), 0),
        Err(WorkspaceError::NestedTicket)
    );
    assert_eq!(
        workspace.move_ticket(other, TicketPlace::Ticket(other), 0),
        Err(WorkspaceError::NestedTicket)
    );
}

#[test]
fn tickets_move_within_a_profile_out_of_a_parent_and_across_profiles() {
    let (mut workspace, profile, _, ticket) = work();
    let second = workspace
        .add_ticket(TicketPlace::Profile(profile), "Second", None)
        .expect("second");
    let child = workspace
        .add_ticket(TicketPlace::Ticket(ticket), "Child", None)
        .expect("child");

    workspace
        .move_ticket(second, TicketPlace::Profile(profile), 0)
        .expect("reorder");
    assert_eq!(
        titles(&workspace, profile),
        ["Second", "Carrier Commissions"]
    );

    workspace
        .move_ticket(child, TicketPlace::Profile(profile), 1)
        .expect("promote");
    assert_eq!(
        titles(&workspace, profile),
        ["Second", "Child", "Carrier Commissions"]
    );

    let other = workspace.add_profile("Personal").expect("profile");
    workspace
        .move_ticket(second, TicketPlace::Profile(other), 0)
        .expect("across");
    assert_eq!(titles(&workspace, other), ["Second"]);
}

#[test]
fn removing_a_ticket_removes_its_sub_tickets_and_unpins_them() {
    let (mut workspace, _, _, ticket) = work();
    let child = workspace
        .add_ticket(TicketPlace::Ticket(ticket), "Child", None)
        .expect("child");
    workspace.pin(Target::Ticket(child)).expect("pin child");

    workspace.remove_ticket(ticket).expect("remove");

    assert!(workspace.ticket(child).is_none());
    assert!(workspace.pinned().is_empty());
}

// ---- notes and kinds --------------------------------------------------------

#[test]
fn notes_hold_a_body() {
    let mut workspace = Workspace::new();
    let profile = first_profile(&workspace);
    let note = workspace.add_note(profile, "Standup notes").expect("note");
    workspace
        .set_text(TextOwner::Note(note), "Talk about CAR-6210")
        .expect("body");

    let (_, found) = workspace.note(note).expect("note");
    assert_eq!(found.body.as_deref(), Some("Talk about CAR-6210"));
}

#[test]
fn tickets_have_a_kind_that_is_saved_only_when_not_the_default() {
    let (mut workspace, _, _, ticket) = work();
    let child = workspace
        .add_ticket(TicketPlace::Ticket(ticket), "Fix crash", None)
        .expect("child");
    assert_eq!(
        workspace.ticket(child).expect("child").ticket.kind,
        TicketKind::Ticket
    );

    workspace
        .set_ticket_kind(child, TicketKind::Bug)
        .expect("kind");

    assert_eq!(
        workspace.ticket(child).expect("child").ticket.kind,
        TicketKind::Bug
    );
    let json = serde_json::to_string(&workspace).expect("json");
    assert_eq!(json.matches("\"kind\"").count(), 1, "{json}");
    assert!(json.contains("\"kind\":\"bug\""));
}

// ---- profiles ---------------------------------------------------------------

#[test]
fn removing_a_profile_moves_its_tickets_and_notes() {
    let (mut workspace, first, _, ticket) = work();
    let second = workspace.add_profile("Personal").expect("profile");
    workspace.add_note(first, "Notes").expect("note");

    workspace.remove_profile(first, second).expect("remove");

    let kept = workspace.profile(second).expect("second");
    assert_eq!(kept.tickets[0].id, ticket);
    assert_eq!(kept.notes.len(), 1);
    assert_eq!(
        workspace.remove_profile(second, second),
        Err(WorkspaceError::SameProfile)
    );
}

// ---- pinned -----------------------------------------------------------------

#[test]
fn pinning_keeps_order_ignores_repeats_and_reorders() {
    let (mut workspace, profile, _, ticket) = work();
    let note = workspace.add_note(profile, "Notes").expect("note");

    workspace.pin(Target::Ticket(ticket)).expect("pin");
    workspace.pin(Target::Note(note)).expect("pin note");
    workspace.pin(Target::Ticket(ticket)).expect("again");
    workspace.move_pinned(Target::Note(note), 0).expect("move");
    assert_eq!(
        workspace.pinned(),
        [Target::Note(note), Target::Ticket(ticket)]
    );

    workspace.unpin(Target::Note(note));
    assert_eq!(workspace.pinned(), [Target::Ticket(ticket)]);
    let missing = NoteId::new();
    assert_eq!(
        workspace.pin(Target::Note(missing)),
        Err(WorkspaceError::NoteNotFound(missing))
    );
}

// ---- validation and json -----------------------------------------------------

#[test]
fn validation_rejects_unknown_statuses_and_deep_tickets() {
    let (workspace, _, _, _) = work();
    let mut json = serde_json::to_value(&workspace).expect("json");
    json["statuses"] = serde_json::json!([]);
    let broken: Workspace = serde_json::from_value(json).expect("parse");
    assert!(matches!(
        broken.validate(),
        Err(WorkspaceError::StatusNotFound(_))
    ));
}

#[test]
fn empty_fields_are_left_out_of_the_json() {
    let (workspace, _, _, _) = work();
    let json = serde_json::to_string(&workspace).expect("json");
    for absent in [
        "\"key\"",
        "\"url\"",
        "\"note\"",
        "\"kind\"",
        "\"children\"",
        "\"pinned\"",
    ] {
        assert!(!json.contains(absent), "{absent} in {json}");
    }
    assert!(json.contains("\"statuses\""));
}
