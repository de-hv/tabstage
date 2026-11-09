//! Native tray (menu bar) icon. Its content comes from
//! `tabstage_app::tray`, where it is tested.

use tabstage_app::Snapshot;
use tabstage_app::tray::{TrayAction, TrayEntry, tray_entries};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use crate::Service;
use crate::window::{open_palette, show_main};

const TRAY_ID: &str = "tabstage";

/// Creates the tray icon with a menu for `snapshot`.
pub fn create(app: &AppHandle, snapshot: &Snapshot) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Tabstage")
        .menu(&build_menu(app, snapshot)?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle(app, event.id().as_ref()));
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Rebuilds the menu after groups change.
pub fn refresh(app: &AppHandle, snapshot: &Snapshot) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let updated = build_menu(app, snapshot).and_then(|menu| tray.set_menu(Some(menu)));
    if let Err(error) = updated {
        tracing::warn!(
            error = &error as &dyn std::error::Error,
            "could not update the tray menu"
        );
    }
}

fn build_menu(app: &AppHandle, snapshot: &Snapshot) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    for entry in tray_entries(snapshot) {
        let label = match &entry {
            TrayEntry::Separator => {
                menu.append(&PredefinedMenuItem::separator(app)?)?;
                continue;
            }
            TrayEntry::Search => "Buscar tabs…",
            TrayEntry::Group { label, .. } => label.as_str(),
            TrayEntry::Show => "Mostrar Tabstage",
            TrayEntry::Quit => "Salir",
        };
        if let Some(id) = entry.menu_id() {
            menu.append(&MenuItem::with_id(app, id, label, true, None::<&str>)?)?;
        }
    }
    Ok(menu)
}

fn handle(app: &AppHandle, menu_id: &str) {
    match TrayAction::parse(menu_id) {
        Some(TrayAction::Search) => open_palette(app),
        Some(TrayAction::Show) => show_main(app),
        Some(TrayAction::Quit) => app.exit(0),
        Some(TrayAction::OpenGroup(group)) => {
            // Opening may run AppleScript; keep it off the main thread.
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let service = app.state::<Service>();
                let Ok(service) = service.lock() else {
                    return;
                };
                if let Err(error) = service.open_group(group) {
                    tracing::warn!(
                        error = &error as &dyn std::error::Error,
                        "could not open group from the tray"
                    );
                }
            });
        }
        None => tracing::warn!(menu_id, "unknown tray menu item"),
    }
}
