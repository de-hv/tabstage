//! Tests for [`AppService`], driven through a fake [`System`] and temporary
//! data and config files.

use std::cell::RefCell;
use std::fs;

use tabstage_browsers::{BrowserKind, Focus, Launch};

use super::*;
use crate::config::{AppConfig, load_config, save_config};

fn id(raw: &str) -> BrowserId {
    BrowserId::parse(raw).expect("id")
}

fn browser(raw: &str, name: &str) -> BrowserInfo {
    let id = id(raw);
    BrowserInfo {
        kind: BrowserKind::from_id(&id),
        id,
        name: name.to_owned(),
        launch: Launch::MacBundle,
    }
}

struct FakeSystem {
    installed: Vec<BrowserInfo>,
    default: Option<BrowserId>,
    focus: Focus,
    opened: RefCell<Vec<String>>,
}

impl FakeSystem {
    fn new(default: Option<&str>) -> Self {
        Self {
            installed: vec![
                browser("com.google.Chrome", "Google Chrome"),
                browser("org.mozilla.firefox", "Firefox"),
                browser("com.apple.Safari", "Safari"),
            ],
            default: default.map(id),
            focus: Focus::NotFound,
            opened: RefCell::default(),
        }
    }

    fn without(mut self, raw: &str) -> Self {
        self.installed.retain(|browser| browser.id.as_str() != raw);
        self
    }
}

impl Catalog for FakeSystem {
    fn installed(&self) -> tabstage_browsers::Result<Vec<BrowserInfo>> {
        Ok(self.installed.clone())
    }

    fn system_default(&self) -> tabstage_browsers::Result<Option<BrowserId>> {
        Ok(self.default.clone())
    }
}

impl Launcher for FakeSystem {
    fn open(&self, browser: &BrowserInfo, url: &TabUrl) -> tabstage_browsers::Result<()> {
        self.opened
            .borrow_mut()
            .push(format!("{} {url}", browser.id));
        Ok(())
    }
}

impl TabFocuser for FakeSystem {
    fn focus(&self, _: &BrowserInfo, _: &TabUrl) -> tabstage_browsers::Result<Focus> {
        Ok(self.focus)
    }
}

struct Fixture {
    dir: tempfile::TempDir,
}

impl Fixture {
    fn new() -> Self {
        Self {
            dir: tempfile::tempdir().expect("tempdir"),
        }
    }

    /// The default data file location.
    fn path(&self) -> PathBuf {
        self.dir.path().join("workspace.json")
    }

    fn config_path(&self) -> PathBuf {
        self.dir.path().join("config/config.json")
    }

    fn config(&self) -> AppConfig {
        load_config(&self.config_path())
    }

    fn start(&self, system: FakeSystem) -> AppService<FakeSystem> {
        self.start_on(system, Platform::Linux)
    }

    fn start_on(&self, system: FakeSystem, platform: Platform) -> AppService<FakeSystem> {
        AppService::start(
            system,
            FileStore::new(self.path()),
            self.config_path(),
            platform,
        )
        .expect("start")
    }
}

fn first_profile(service: &AppService<FakeSystem>) -> ProfileId {
    service.document.workspace.profiles()[0].id
}

fn add_profile(service: &mut AppService<FakeSystem>, name: &str) -> ProfileId {
    let snapshot = service
        .apply(Command::AddProfile {
            name: name.to_owned(),
        })
        .expect("add profile");
    snapshot
        .workspace
        .profiles()
        .iter()
        .find(|profile| profile.name == name)
        .expect("profile")
        .id
}

fn ticket_named(service: &AppService<FakeSystem>, title: &str) -> TicketId {
    service
        .document
        .workspace
        .profiles()
        .iter()
        .flat_map(|profile| &profile.tickets)
        .flat_map(|ticket| std::iter::once(ticket).chain(&ticket.children))
        .find(|ticket| ticket.title == title)
        .expect("ticket")
        .id
}

