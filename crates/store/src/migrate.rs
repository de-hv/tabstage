//! Upgrades data files from versions 1 to 3 to version 4, at the JSON level,
//! so the importer of files from before tickets reads one shape (see
//! `legacy.rs`).
//!
//! Version 1 stored a browser on each group (`{"kind":"default"}` or
//! `{"kind":"specific","browser":id}`) and a synced `settings.defaultBrowser`.
//! Version 2 replaces both with profiles: every group belongs to a profile,
//! and which browser a profile opens in is machine-local. The browsers found
//! in a v1 file are returned as [`MigratedBinding`]s so the app can store
//! them in this machine's config.
//!
//! Version 3 nests groups inside their profile (`profile.items`), so a
//! profile can also hold folders and tabs directly, and drops statuses.

use serde_json::{Map, Value, json};
use tabstage_core::{BrowserId, DEFAULT_PROFILE_NAME, ProfileColor, ProfileId};

/// A browser that a v1 file assigned, now bound to the profile that replaced it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigratedBinding {
    /// The profile created for it.
    pub profile: ProfileId,
    /// The browser the v1 file used.
    pub browser: BrowserId,
}

/// Gives every profile without a `color` one that the others do not use.
/// Early version 2 files (before profile colors) have none.
pub(crate) fn fill_profile_colors(file: &mut Value) {
    let Some(profiles) = file
        .pointer_mut("/workspace/profiles")
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    let mut used: Vec<ProfileColor> = profiles
        .iter()
        .filter_map(|profile| profile.get("color")?.as_u64())
        .filter_map(|index| u8::try_from(index).ok())
        .filter_map(|index| ProfileColor::new(index).ok())
        .collect();
    for profile in profiles.iter_mut().filter_map(Value::as_object_mut) {
        if !profile.contains_key("color") {
            let color = ProfileColor::next_after(used.iter().copied());
            used.push(color);
            profile.insert("color".to_owned(), json!(color.index()));
        }
    }
}

/// Turns a version 1 file into a version 2 file in place.
pub(crate) fn upgrade_v1(file: &mut Value) -> Vec<MigratedBinding> {
    let default_profile = ProfileId::new();
    let mut profiles = vec![json!({ "id": default_profile, "name": DEFAULT_PROFILE_NAME })];
    let mut bindings = Vec::new();

    let default_browser = file
        .pointer("/settings/defaultBrowser")
        .and_then(Value::as_str)
        .and_then(|id| BrowserId::parse(id).ok());
    if let Some(browser) = default_browser {
        bindings.push(MigratedBinding {
            profile: default_profile,
            browser,
        });
    }

    // One profile per browser a group asked for, in order of first use.
    let mut by_browser: Vec<(BrowserId, ProfileId)> = Vec::new();
    let groups = file
        .pointer_mut("/workspace/groups")
        .and_then(Value::as_array_mut);
    for group in groups.into_iter().flatten() {
        let Some(group) = group.as_object_mut() else {
            continue;
        };
        let specific = group
            .remove("browser")
            .filter(|choice| choice["kind"] == "specific")
            .and_then(|choice| choice["browser"].as_str().map(str::to_owned))
            .and_then(|id| BrowserId::parse(&id).ok());
        let profile = match specific {
            None => default_profile,
            Some(browser) => {
                if let Some((_, existing)) = by_browser.iter().find(|(id, _)| *id == browser) {
                    *existing
                } else {
                    let created = ProfileId::new();
                    profiles.push(json!({ "id": created, "name": browser.as_str() }));
                    bindings.push(MigratedBinding {
                        profile: created,
                        browser: browser.clone(),
                    });
                    by_browser.push((browser, created));
                    created
                }
            }
        };
        group.insert("profile".to_owned(), json!(profile));
    }

    if let Some(workspace) = file.get_mut("workspace").and_then(Value::as_object_mut) {
        workspace.insert("profiles".to_owned(), Value::Array(profiles));
    }
    if let Some(root) = file.as_object_mut() {
        root.insert("settings".to_owned(), Value::Object(Map::new()));
        root.insert("version".to_owned(), json!(2));
    }
    bindings
}

