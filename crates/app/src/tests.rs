//! Tests for [`AppService`], driven through a fake [`System`] and temporary
//! data and config files.

use std::cell::RefCell;
use std::fs;

use tabstage_browsers::{BrowserKind, Focus, Launch};
use tabstage_core::DEFAULT_PROFILE_NAME;

use super::*;

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
    options: RefCell<Vec<LaunchOptions>>,
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
            options: RefCell::default(),
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

    fn profiles(&self, browser: &BrowserInfo) -> tabstage_browsers::Result<Vec<BrowserProfile>> {
        Ok(if browser.id.as_str() == "com.google.Chrome" {
            vec![
                BrowserProfile {
                    id: "Default".into(),
                    name: "Personal".into(),
                },
                BrowserProfile {
                    id: "Profile 1".into(),
                    name: "Trabajo".into(),
                },
            ]
        } else {
            Vec::new()
        })
    }
}

impl Launcher for FakeSystem {
    fn open(
        &self,
        browser: &BrowserInfo,
        url: &TabUrl,
        options: &LaunchOptions,
    ) -> tabstage_browsers::Result<()> {
        self.opened
            .borrow_mut()
            .push(format!("{} {url}", browser.id));
        self.options.borrow_mut().push(options.clone());
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

fn add_group_in(service: &mut AppService<FakeSystem>, profile: ProfileId, name: &str) -> GroupId {
    let snapshot = service
        .apply(Command::AddGroup {
            profile,
            name: name.to_owned(),
            color: AccentColor::Blue,
        })
        .expect("add group");
    snapshot
        .workspace
        .groups()
        .iter()
        .find(|group| group.name == name)
        .expect("group")
        .id
}

fn add_group(service: &mut AppService<FakeSystem>, name: &str) -> GroupId {
    let profile = first_profile(service);
    add_group_in(service, profile, name)
}

fn add_tab(service: &mut AppService<FakeSystem>, place: Place, url: &str) -> TabId {
    service
        .apply(Command::AddTab {
            place,
            url: url.to_owned(),
            title: String::new(),
        })
        .expect("add tab");
    let found = service
        .document
        .workspace
        .groups()
        .iter()
        .find_map(|group| {
            group.children.iter().find_map(|node| match node {
                Node::Tab(tab) if tab.url.as_str() == url => Some(tab.id),
                Node::Folder(folder) => folder
                    .tabs
                    .iter()
                    .find(|tab| tab.url.as_str() == url)
                    .map(|tab| tab.id),
                Node::Tab(_) => None,
            })
        });
    found.expect("tab")
}

fn bind(
    service: &mut AppService<FakeSystem>,
    profile: ProfileId,
    browser: &str,
    browser_profile: Option<&str>,
    new_window: bool,
) {
    service
        .apply(Command::BindProfile {
            profile,
            browser: id(browser),
            browser_profile: browser_profile.map(str::to_owned),
            new_window,
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

#[test]
fn first_start_binds_the_only_profile_to_the_system_browser() {
    let fixture = Fixture::new();

    let service = fixture.start(FakeSystem::new(Some("com.google.chrome")));

    let profile = first_profile(&service);
    let view = view(&service, profile);
    assert_eq!(view.browser, Some(id("com.google.Chrome")));
    assert!(view.is_bound);
    assert_eq!(
        fixture
            .config()
            .profiles
            .get(&profile)
            .map(|b| b.browser.clone()),
        Some(id("com.google.Chrome"))
    );
    assert!(fixture.path().exists());
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
fn changes_are_saved_and_survive_a_restart() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));

    add_group(&mut service, "Work");
    drop(service);
    let restarted = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));

    assert_eq!(restarted.snapshot().workspace.groups()[0].name, "Work");
}

#[test]
fn invalid_url_is_rejected_and_nothing_changes() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let group = add_group(&mut service, "Work");
    let before = fs::read_to_string(fixture.path()).expect("file");

    let result = service.apply(Command::AddTab {
        place: Place::Group(group),
        url: "not a url".into(),
        title: String::new(),
    });

    assert_eq!(result.map(drop).map_err(|e| e.code()), Err("invalidUrl"));
    assert_eq!(fs::read_to_string(fixture.path()).expect("file"), before);
}

#[test]
fn groups_are_created_inside_an_existing_profile() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let work = add_profile(&mut service, "Trabajo");

    let group = add_group_in(&mut service, work, "Jira");
    let missing = service.apply(Command::AddGroup {
        profile: ProfileId::new(),
        name: "X".into(),
        color: AccentColor::Red,
    });

    assert_eq!(
        service
            .document
            .workspace
            .group(group)
            .expect("group")
            .profile,
        work
    );
    assert_eq!(missing.map(drop).map_err(|e| e.code()), Err("notFound"));
}