fn add_ticket_in(
    service: &mut AppService<FakeSystem>,
    place: TicketPlace,
    title: &str,
) -> TicketId {
    service
        .apply(Command::AddTicket {
            id: None,
            place,
            title: title.to_owned(),
            key: None,
            status: None,
        })
        .expect("add ticket");
    ticket_named(service, title)
}

fn add_ticket(service: &mut AppService<FakeSystem>, title: &str) -> TicketId {
    let profile = first_profile(service);
    add_ticket_in(service, TicketPlace::Profile(profile), title)
}

fn add_link(service: &mut AppService<FakeSystem>, owner: LinkOwner, url: &str) -> TabId {
    service
        .apply(Command::AddLink {
            owner,
            url: url.to_owned(),
            title: String::new(),
        })
        .expect("add link");
    let workspace = &service.document.workspace;
    workspace
        .profiles()
        .iter()
        .flat_map(|profile| {
            profile
                .tickets
                .iter()
                .flat_map(|ticket| std::iter::once(ticket).chain(&ticket.children))
                .flat_map(|ticket| &ticket.links)
                .chain(profile.notes.iter().flat_map(|note| &note.links))
        })
        .find(|link| link.url.as_str() == url)
        .expect("link")
        .id
}

fn titles(snapshot: &Snapshot) -> Vec<String> {
    snapshot
        .workspace
        .profiles()
        .iter()
        .flat_map(|profile| &profile.tickets)
        .map(|ticket| ticket.title.clone())
        .collect()
}

fn ticket_document(title: &str) -> Document {
    let mut document = Document::default();
    let profile = document.workspace.profiles()[0].id;
    document
        .workspace
        .add_ticket(TicketPlace::Profile(profile), title, None)
        .expect("ticket");
    document
}

fn bind(service: &mut AppService<FakeSystem>, profile: ProfileId, browser: Option<&str>) {
    service
        .apply(Command::BindProfile {
            profile,
            browser: browser.map(id),
        })
        .expect("bind");
}

fn view(service: &AppService<FakeSystem>, profile: ProfileId) -> ProfileView {
    service
        .snapshot()
        .profiles
        .into_iter()
        .find(|view| view.profile == profile)
        .expect("profile view")
}

// ---- first run and data file ----------------------------------------------

#[test]
fn first_start_binds_the_only_profile_and_waits_for_a_data_file() {
    let fixture = Fixture::new();

    let service = fixture.start(FakeSystem::new(Some("com.google.chrome")));

    let profile = first_profile(&service);
    let view = view(&service, profile);
    assert_eq!(view.browser, Some(id("com.google.Chrome")));
    assert!(view.is_bound);
    assert!(service.snapshot().needs_data_file);
    assert!(
        !fixture.path().exists(),
        "nothing written before the choice"
    );
}

#[test]
fn choosing_the_default_location_writes_the_file_there() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));

    let snapshot = service.choose_data_file(None).expect("choose");

    assert!(!snapshot.needs_data_file);
    assert!(fixture.path().exists());
    assert_eq!(fixture.config().data_path, None);
}

#[test]
fn a_known_data_file_never_asks_again() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    service.choose_data_file(None).expect("choose");
    drop(service);

    let restarted = fixture.start(FakeSystem::new(None));

    assert!(!restarted.snapshot().needs_data_file);
}

#[test]
fn a_chosen_folder_without_a_file_gets_one_on_start() {
    let fixture = Fixture::new();
    let folder = tempfile::tempdir().expect("tempdir");
    let path = config::data_file_in(folder.path());
    let config = AppConfig {
        data_path: Some(path.clone()),
        ..AppConfig::default()
    };
    save_config(&fixture.config_path(), &config).expect("config");
    let service = AppService::start(
        FakeSystem::new(None),
        FileStore::new(path.clone()),
        fixture.config_path(),
        Platform::Linux,
    )
    .expect("start");

    assert!(!service.snapshot().needs_data_file);
    assert!(path.exists());
}