/// Turns a version 2 file into a version 3 file in place: each profile gets
/// its groups as `items`, and statuses are dropped.
pub(crate) fn upgrade_v2(file: &mut Value) {
    let Some(workspace) = file.get_mut("workspace").and_then(Value::as_object_mut) else {
        return;
    };
    workspace.remove("statuses");
    let groups = match workspace.remove("groups") {
        Some(Value::Array(groups)) => groups,
        _ => Vec::new(),
    };
    let mut profiles = match workspace.remove("profiles") {
        Some(Value::Array(profiles)) => profiles,
        _ => Vec::new(),
    };
    for profile in profiles.iter_mut().filter_map(Value::as_object_mut) {
        profile.insert("items".to_owned(), Value::Array(Vec::new()));
    }
    for mut group in groups {
        let Some(fields) = group.as_object_mut() else {
            continue;
        };
        let owner = fields.remove("profile");
        for child in fields
            .get_mut("children")
            .and_then(Value::as_array_mut)
            .into_iter()
            .flatten()
        {
            drop_status(child);
            for tab in child
                .get_mut("tabs")
                .and_then(Value::as_array_mut)
                .into_iter()
                .flatten()
            {
                drop_status(tab);
            }
        }
        fields.insert("type".to_owned(), json!("group"));
        // A group of an unknown profile goes to the first one.
        let index = profiles
            .iter()
            .position(|profile| Some(&profile["id"]) == owner.as_ref())
            .unwrap_or(0);
        if let Some(items) = profiles
            .get_mut(index)
            .and_then(|profile| profile.get_mut("items"))
            .and_then(Value::as_array_mut)
        {
            items.push(group);
        }
    }
    workspace.insert("profiles".to_owned(), Value::Array(profiles));
    if let Some(root) = file.as_object_mut() {
        root.insert("version".to_owned(), json!(3));
    }
}