#[test]
fn binding_a_profile_is_saved_in_this_machines_config_only() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let work = add_profile(&mut service, "Trabajo");
    let data_before = fs::read_to_string(fixture.path()).expect("file");

    bind(
        &mut service,
        work,
        "com.google.Chrome",
        Some("Profile 1"),
        true,
    );

    assert_eq!(
        fs::read_to_string(fixture.path()).expect("file"),
        data_before
    );
    let binding = fixture
        .config()
        .profiles
        .get(&work)
        .cloned()
        .expect("binding");
    assert_eq!(binding.browser_profile.as_deref(), Some("Profile 1"));
    assert!(binding.new_window);
    assert_eq!(view(&service, work).browser, Some(id("com.google.Chrome")));
}

#[test]
fn binding_rejects_unknown_profiles_browsers_and_browser_profiles() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let profile = first_profile(&service);
    let attempt = |service: &mut AppService<FakeSystem>,
                   profile,
                   browser: &str,
                   browser_profile: Option<&str>| {
        service
            .apply(Command::BindProfile {
                profile,
                browser: id(browser),
                browser_profile: browser_profile.map(str::to_owned),
                new_window: false,
            })
            .map(drop)
            .map_err(|e| e.code())
    };

    assert_eq!(
        attempt(&mut service, profile, "com.brave.Browser", None),
        Err("unknownBrowser")
    );
    assert_eq!(
        attempt(
            &mut service,
            profile,
            "com.google.Chrome",
            Some("Profile 9")
        ),
        Err("unknownBrowser")
    );
    assert_eq!(
        attempt(&mut service, ProfileId::new(), "com.google.Chrome", None),
        Err("notFound")
    );
}

#[test]
fn tab_opens_with_its_profiles_browser_and_browser_profile() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let work = add_profile(&mut service, "Trabajo");
    bind(
        &mut service,
        work,
        "com.google.Chrome",
        Some("Profile 1"),
        true,
    );
    let group = add_group_in(&mut service, work, "Jira");
    let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");

    service.open_tab(tab).expect("open");

    assert_eq!(
        *service.system().opened.borrow(),
        ["com.google.Chrome https://a.dev/"]
    );
    assert_eq!(
        *service.system().options.borrow(),
        [LaunchOptions {
            browser_profile: Some("Profile 1".into()),
            new_window: false,
        }]
    );
}

#[test]
fn unbound_profile_opens_in_the_system_browser_and_says_so() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let qa = add_profile(&mut service, "QA");
    let group = add_group_in(&mut service, qa, "Staging");
    let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");

    service.open_tab(tab).expect("open");

    assert_eq!(
        *service.system().opened.borrow(),
        ["org.mozilla.firefox https://a.dev/"]
    );
    let view = view(&service, qa);
    assert!(!view.is_bound);
    assert_eq!(view.browser, Some(id("org.mozilla.firefox")));
}

#[test]
fn bound_browser_missing_here_falls_back_and_is_flagged() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let work = add_profile(&mut service, "Trabajo");
    bind(
        &mut service,
        work,
        "com.google.Chrome",
        Some("Profile 1"),
        false,
    );
    let group = add_group_in(&mut service, work, "Jira");
    let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");
    drop(service);

    let service =
        fixture.start(FakeSystem::new(Some("org.mozilla.firefox")).without("com.google.Chrome"));
    service.open_tab(tab).expect("open");

    assert_eq!(
        *service.system().opened.borrow(),
        ["org.mozilla.firefox https://a.dev/"]
    );
    assert_eq!(
        *service.system().options.borrow(),
        [LaunchOptions::default()]
    );
    let view = view(&service, work);
    assert!(view.is_bound && view.is_fallback);
}

#[test]
fn open_tab_focuses_an_existing_tab_on_macos() {
    let fixture = Fixture::new();
    let mut system = FakeSystem::new(Some("com.google.Chrome"));
    system.focus = Focus::Focused;
    let mut service = fixture.start_on(system, Platform::MacOs);
    let group = add_group(&mut service, "Work");
    let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");

    let opened = service.open_tab(tab).expect("open");

    assert_eq!(opened, Opened::FocusedExisting);
    assert!(service.system().opened.borrow().is_empty());
    assert!(service.snapshot().profiles[0].can_focus_tabs);
}