#[test]
fn unknown_system_default_falls_back_to_first_installed() {
    let fixture = Fixture::new();

    let service = fixture.start(FakeSystem::new(Some("org.gnome.Epiphany")));

    assert_eq!(
        service.snapshot().system_browser,
        Some(id("com.google.Chrome"))
    );
}

#[test]
fn binding_a_profile_is_saved_in_this_machines_config_only() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let work = add_profile(&mut service, "Trabajo");
    let data_before = fs::read_to_string(fixture.path()).expect("file");

    bind(&mut service, work, Some("com.google.Chrome"));

    assert_eq!(
        fs::read_to_string(fixture.path()).expect("file"),
        data_before
    );
    assert_eq!(
        fixture
            .config()
            .profiles
            .get(&work)
            .map(|b| b.browser.clone()),
        Some(id("com.google.Chrome"))
    );
    assert_eq!(view(&service, work).browser, Some(id("com.google.Chrome")));
}

#[test]
fn binding_no_browser_goes_back_to_the_system_browser() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let work = add_profile(&mut service, "Trabajo");
    bind(&mut service, work, Some("com.google.Chrome"));

    bind(&mut service, work, None);

    let view = view(&service, work);
    assert!(!view.is_bound);
    assert_eq!(view.browser, Some(id("org.mozilla.firefox")));
    assert!(!fixture.config().profiles.contains_key(&work));
}

#[test]
fn binding_rejects_unknown_profiles_and_browsers() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let profile = first_profile(&service);
    let mut attempt = |profile, browser: &str| {
        service
            .apply(Command::BindProfile {
                profile,
                browser: Some(id(browser)),
            })
            .map(drop)
            .map_err(|e| e.code())
    };

    assert_eq!(attempt(profile, "com.brave.Browser"), Err("unknownBrowser"));
    assert_eq!(
        attempt(ProfileId::new(), "com.google.Chrome"),
        Err("notFound")
    );
}

#[test]
fn profile_color_can_be_changed() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let profile = first_profile(&service);
    let color = ProfileColor::new(11).expect("color");

    let snapshot = service
        .apply(Command::SetProfileColor { profile, color })
        .expect("color");

    assert_eq!(snapshot.workspace.profiles()[0].color, color);
}

#[test]
fn snapshot_reports_the_data_path() {
    let fixture = Fixture::new();

    let service = fixture.start(FakeSystem::new(None));

    assert_eq!(
        service.snapshot().data_path,
        fixture.path().display().to_string()
    );
}

#[test]
fn error_payload_has_code_and_full_message() {
    let error = AppError::from(WorkspaceError::EmptyName);

    let payload = ErrorPayload::from(&error);

    assert_eq!(payload.code, "invalid");
    assert_eq!(payload.message, "name is empty");
}

// ---- data file --------------------------------------------------------------

#[test]
fn choosing_a_local_folder_remembers_it_and_loads_data_already_there() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let folder = tempfile::tempdir().expect("tempdir");
    let path = config::data_file_in(folder.path());
    fs::write(&path, tabstage_store::to_json(&ticket_document("Kept"))).expect("write");

    let snapshot = service
        .choose_data_file(Some(path.clone()))
        .expect("choose");

    assert!(!snapshot.needs_data_file);
    assert_eq!(fixture.config().data_path, Some(path));
    assert_eq!(titles(&snapshot), ["Kept"]);
    assert!(!fixture.path().exists());
}

#[test]
fn cloud_folders_are_refused_for_the_data_file() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let icloud = PathBuf::from(
        "/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Tabstage/workspace.json",
    );

    let chosen = service.choose_data_file(Some(icloud.clone()));
    let moved = service.relocate(icloud, Relocate::ReplaceWithMine);

    assert_eq!(chosen.map(drop).map_err(|e| e.code()), Err("cloudFolder"));
    assert_eq!(moved.map(drop).map_err(|e| e.code()), Err("cloudFolder"));
    assert!(service.snapshot().needs_data_file);
}

