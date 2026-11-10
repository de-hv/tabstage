//! Upgrades a real data file without touching it: point
//! `TABSTAGE_DATA_FILE` at a copy and run
//!
//! ```sh
//! TABSTAGE_DATA_FILE=/tmp/copy.json cargo test -p tabstage-store --test real_file -- --ignored --nocapture
//! ```

use std::fs;

#[test]
#[ignore = "reads the file named by TABSTAGE_DATA_FILE"]
fn upgrades_a_real_data_file() {
    let path = std::env::var("TABSTAGE_DATA_FILE").expect("set TABSTAGE_DATA_FILE");
    let text = fs::read_to_string(&path).expect("read data file");

    let document = tabstage_store::from_json(&text).expect("parse and upgrade");

    for profile in document.workspace.profiles() {
        println!("profile {:<20} items={}", profile.name, profile.items.len());
    }
    println!("tabs={}", document.workspace.tabs().len());
    for binding in &document.migrated {
        let name = document
            .workspace
            .profile(binding.profile)
            .map_or("?", |profile| profile.name.as_str());
        println!("binding {name:<20} -> {}", binding.browser);
    }
    let again = tabstage_store::from_json(&tabstage_store::to_json(&document)).expect("reparse");
    assert_eq!(
        again.workspace, document.workspace,
        "output reads back the same"
    );
}
