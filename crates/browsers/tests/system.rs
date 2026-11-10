//! Checks against the real machine. They depend on what is installed, so
//! they are ignored by default. Run them with:
//!
//! ```sh
//! cargo test -p tabstage-browsers --test system -- --ignored --nocapture
//! ```

use tabstage_browsers::system::System;
use tabstage_browsers::{Catalog, find_installed};

#[test]
#[ignore = "depends on the browsers installed on this machine"]
fn lists_installed_browsers_and_the_default() {
    let system = System;

    let installed = system.installed().expect("list browsers");
    let default = system.system_default().expect("read default");

    for browser in &installed {
        println!("{:<28} {:<40} {:?}", browser.name, browser.id, browser.kind);
    }
    println!("default: {default:?}");
    assert!(!installed.is_empty(), "no browser found");
    // macOS keeps pointing at a default browser after it is uninstalled; the
    // app then uses the first installed browser, so this is only reported.
    if let Some(default) = default
        && find_installed(&installed, &default).is_none()
    {
        println!("note: system default {default} is not installed");
    }
}