#[test]
fn open_group_opens_every_tab_and_only_the_first_asks_for_a_new_window() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    let profile = first_profile(&service);
    bind(&mut service, profile, "org.mozilla.firefox", None, true);
    let group = add_group(&mut service, "Work");
    add_tab(&mut service, Place::Group(group), "https://a.dev/");
    let snapshot = service
        .apply(Command::AddFolder {
            group,
            name: "Sprint".into(),
        })
        .expect("folder");
    let folder = match &snapshot.workspace.groups()[0].children[1] {
        Node::Folder(folder) => folder.id,
        Node::Tab(_) => panic!("expected folder"),
    };
    add_tab(&mut service, Place::Folder(folder), "https://b.dev/");
    add_tab(&mut service, Place::Folder(folder), "https://c.dev/");

    let all = service.open_group(group).expect("open group");

    assert_eq!(
        all,
        OpenSummary {
            opened: 3,
            focused: 0
        }
    );
    assert_eq!(
        *service.system().opened.borrow(),
        [
            "org.mozilla.firefox https://a.dev/",
            "org.mozilla.firefox https://b.dev/",
            "org.mozilla.firefox https://c.dev/",
        ]
    );
    let windows: Vec<_> = service
        .system()
        .options
        .borrow()
        .iter()
        .map(|o| o.new_window)
        .collect();
    assert_eq!(windows, [true, false, false]);
    assert_eq!(service.open_folder(folder).expect("folder").opened, 2);
}

#[test]
fn removing_a_profile_moves_its_groups_and_forgets_its_binding() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let first = first_profile(&service);
    let work = add_profile(&mut service, "Trabajo");
    bind(&mut service, work, "com.google.Chrome", None, false);
    let group = add_group_in(&mut service, work, "Jira");

    service
        .apply(Command::RemoveProfile {
            profile: work,
            move_groups_to: first,
        })
        .expect("remove");

    assert_eq!(
        service
            .document
            .workspace
            .group(group)
            .expect("group")
            .profile,
        first
    );
    assert!(!fixture.config().profiles.contains_key(&work));
}

#[test]
fn a_group_can_move_to_another_profile() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let work = add_profile(&mut service, "Trabajo");
    let group = add_group(&mut service, "Jira");

    service
        .apply(Command::SetGroupProfile {
            group,
            profile: work,
        })
        .expect("move");

    assert_eq!(
        service
            .document
            .workspace
            .group(group)
            .expect("group")
            .profile,
        work
    );
}

#[test]
fn a_version_1_file_becomes_profiles_bound_on_this_machine() {
    let fixture = Fixture::new();
    let v1 = r#"{"app":"tabstage-desktop","version":1,
        "settings":{"defaultBrowser":"org.mozilla.firefox"},
        "workspace":{"statuses":[],"groups":[
          {"id":"00000000-0000-0000-0000-000000000001","name":"Jira","color":"blue",
           "browser":{"kind":"specific","browser":"com.google.Chrome"},"children":[]},
          {"id":"00000000-0000-0000-0000-000000000002","name":"Lecturas","color":"mauve",
           "browser":{"kind":"default"},"children":[]}]}}"#;
    fs::write(fixture.path(), v1).expect("write");

    let service = fixture.start(FakeSystem::new(Some("com.apple.Safari")));

    let workspace = &service.document.workspace;
    let names: Vec<_> = workspace
        .profiles()
        .iter()
        .map(|p| p.name.as_str())
        .collect();
    assert_eq!(names, [DEFAULT_PROFILE_NAME, "Google Chrome"]);
    let config = fixture.config();
    let browser_of = |name: &str| {
        let profile = workspace
            .profiles()
            .iter()
            .find(|p| p.name == name)
            .expect("profile")
            .id;
        config
            .profiles
            .get(&profile)
            .map(|b| b.browser.as_str().to_owned())
    };
    assert_eq!(
        browser_of(DEFAULT_PROFILE_NAME).as_deref(),
        Some("org.mozilla.firefox")
    );
    assert_eq!(
        browser_of("Google Chrome").as_deref(),
        Some("com.google.Chrome")
    );
    assert!(
        fs::read_to_string(fixture.path())
            .expect("file")
            .contains("\"version\": 2")
    );
}