#[test]
fn changes_are_saved_and_survive_a_restart() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    add_ticket(&mut service, "Work");
    drop(service);

    let restarted = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));

    assert_eq!(titles(&restarted.snapshot()), ["Work"]);
}

#[test]
fn change_on_disk_is_a_conflict_until_reload_or_force() {
    let fixture = Fixture::new();
    let mut laptop = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    add_ticket(&mut laptop, "Mine");
    let other = ticket_document("Theirs");
    fs::write(fixture.path(), tabstage_store::to_json(&other)).expect("external write");

    assert!(laptop.has_external_change().expect("check"));
    let conflict = laptop.apply(Command::AddProfile {
        name: "Otro".into(),
    });
    assert_eq!(conflict.map(drop).map_err(|e| e.code()), Err("conflict"));

    let reloaded = laptop.reload().expect("reload");
    assert_eq!(titles(&reloaded), ["Theirs"]);

    add_ticket(&mut laptop, "After reload");
    fs::write(fixture.path(), tabstage_store::to_json(&other)).expect("external write");
    let forced = laptop.force_save().expect("force");
    assert_eq!(titles(&forced).len(), 2);
    assert!(!laptop.has_external_change().expect("check"));
}

#[test]
fn data_location_is_this_machine_until_the_file_moves() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    assert_eq!(
        service.snapshot().data_location.kind,
        DataLocationKind::AppData
    );

    let local = tempfile::tempdir().expect("tempdir");
    let snapshot = service
        .relocate(config::data_file_in(local.path()), Relocate::UseExisting)
        .expect("relocate");

    assert_eq!(snapshot.data_location.kind, DataLocationKind::Folder);
    assert_eq!(
        snapshot.data_location.folder,
        local.path().display().to_string()
    );
}

#[test]
fn cloud_folders_are_recognized_from_their_path() {
    let kind = |path: &str| classify_location(Path::new(path), false);
    assert_eq!(
        kind("/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Tabstage/workspace.json"),
        DataLocationKind::ICloudDrive
    );
    assert_eq!(
        kind("/Users/me/Dropbox/Tabstage/workspace.json"),
        DataLocationKind::Dropbox
    );
    assert_eq!(
        kind("/Users/me/Library/CloudStorage/OneDrive-Personal/workspace.json"),
        DataLocationKind::OneDrive
    );
    assert_eq!(
        kind("/Users/me/Library/CloudStorage/GoogleDrive-me@x.com/My Drive/workspace.json"),
        DataLocationKind::GoogleDrive
    );
    assert_eq!(
        kind("/home/me/sync/workspace.json"),
        DataLocationKind::Folder
    );
    assert_eq!(
        classify_location(Path::new("/anything/workspace.json"), true),
        DataLocationKind::AppData
    );
}

#[test]
fn relocate_moves_my_data_and_remembers_the_place() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    add_ticket(&mut service, "Mine");
    let local = tempfile::tempdir().expect("tempdir");
    let new_path = config::data_file_in(&local.path().join("Tabstage"));

    let snapshot = service
        .relocate(new_path.clone(), Relocate::UseExisting)
        .expect("relocate");
    add_ticket(&mut service, "After move");

    assert_eq!(snapshot.data_path, new_path.display().to_string());
    assert_eq!(fixture.config().data_path, Some(new_path.clone()));
    let moved = inspect_data_file(&new_path).expect("inspect");
    assert_eq!((moved.exists, moved.tickets), (true, 2));
    assert_eq!(
        inspect_data_file(&fixture.path()).expect("inspect").tickets,
        1
    );
}

