//! Imports a real data file from before tickets without touching it: point
//! `TABSTAGE_DATA_FILE` at a copy and run
//!
//! ```sh
//! TABSTAGE_DATA_FILE=/tmp/copy.json cargo test -p tabstage-store --test real_file -- --ignored --nocapture
//! ```

use std::collections::HashMap;
use std::fs;

use tabstage_core::Workspace;

#[test]
#[ignore = "reads the file named by TABSTAGE_DATA_FILE"]
fn imports_a_real_data_file() {
    let path = std::env::var("TABSTAGE_DATA_FILE").expect("set TABSTAGE_DATA_FILE");
    let text = fs::read_to_string(&path).expect("read data file");

    let tree = tabstage_store::read_legacy(&text).expect("read old file");
    let mut workspace = Workspace::new();
    let summary =
        tabstage_store::import_legacy(&mut workspace, &tree, &HashMap::new()).expect("import");

    let status = |id| {
        workspace
            .statuses()
            .iter()
            .find(|status| Some(status.id) == id)
            .map_or("No status", |status| status.name.as_str())
    };
    for profile in workspace.profiles() {
        println!("profile {}", profile.name);
        for ticket in &profile.tickets {
            println!(
                "  [{:<16}] {:<10} {}",
                status(ticket.status),
                ticket.key.as_deref().unwrap_or("-"),
                ticket.title
            );
            for child in &ticket.children {
                println!(
                    "      └ {:<10} {}",
                    child.key.as_deref().unwrap_or("-"),
                    child.title
                );
            }
        }
        for note in &profile.notes {
            println!("  note: {}", note.title);
        }
    }
    println!(
        "statuses={} tickets={} notes={} links={}",
        summary.statuses, summary.tickets, summary.notes, summary.links
    );
    workspace.validate().expect("valid");
}
