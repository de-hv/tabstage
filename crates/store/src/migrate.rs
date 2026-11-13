//! Upgrades data files at the JSON level.
//!
//! Files from versions 1 to 3 become version 4, so the importer of files
//! from before tickets reads one shape (see `legacy.rs`). Version 5 files
//! become version 6 when they are opened (see [`upgrade_v5`]).
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

/// Turns a version 5 file into a version 6 file in place. Version 6 has no
/// links: each link becomes a Markdown line at the end of its ticket's note
/// or its note's body, so nothing is lost, and pinned links are unpinned.
pub(crate) fn upgrade_v5(file: &mut Value) {
    if let Some(profiles) = file
        .pointer_mut("/workspace/profiles")
        .and_then(Value::as_array_mut)
    {
        for profile in profiles.iter_mut() {
            if let Some(tickets) = profile.get_mut("tickets").and_then(Value::as_array_mut) {
                for ticket in tickets.iter_mut() {
                    fold_links(ticket, "note");
                    if let Some(children) = ticket.get_mut("children").and_then(Value::as_array_mut)
                    {
                        children.iter_mut().for_each(|child| fold_links(child, "note"));
                    }
                }
            }
            if let Some(notes) = profile.get_mut("notes").and_then(Value::as_array_mut) {
                notes.iter_mut().for_each(|note| fold_links(note, "body"));
            }
        }
    }
    if let Some(pinned) = file
        .pointer_mut("/workspace/pinned")
        .and_then(Value::as_array_mut)
    {
        pinned.retain(|target| target.get("link").is_none());
    }
}

/// Moves an item's `links` into its Markdown `field` as list lines.
fn fold_links(item: &mut Value, field: &str) {
    let Some(object) = item.as_object_mut() else {
        return;
    };
    let Some(Value::Array(links)) = object.remove("links") else {
        return;
    };
    let mut text = object
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_owned);
    for link in &links {
        let Some(url) = link.get("url").and_then(Value::as_str) else {
            continue;
        };
        let title = link.get("title").and_then(Value::as_str).unwrap_or(url);
        text = Some(append_line(text.as_deref(), &link_line(title, url)));
    }
    if let Some(text) = text {
        object.insert(field.to_owned(), Value::String(text));
    }
}

/// A Markdown list item that links `title` to `url`.
pub(crate) fn link_line(title: &str, url: &str) -> String {
    let title = title.trim();
    let title = if title.is_empty() { url } else { title };
    let title = title.replace('[', "\\[").replace(']', "\\]");
    format!("- [{title}](<{url}>)")
}

/// Adds a Markdown line at the end of `text`: right under a list item, so
/// links form one list, or after a blank line otherwise.
pub(crate) fn append_line(text: Option<&str>, line: &str) -> String {
    match text.map(str::trim_end) {
        None | Some("") => line.to_owned(),
        Some(text) if text.lines().last().is_some_and(|last| last.starts_with("- ")) => {
            format!("{text}\n{line}")
        }
        Some(text) => format!("{text}\n\n{line}"),
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

#[cfg(test)]
mod v5_tests {
    use super::*;

    #[test]
    fn version_5_links_become_markdown_in_the_note() {
        let mut file = json!({
            "workspace": {
                "profiles": [{
                    "tickets": [{
                        "note": "Steps",
                        "links": [
                            { "url": "https://a.dev/1", "title": "PR [draft]" },
                            { "url": "https://a.dev/2", "title": " " }
                        ],
                        "children": [{ "links": [{ "url": "https://b.dev/", "title": "Doc" }] }]
                    }],
                    "notes": [{ "links": [{ "url": "https://c.dev/", "title": "Board" }] }]
                }],
                "pinned": [{ "ticket": "t" }, { "link": "l" }]
            }
        });

        upgrade_v5(&mut file);

        let profile = &file["workspace"]["profiles"][0];
        assert_eq!(
            profile["tickets"][0]["note"],
            "Steps\n\n- [PR \\[draft\\]](<https://a.dev/1>)\n- [https://a.dev/2](<https://a.dev/2>)"
        );
        assert!(profile["tickets"][0].get("links").is_none());
        assert_eq!(
            profile["tickets"][0]["children"][0]["note"],
            "- [Doc](<https://b.dev/>)"
        );
        assert_eq!(profile["notes"][0]["body"], "- [Board](<https://c.dev/>)");
        assert_eq!(file["workspace"]["pinned"], json!([{ "ticket": "t" }]));
    }
}