#[test]
fn relocate_can_use_or_replace_the_data_already_there() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    add_ticket(&mut service, "Mine");
    let local = tempfile::tempdir().expect("tempdir");
    let new_path = config::data_file_in(local.path());
    fs::write(
        &new_path,
        tabstage_store::to_json(&ticket_document("Theirs")),
    )
    .expect("write");

    let used = service
        .relocate(new_path.clone(), Relocate::UseExisting)
        .expect("relocate");
    assert_eq!(titles(&used), ["Theirs"]);

    fs::write(&new_path, tabstage_store::to_json(&Document::default())).expect("write");
    service
        .relocate(new_path.clone(), Relocate::ReplaceWithMine)
        .expect("relocate");
    assert_eq!(inspect_data_file(&new_path).expect("inspect").tickets, 1);
}

#[test]
fn inspect_counts_tickets_and_notes_or_reports_missing() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = config::data_file_in(dir.path());
    let missing = inspect_data_file(&path).expect("inspect");
    assert_eq!(
        (missing.exists, missing.tickets, missing.notes),
        (false, 0, 0)
    );

    let mut document = ticket_document("Parent");
    let profile = document.workspace.profiles()[0].id;
    let parent = document.workspace.profiles()[0].tickets[0].id;
    document
        .workspace
        .add_ticket(TicketPlace::Ticket(parent), "Child", None)
        .expect("child");
    document.workspace.add_note(profile, "Notes").expect("note");
    fs::write(&path, tabstage_store::to_json(&document)).expect("write");

    let found = inspect_data_file(&path).expect("inspect");
    assert_eq!((found.exists, found.tickets, found.notes), (true, 2, 1));
}

// ---- tickets --------------------------------------------------------------

#[test]
fn invalid_urls_are_rejected_and_nothing_changes() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let ticket = add_ticket(&mut service, "Work");
    let before = fs::read_to_string(fixture.path()).expect("file");

    let link = service.apply(Command::AddLink {
        owner: LinkOwner::Ticket(ticket),
        url: "not a url".into(),
        title: String::new(),
    });
    let own = service.apply(Command::SetTicketUrl {
        ticket,
        url: "file:///etc/passwd".into(),
    });

    assert_eq!(link.map(drop).map_err(|e| e.code()), Err("invalidUrl"));
    assert_eq!(own.map(drop).map_err(|e| e.code()), Err("invalidUrl"));
    assert_eq!(fs::read_to_string(fixture.path()).expect("file"), before);
}

#[test]
fn dropping_a_ticket_in_another_lane_moves_it_and_changes_its_status() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let profile = first_profile(&service);
    service
        .apply(Command::AddStatus {
            name: "In TEST".into(),
            color: ProfileColor::new(0).expect("color"),
        })
        .expect("status");
    let status = service.document.workspace.statuses()[0].id;
    add_ticket(&mut service, "First");
    let second = add_ticket(&mut service, "Second");

    service
        .apply(Command::MoveTicket {
            ticket: second,
            place: TicketPlace::Profile(profile),
            index: 0,
            lane: Some(Lane {
                status: Some(status),
            }),
        })
        .expect("move");
    assert_eq!(titles(&service.snapshot()), ["Second", "First"]);
    assert_eq!(
        service
            .document
            .workspace
            .ticket(second)
            .expect("ticket")
            .ticket
            .status,
        Some(status)
    );

    service
        .apply(Command::MoveTicket {
            ticket: second,
            place: TicketPlace::Profile(profile),
            index: 0,
            lane: Some(Lane { status: None }),
        })
        .expect("move to no status");
    assert_eq!(
        service
            .document
            .workspace
            .ticket(second)
            .expect("ticket")
            .ticket
            .status,
        None
    );
}

#[test]
fn removing_a_profile_moves_its_tickets_and_forgets_its_binding() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let first = first_profile(&service);
    let work = add_profile(&mut service, "Trabajo");
    bind(&mut service, work, Some("com.google.Chrome"));
    add_ticket_in(&mut service, TicketPlace::Profile(work), "Kept");

    service
        .apply(Command::RemoveProfile {
            profile: work,
            move_items_to: first,
        })
        .expect("remove");

    assert_eq!(titles(&service.snapshot()), ["Kept"]);
    assert!(!fixture.config().profiles.contains_key(&work));
}