fn drop_status(value: &mut Value) {
    if let Some(fields) = value.as_object_mut() {
        fields.remove("status");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROFILE_A: &str = "00000000-0000-0000-0000-0000000000a1";
    const PROFILE_B: &str = "00000000-0000-0000-0000-0000000000b1";

    fn v2() -> Value {
        json!({
            "app": "tabstage-desktop",
            "version": 2,
            "settings": {},
            "workspace": {
                "statuses": [{ "id": "todo", "label": "To do", "color": "lavender" }],
                "profiles": [
                    { "id": PROFILE_A, "name": "A", "color": 0 },
                    { "id": PROFILE_B, "name": "B", "color": 1 }
                ],
                "groups": [
                    { "id": GROUP_DEFAULT, "name": "In TEST", "color": "blue", "profile": PROFILE_B, "children": [
                        { "type": "tab", "id": "00000000-0000-0000-0000-00000000000a", "url": "https://a.dev/", "title": "a", "status": "todo" },
                        { "type": "folder", "id": "00000000-0000-0000-0000-0000000000f1", "name": "F", "status": "todo", "collapsed": false, "tabs": [
                            { "id": "00000000-0000-0000-0000-00000000000b", "url": "https://b.dev/", "title": "b", "status": "todo" }
                        ] }
                    ] },
                    { "id": GROUP_CHROME, "name": "Lost", "color": "red", "profile": "00000000-0000-0000-0000-0000000000ff", "children": [] },
                    { "id": GROUP_CHROME_TOO, "name": "Mine", "color": "red", "profile": PROFILE_A, "children": [] }
                ]
            }
        })
    }

    fn item_names(file: &Value, profile: usize) -> Vec<String> {
        file["workspace"]["profiles"][profile]["items"]
            .as_array()
            .expect("items")
            .iter()
            .map(|item| item["name"].as_str().expect("name").to_owned())
            .collect()
    }

    #[test]
    fn v2_groups_move_inside_their_profile_in_order() {
        let mut file = v2();

        upgrade_v2(&mut file);

        assert_eq!(item_names(&file, 0), ["Lost", "Mine"]);
        assert_eq!(item_names(&file, 1), ["In TEST"]);
        assert_eq!(file["version"], 3);
        assert!(file["workspace"].get("groups").is_none());
        let item = &file["workspace"]["profiles"][1]["items"][0];
        assert_eq!(item["type"], "group");
        assert!(item.get("profile").is_none());
    }

    #[test]
    fn v2_statuses_are_dropped_everywhere() {
        let mut file = v2();

        upgrade_v2(&mut file);

        assert!(file["workspace"].get("statuses").is_none());
        let text = file.to_string();
        assert!(!text.contains("\"status\""), "{text}");
    }

    const GROUP_DEFAULT: &str = "00000000-0000-0000-0000-000000000001";
    const GROUP_CHROME: &str = "00000000-0000-0000-0000-000000000002";
    const GROUP_CHROME_TOO: &str = "00000000-0000-0000-0000-000000000003";
    const GROUP_NO_FIELD: &str = "00000000-0000-0000-0000-000000000004";

    fn v1(default_browser: Option<&str>) -> Value {
        let settings =
            default_browser.map_or_else(|| json!({}), |id| json!({ "defaultBrowser": id }));
        json!({
            "app": "tabstage-desktop",
            "version": 1,
            "settings": settings,
            "workspace": {
                "statuses": [],
                "groups": [
                    { "id": GROUP_DEFAULT, "name": "A", "color": "blue", "browser": { "kind": "default" }, "children": [] },
                    { "id": GROUP_CHROME, "name": "B", "color": "blue", "browser": { "kind": "specific", "browser": "com.google.Chrome" }, "children": [] },
                    { "id": GROUP_CHROME_TOO, "name": "C", "color": "blue", "browser": { "kind": "specific", "browser": "com.google.Chrome" }, "children": [] },
                    { "id": GROUP_NO_FIELD, "name": "D", "color": "blue", "children": [] }
                ]
            }
        })
    }

    fn profile_of(file: &Value, group: &str) -> String {
        file["workspace"]["groups"]
            .as_array()
            .expect("groups")
            .iter()
            .find(|g| g["id"] == group)
            .expect("group")["profile"]
            .as_str()
            .expect("profile id")
            .to_owned()
    }

    #[test]
    fn creates_a_default_profile_and_one_per_assigned_browser() {
        let mut file = v1(Some("org.mozilla.firefox"));

        let bindings = upgrade_v1(&mut file);

        let names: Vec<_> = file["workspace"]["profiles"]
            .as_array()
            .expect("profiles")
            .iter()
            .map(|p| p["name"].as_str().expect("name").to_owned())
            .collect();
        assert_eq!(names, [DEFAULT_PROFILE_NAME, "com.google.Chrome"]);
        assert_eq!(file["version"], 2);
        let browsers: Vec<_> = bindings
            .iter()
            .map(|b| b.browser.as_str().to_owned())
            .collect();
        assert_eq!(browsers, ["org.mozilla.firefox", "com.google.Chrome"]);
    }

    #[test]
    fn groups_land_in_the_profile_of_their_old_browser() {
        let mut file = v1(Some("org.mozilla.firefox"));

        let bindings = upgrade_v1(&mut file);

        let default = bindings[0].profile.to_string();
        let chrome = bindings[1].profile.to_string();
        assert_eq!(profile_of(&file, GROUP_DEFAULT), default);
        assert_eq!(profile_of(&file, GROUP_NO_FIELD), default);
        assert_eq!(profile_of(&file, GROUP_CHROME), chrome);
        assert_eq!(profile_of(&file, GROUP_CHROME_TOO), chrome);
    }

    #[test]
    fn removes_the_browser_fields() {
        let mut file = v1(Some("org.mozilla.firefox"));

        upgrade_v1(&mut file);

        assert_eq!(file["settings"], json!({}));
        assert!(
            file["workspace"]["groups"]
                .as_array()
                .expect("groups")
                .iter()
                .all(|g| g.get("browser").is_none())
        );
    }

    #[test]
    fn profiles_without_a_color_get_distinct_ones() {
        let mut file = json!({ "workspace": { "profiles": [
            { "id": "a", "name": "A" },
            { "id": "b", "name": "B", "color": 0 },
            { "id": "c", "name": "C" }
        ] } });

        fill_profile_colors(&mut file);

        let colors: Vec<_> = file["workspace"]["profiles"]
            .as_array()
            .expect("profiles")
            .iter()
            .map(|p| p["color"].as_u64().expect("color"))
            .collect();
        assert_eq!(colors, [1, 0, 2]);
    }

    #[test]
    fn without_a_default_browser_the_default_profile_has_no_binding() {
        let mut file = v1(None);

        let bindings = upgrade_v1(&mut file);

        assert_eq!(bindings.len(), 1);
        assert_eq!(bindings[0].browser.as_str(), "com.google.Chrome");
        assert_eq!(
            file["workspace"]["profiles"]
                .as_array()
                .expect("profiles")
                .len(),
            2
        );
    }
}
