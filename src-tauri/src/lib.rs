//! Tauri shell for Tabstage Desktop.
//!
//! Thin on purpose: it builds the [`AppService`] with the real system
//! adapters and exposes it to the UI as IPC commands, plus the tray, the
//! global shortcut and close-to-tray. Behavior lives in `tabstage-app`.

mod commands;
mod tray;
mod window;

use std::sync::Mutex;

use tabstage_app::AppService;
use tabstage_app::config::{data_file_in, load_config};
use tabstage_browsers::Platform;
use tabstage_browsers::system::System;
use tabstage_store::FileStore;
use tauri::{Manager, WindowEvent};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};
use tracing_subscriber::EnvFilter;

/// The service shared by every command.
pub(crate) type Service = Mutex<AppService<System>>;

/// Opens the quick search from any app; the extension used the same keys.
const PALETTE_SHORTCUT: &str = "Alt+Shift+KeyK";

/// Starts the app.
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let result = tauri::Builder::default()
        // Must be first: a second launch focuses the running app instead.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            window::show_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _: &Shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        window::open_palette(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let config_path = app.path().app_config_dir()?.join("config.json");
            let config = load_config(&config_path);
            let data_path = match config.data_path {
                Some(path) => path,
                None => data_file_in(&app.path().app_data_dir()?),
            };
            tracing::info!(path = %data_path.display(), "loading workspace");
            let service = AppService::start(
                System,
                FileStore::new(data_path),
                config_path,
                Platform::current(),
            )?;
            tray::create(app.handle(), &service.snapshot())?;
            app.manage::<Service>(Mutex::new(service));

            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            if let Err(error) = app.global_shortcut().register(PALETTE_SHORTCUT) {
                // Another app may own the keys; the tray still offers search.
                tracing::warn!(
                    error = &error as &dyn std::error::Error,
                    "could not register the global shortcut"
                );
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps Tabstage in the tray.
            if let WindowEvent::CloseRequested { api, .. } = event
                && window.label() == window::MAIN
            {
                api.prevent_close();
                if let Err(error) = window.hide() {
                    tracing::warn!(
                        error = &error as &dyn std::error::Error,
                        "could not hide the window"
                    );
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::apply,
            commands::reload,
            commands::force_save,
            commands::has_external_change,
            commands::refresh_browsers,
            commands::open_tab,
            commands::open_folder,
            commands::open_group,
            commands::inspect_data_folder,
            commands::relocate,
            commands::reveal_data_file,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        tracing::error!(error = &error as &dyn std::error::Error, "tabstage stopped");
        std::process::exit(1);
    }
}