#[test]
fn links_and_tickets_open_in_their_profiles_browser() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let work = add_profile(&mut service, "Trabajo");
    bind(&mut service, work, Some("com.google.Chrome"));
    let ticket = add_ticket_in(&mut service, TicketPlace::Profile(work), "CAR-1");
    let child = add_ticket_in(&mut service, TicketPlace::Ticket(ticket), "CAR-2");
    service
        .apply(Command::SetTicketUrl {
            ticket,
            url: "https://jira.dev/CAR-1".into(),
        })
        .expect("url");
    let link = add_link(&mut service, LinkOwner::Ticket(ticket), "https://pr.dev/1");
    add_link(&mut service, LinkOwner::Ticket(child), "https://pr.dev/2");

    service.open_link(link).expect("link");
    service.open_ticket(ticket).expect("ticket");
    let all = service.open_ticket_all(ticket).expect("all");

    assert_eq!(all.opened, 3);
    assert_eq!(
        *service.system().opened.borrow(),
        [
            "com.google.Chrome https://pr.dev/1",
            "com.google.Chrome https://jira.dev/CAR-1",
            "com.google.Chrome https://jira.dev/CAR-1",
            "com.google.Chrome https://pr.dev/1",
            "com.google.Chrome https://pr.dev/2",
        ]
    );
    assert_eq!(
        service.open_ticket(child).map(drop).map_err(|e| e.code()),
        Err("invalid"),
        "a ticket without its own address has nothing to open"
    );
    assert!(matches!(
        service.open_url(work, "file:///etc/passwd"),
        Err(AppError::Url(_))
    ));
}

#[test]
fn unbound_profile_opens_in_the_system_browser_and_says_so() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let qa = add_profile(&mut service, "QA");
    service
        .apply(Command::AddNote {
            id: None,
            profile: qa,
            title: "Links".into(),
        })
        .expect("note");
    let note = service.document.workspace.profile(qa).expect("qa").notes[0].id;
    add_link(&mut service, LinkOwner::Note(note), "https://a.dev/");

    service.open_note(note).expect("open");

    assert_eq!(
        *service.system().opened.borrow(),
        ["org.mozilla.firefox https://a.dev/"]
    );
    let view = view(&service, qa);
    assert!(!view.is_bound);
    assert_eq!(view.browser, Some(id("org.mozilla.firefox")));
}

#[test]
fn open_link_focuses_an_existing_tab_on_macos() {
    let fixture = Fixture::new();
    let mut system = FakeSystem::new(Some("com.google.Chrome"));
    system.focus = Focus::Focused;
    let mut service = fixture.start_on(system, Platform::MacOs);
    let ticket = add_ticket(&mut service, "Work");
    let link = add_link(&mut service, LinkOwner::Ticket(ticket), "https://a.dev/");

    assert_eq!(
        service.open_link(link).expect("open"),
        Opened::FocusedExisting
    );
    assert!(service.system().opened.borrow().is_empty());
}