#[test]
fn change_from_another_device_is_a_conflict_until_reload_or_force() {
    let fixture = Fixture::new();
    let mut laptop = fixture.start(FakeSystem::new(Some("org.mozilla.firefox")));
    add_group(&mut laptop, "Mine");
    let mut other = Document::default();
    let profile = other.workspace.profiles()[0].id;
    other
        .workspace
        .add_group(profile, "Theirs", AccentColor::Green)
        .expect("group");
    fs::write(fixture.path(), tabstage_store::to_json(&other)).expect("external write");

    assert!(laptop.has_external_change().expect("check"));
    let conflict = laptop.apply(Command::AddProfile {
        name: "Otro".into(),
    });
    assert_eq!(conflict.map(drop).map_err(|e| e.code()), Err("conflict"));
    assert_eq!(laptop.snapshot().workspace.groups().len(), 1);

    let reloaded = laptop.reload().expect("reload");
    assert_eq!(reloaded.workspace.groups()[0].name, "Theirs");

    add_group(&mut laptop, "After reload");
    fs::write(fixture.path(), tabstage_store::to_json(&other)).expect("external write");
    let forced = laptop.force_save().expect("force");
    assert_eq!(forced.workspace.groups().len(), 2);
    assert!(!laptop.has_external_change().expect("check"));
}

#[test]
fn snapshot_lists_browser_profiles() {
    let fixture = Fixture::new();

    let snapshot = fixture.start(FakeSystem::new(None)).snapshot();

    let chrome: Vec<_> = snapshot.browser_profiles[&id("com.google.Chrome")]
        .iter()
        .map(|p| p.id.as_str())
        .collect();
    assert_eq!(chrome, ["Default", "Profile 1"]);
    assert!(
        !snapshot
            .browser_profiles
            .contains_key(&id("com.apple.Safari"))
    );
}

#[test]
fn commands_deserialize_from_ui_json() {
    let nil = "00000000-0000-0000-0000-000000000000";
    let add_tab = format!(
        r#"{{"type":"addTab","place":{{"group":"{nil}"}},"url":"https://a.dev","title":"A"}}"#
    );
    let bind = format!(
        r#"{{"type":"bindProfile","profile":"{nil}","browser":"com.google.Chrome","browserProfile":"Profile 1","newWindow":true}}"#
    );
    let remove = format!(r#"{{"type":"removeProfile","profile":"{nil}","moveGroupsTo":"{nil}"}}"#);

    assert!(matches!(
        serde_json::from_str::<Command>(&add_tab).expect("addTab"),
        Command::AddTab {
            place: Place::Group(_),
            ..
        }
    ));
    assert!(matches!(
        serde_json::from_str::<Command>(&bind).expect("bindProfile"),
        Command::BindProfile {
            new_window: true,
            ..
        }
    ));
    assert!(serde_json::from_str::<Command>(&remove).is_ok());
}

/// Contract with the UI: `ui/src/test/fixtures/snapshot.json` must be exactly
/// what Rust sends for its own workspace and profile bindings. The UI tests
/// use that file as mock data, so a change in the JSON shape fails here
/// instead of silently in the UI. Regenerate with
/// `UPDATE_UI_FIXTURE=1 cargo test -p tabstage-app ui_fixture`.
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
fn status_commands_edit_the_status_list() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    for label in ["In progress", "In review", "In dev", "Done"] {
        service
            .apply(Command::AddStatus {
                label: label.into(),
                color: AccentColor::Blue,
            })
            .expect("status");
    }
    let group = add_group(&mut service, "Work");
    let tab = add_tab(&mut service, Place::Group(group), "https://a.dev/");
    let in_dev = StatusId::parse("in-dev").expect("id");
    service
        .apply(Command::SetStatus {
            target: Target::Tab(tab),
            status: Some(in_dev.clone()),
        })
        .expect("status");

    service
        .apply(Command::AddStatus {
            label: "Blocked".into(),
            color: AccentColor::Red,
        })
        .expect("add");
    let snapshot = service
        .apply(Command::RemoveStatus {
            status: in_dev,
            replacement: StatusId::parse("blocked").ok(),
        })
        .expect("remove");

    let ids: Vec<_> = snapshot
        .workspace
        .statuses()
        .iter()
        .map(|s| s.id.as_str().to_owned())
        .collect();
    assert_eq!(ids, ["todo", "in-progress", "in-review", "done", "blocked"]);
    assert_eq!(
        snapshot
            .workspace
            .effective_status(tab)
            .expect("tab")
            .map(StatusId::as_str),
        Some("blocked")
    );
}

#[test]
fn new_workspaces_start_with_only_to_do() {
    let fixture = Fixture::new();

    let snapshot = fixture.start(FakeSystem::new(None)).snapshot();

    let labels: Vec<_> = snapshot
        .workspace
        .statuses()
        .iter()
        .map(|s| s.label.as_str())
        .collect();
    assert_eq!(labels, ["To do"]);
}

