//! Main window helpers shared by the Dock, the global shortcut and the
//! single-instance handler.

use tauri::{AppHandle, Emitter, Manager};

/// Label of the main window in tauri.conf.json.
pub const MAIN: &str = "main";

/// Event the UI listens to for opening the quick search.
pub const OPEN_PALETTE: &str = "open-palette";

/// Brings the main window to the front, restoring it if hidden.
pub fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        tracing::warn!("main window is missing");
        return;
    };
    let shown = window
        .show()
        .and_then(|()| window.unminimize())
        .and_then(|()| window.set_focus());
    if let Err(error) = shown {
        tracing::warn!(
            error = &error as &dyn std::error::Error,
            "could not show the main window"
        );
    }
}

/// Shows the main window with the quick search open.
pub fn open_palette(app: &AppHandle) {
    show_main(app);
    if let Err(error) = app.emit_to(MAIN, OPEN_PALETTE, ()) {
        tracing::warn!(
            error = &error as &dyn std::error::Error,
            "could not open the quick search"
        );
    }
}