#[test]
fn commands_deserialize_from_ui_json() {
    let parse = |json: &str| serde_json::from_str::<Command>(json).expect(json);
    let ticket = "00000000-0000-0000-0000-000000000001";
    let profile = "00000000-0000-0000-0000-0000000000c1";

    assert!(matches!(
        parse(&format!(
            r#"{{"type":"moveTicket","ticket":"{ticket}","place":{{"profile":"{profile}"}},"index":0,"lane":{{"status":null}}}}"#
        )),
        Command::MoveTicket {
            lane: Some(Lane { status: None }),
            ..
        }
    ));
    assert!(matches!(
        parse(&format!(
            r#"{{"type":"moveTicket","ticket":"{ticket}","place":{{"ticket":"{ticket}"}},"index":1}}"#
        )),
        Command::MoveTicket { lane: None, .. }
    ));
    assert!(matches!(
        parse(&format!(
            r#"{{"type":"setText","owner":{{"note":"{ticket}"}},"text":"hi"}}"#
        )),
        Command::SetText {
            owner: LinkOwner::Note(_),
            ..
        }
    ));
    assert!(matches!(
        parse(r#"{"type":"addStatus","name":"Done","color":7}"#),
        Command::AddStatus { .. }
    ));
}

// ---- files from before tickets ----------------------------------------------

const OLD_FILE: &str = r#"{"app":"tabstage-desktop","version":4,"settings":{},"workspace":{"profiles":[
  {"id":"00000000-0000-0000-0000-0000000000c1","name":"Arrive","color":3,"items":[
    {"type":"group","id":"g1","name":"In STG","color":5,"children":[
      {"type":"tab","id":"t1","url":"https://jira.dev/CAR-6100","title":"CSUI GQL to REST","ticketId":"CAR-6100"}]}]}]}}"#;

#[test]
fn an_old_file_is_set_aside_and_offered_for_import() {
    let fixture = Fixture::new();
    fs::write(fixture.path(), OLD_FILE).expect("old file");

    let mut service = fixture.start(FakeSystem::new(Some("com.google.Chrome")));

    let backup = fixture.dir.path().join("workspace.v4-backup.json");
    assert_eq!(fs::read_to_string(&backup).expect("backup"), OLD_FILE);
    assert!(fixture.path().exists(), "a new, empty file takes its place");
    let snapshot = service.snapshot();
    assert!(!snapshot.needs_data_file);
    assert_eq!(snapshot.legacy_backup, Some(backup.display().to_string()));
    assert!(titles(&snapshot).is_empty());

    let preview = service
        .preview_import(None, &HashMap::new())
        .expect("preview");
    assert_eq!(preview.tree.profiles[0].name, "Arrive");
    assert_eq!(preview.summary.roles["g1"], Role::Status);
    assert_eq!(preview.preview.statuses()[0].name, "In STG");
    assert!(
        titles(&service.snapshot()).is_empty(),
        "a preview changes nothing"
    );

    let imported = service.import(None, &HashMap::new()).expect("import");
    assert_eq!(titles(&imported), ["CSUI GQL to REST"]);
    assert_eq!(imported.legacy_backup, None);
    assert_eq!(fixture.config().legacy_backup, None);
    assert!(backup.exists(), "the old file is kept");
    drop(service);

    let restarted = fixture.start(FakeSystem::new(Some("com.google.Chrome")));
    assert_eq!(titles(&restarted.snapshot()), ["CSUI GQL to REST"]);
}

#[test]
fn the_import_can_be_dismissed_and_run_later_from_any_file() {
    let fixture = Fixture::new();
    fs::write(fixture.path(), OLD_FILE).expect("old file");
    let mut service = fixture.start(FakeSystem::new(None));

    let dismissed = service.dismiss_import().expect("dismiss");
    assert_eq!(dismissed.legacy_backup, None);
    assert_eq!(
        service
            .preview_import(None, &HashMap::new())
            .map(drop)
            .map_err(|e| e.code()),
        Err("notFound")
    );

    let other = tempfile::tempdir().expect("tempdir");
    let copy = other.path().join("tabstage-backup.json");
    fs::write(&copy, OLD_FILE).expect("copy");
    let chosen = HashMap::from([("g1".to_owned(), Role::Unwrap)]);
    let imported = service.import(Some(copy), &chosen).expect("import");
    assert_eq!(titles(&imported), ["CSUI GQL to REST"]);
    assert!(imported.workspace.statuses().is_empty());
}