#[test]
fn profile_color_can_be_changed() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    let profile = first_profile(&service);

    let snapshot = service
        .apply(Command::SetProfileColor {
            profile,
            color: ProfileColor::new(12).expect("color"),
        })
        .expect("recolor");

    assert_eq!(snapshot.workspace.profiles()[0].color.index(), 12);
    let json = format!(r#"{{"type":"setProfileColor","profile":"{profile}","color":12}}"#);
    assert!(serde_json::from_str::<Command>(&json).is_ok());
}

#[test]
fn data_location_is_this_machine_until_the_file_moves() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    assert_eq!(
        service.snapshot().data_location.kind,
        DataLocationKind::AppData
    );

    let synced = tempfile::tempdir().expect("tempdir");
    let snapshot = service
        .relocate(config::data_file_in(synced.path()), Relocate::UseExisting)
        .expect("relocate");

    assert_eq!(snapshot.data_location.kind, DataLocationKind::Folder);
    assert_eq!(
        snapshot.data_location.folder,
        synced.path().display().to_string()
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
        kind("/Users/me/Library/CloudStorage/Dropbox/Tabstage/workspace.json"),
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
fn snapshot_reports_the_data_path() {
    let fixture = Fixture::new();

    let service = fixture.start(FakeSystem::new(None));

    assert_eq!(
        service.snapshot().data_path,
        fixture.path().display().to_string()
    );
}

#[test]
fn relocate_moves_my_data_and_remembers_the_place() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    add_group(&mut service, "Mine");
    let synced = tempfile::tempdir().expect("tempdir");
    let new_path = config::data_file_in(&synced.path().join("Tabstage"));

    let snapshot = service
        .relocate(new_path.clone(), Relocate::UseExisting)
        .expect("relocate");
    add_group(&mut service, "After move");

    assert_eq!(snapshot.data_path, new_path.display().to_string());
    assert_eq!(fixture.config().data_path, Some(new_path.clone()));
    let moved = inspect_data_file(&new_path).expect("inspect");
    assert_eq!((moved.exists, moved.groups), (true, 2));
    let old = inspect_data_file(&fixture.path()).expect("inspect");
    assert_eq!(old.groups, 1, "old file is left as it was");
}

#[test]
fn relocate_can_use_or_replace_the_data_already_there() {
    let fixture = Fixture::new();
    let mut service = fixture.start(FakeSystem::new(None));
    add_group(&mut service, "Mine");
    let synced = tempfile::tempdir().expect("tempdir");
    let new_path = config::data_file_in(synced.path());
    let mut theirs = Document::default();
    let profile = theirs.workspace.profiles()[0].id;
    theirs
        .workspace
        .add_group(profile, "Theirs", AccentColor::Green)
        .expect("group");
    fs::write(&new_path, tabstage_store::to_json(&theirs)).expect("write");

    let used = service
        .relocate(new_path.clone(), Relocate::UseExisting)
        .expect("relocate");
    let names: Vec<_> = used
        .workspace
        .groups()
        .iter()
        .map(|g| g.name.as_str())
        .collect();
    assert_eq!(names, ["Theirs"]);

    fs::write(&new_path, tabstage_store::to_json(&Document::default())).expect("write");
    service
        .relocate(new_path.clone(), Relocate::ReplaceWithMine)
        .expect("relocate");
    assert_eq!(inspect_data_file(&new_path).expect("inspect").groups, 1);
}

#[test]
fn inspect_counts_groups_and_tabs_or_reports_missing() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = config::data_file_in(dir.path());

    let missing = inspect_data_file(&path).expect("inspect");
    assert_eq!(
        (missing.exists, missing.groups, missing.tabs),
        (false, 0, 0)
    );

    let mut document = Document::default();
    let profile = document.workspace.profiles()[0].id;
    let group = document
        .workspace
        .add_group(profile, "G", AccentColor::Blue)
        .expect("group");
    let folder = document.workspace.add_folder(group, "F").expect("folder");
    for (place, url) in [
        (Place::Group(group), "https://a.dev/"),
        (Place::Folder(folder), "https://b.dev/"),
    ] {
        document
            .workspace
            .add_tab(place, TabUrl::parse(url).expect("url"), "")
            .expect("tab");
    }
    fs::write(&path, tabstage_store::to_json(&document)).expect("write");

    let found = inspect_data_file(&path).expect("inspect");
    assert_eq!((found.exists, found.groups, found.tabs), (true, 1, 2));
}

#[test]
fn error_payload_has_code_and_full_message() {
    let error = AppError::from(WorkspaceError::EmptyName);

    let payload = ErrorPayload::from(&error);

    assert_eq!(payload.code, "invalid");
    assert_eq!(payload.message, "name is empty");
}
