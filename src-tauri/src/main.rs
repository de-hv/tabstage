//! Tabstage Desktop binary. All setup lives in the library's `run`.

// Keep a console window from opening on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tabstage_desktop_lib::run();
}