#[test]
fn a_backup_name_already_taken_gets_a_number() {
    let fixture = Fixture::new();
    fs::write(fixture.dir.path().join("workspace.v4-backup.json"), "older").expect("taken");
    fs::write(fixture.path(), OLD_FILE).expect("old file");

    fixture.start(FakeSystem::new(None));

    assert!(
        fixture
            .dir
            .path()
            .join("workspace.v4-backup-2.json")
            .exists()
    );
    assert_eq!(
        fs::read_to_string(fixture.dir.path().join("workspace.v4-backup.json")).expect("kept"),
        "older"
    );
}

#[test]
fn ui_fixture_matches_the_rust_snapshot() {
    let path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ui/src/test/fixtures/snapshot.json");
    let fixture: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&path).expect("fixture")).expect("json");
    let file = serde_json::json!({
        "app": tabstage_store::APP,
        "version": tabstage_store::FORMAT_VERSION,
        "settings": fixture["settings"],
        "workspace": fixture["workspace"],
    });
    let dir = Fixture::new();
    fs::write(dir.path(), file.to_string()).expect("write");
    let mut config = AppConfig::default();
    for view in fixture["profiles"].as_array().expect("profiles") {
        if !view["binding"].is_null() {
            let profile = serde_json::from_value(view["profile"].clone()).expect("profile id");
            let binding = serde_json::from_value(view["binding"].clone()).expect("binding");
            config.profiles.insert(profile, binding);
        }
    }
    save_config(&dir.config_path(), &config).expect("config");
    let service = dir.start_on(
        FakeSystem::new(Some("org.mozilla.firefox")),
        Platform::MacOs,
    );

    let mut actual = serde_json::to_value(service.snapshot()).expect("snapshot json");
    // The real path is a temp folder; the fixture keeps a stable one.
    actual["dataPath"] = serde_json::Value::from(
        "/Users/me/Library/Application Support/io.github.de-hv.tabstage/workspace.json",
    );
    actual["dataLocation"]["folder"] =
        serde_json::Value::from("/Users/me/Library/Application Support/io.github.de-hv.tabstage");

    if std::env::var_os("UPDATE_UI_FIXTURE").is_some() {
        let text = serde_json::to_string_pretty(&actual).expect("json") + "\n";
        fs::write(&path, text).expect("update fixture");
    } else {
        assert_eq!(
            actual, fixture,
            "UI fixture is out of date; run with UPDATE_UI_FIXTURE=1"
        );
    }
}

#[test]
fn bound_browser_missing_here_falls_back_and_is_flagged() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let work = add_profile(&mut service, "Trabajo");
    bind(&mut service, work, Some("com.google.Chrome"));
    let ticket = add_ticket_in(&mut service, TicketPlace::Profile(work), "Work");
    let link = add_link(&mut service, LinkOwner::Ticket(ticket), "https://a.dev/");
    drop(service);

    let service =
        fixture.start(FakeSystem::new(Some("org.mozilla.firefox")).without("com.google.Chrome"));
    service.open_link(link).expect("open");

    assert_eq!(
        *service.system().opened.borrow(),
        ["org.mozilla.firefox https://a.dev/"]
    );
    let view = view(&service, work);
    assert!(view.is_bound && view.is_fallback);
}

#[test]
fn a_ticket_can_be_added_with_the_id_and_key_the_ui_chose() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let profile = first_profile(&service);
    let id: TicketId = "00000000-0000-0000-0000-000000000123".parse().expect("id");
    let add = || Command::AddTicket {
        id: Some(id),
        place: TicketPlace::Profile(profile),
        title: "Decouple".into(),
        key: Some("CAR-6210".into()),
        status: None,
    };

    service.apply(add()).expect("add");
    let found = service
        .document
        .workspace
        .ticket(id)
        .expect("ticket")
        .ticket;
    assert_eq!(found.key.as_deref(), Some("CAR-6210"));
    assert_eq!(
        service.apply(add()).map(drop).map_err(|e| e.code()),
        Err("invalid")
    );
}
