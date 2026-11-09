//! IPC commands. Each one locks the service, delegates and turns errors
//! into an [`ErrorPayload`] the UI can switch on. Commands that change
//! groups also refresh the tray menu.

use std::path::Path;
use std::sync::MutexGuard;

use tabstage_app::config::data_file_in;
use tabstage_app::{
    AppError, AppService, Command, DataFileInfo, ErrorPayload, OpenSummary, Relocate, Snapshot,
    inspect_data_file,
};
use tabstage_browsers::Opened;
use tabstage_browsers::system::System;
use tabstage_core::{FolderId, GroupId, TabId};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::{Service, tray};

type Reply<T> = Result<T, ErrorPayload>;

fn lock<'a>(service: &'a State<'_, Service>) -> Reply<MutexGuard<'a, AppService<System>>> {
    service.lock().map_err(|_| ErrorPayload {
        code: "internal",
        message: "the app state is unavailable after an earlier crash, restart Tabstage".into(),
    })
}

fn payload(error: &AppError) -> ErrorPayload {
    let payload = ErrorPayload::from(error);
    tracing::warn!(code = payload.code, message = %payload.message, "command failed");
    payload
}

/// Refreshes the tray after a change and passes the snapshot through.
fn changed(app: &AppHandle, result: tabstage_app::Result<Snapshot>) -> Reply<Snapshot> {
    let snapshot = result.map_err(|e| payload(&e))?;
    tray::refresh(app, &snapshot);
    Ok(snapshot)
}

/// Current state.
#[tauri::command]
pub fn snapshot(service: State<'_, Service>) -> Reply<Snapshot> {
    Ok(lock(&service)?.snapshot())
}

/// Applies a change and saves it.
#[tauri::command]
pub fn apply(app: AppHandle, service: State<'_, Service>, command: Command) -> Reply<Snapshot> {
    let result = lock(&service)?.apply(command);
    changed(&app, result)
}

/// Re-reads the data file after a change from another device.
#[tauri::command]
pub fn reload(app: AppHandle, service: State<'_, Service>) -> Reply<Snapshot> {
    let result = lock(&service)?.reload();
    changed(&app, result)
}

/// Overwrites the data file with this window's state.
#[tauri::command]
pub fn force_save(app: AppHandle, service: State<'_, Service>) -> Reply<Snapshot> {
    let result = lock(&service)?.force_save();
    changed(&app, result)
}

/// Whether the data file changed on disk.
#[tauri::command]
pub fn has_external_change(service: State<'_, Service>) -> Reply<bool> {
    lock(&service)?
        .has_external_change()
        .map_err(|e| payload(&e))
}

/// Lists installed browsers again.
#[tauri::command(async)]
pub fn refresh_browsers(service: State<'_, Service>) -> Reply<Snapshot> {
    lock(&service)?.refresh_browsers().map_err(|e| payload(&e))
}

/// Opens or focuses one tab. Runs off the main thread: AppleScript calls
/// can take a moment.
#[tauri::command(async)]
pub fn open_tab(service: State<'_, Service>, tab: TabId) -> Reply<Opened> {
    lock(&service)?.open_tab(tab).map_err(|e| payload(&e))
}

/// Opens every tab of a folder.
#[tauri::command(async)]
pub fn open_folder(service: State<'_, Service>, folder: FolderId) -> Reply<OpenSummary> {
    lock(&service)?.open_folder(folder).map_err(|e| payload(&e))
}

/// Opens every tab of a group.
#[tauri::command(async)]
pub fn open_group(service: State<'_, Service>, group: GroupId) -> Reply<OpenSummary> {
    lock(&service)?.open_group(group).map_err(|e| payload(&e))
}

/// What a folder the user picked already holds.
#[tauri::command]
pub fn inspect_data_folder(folder: String) -> Reply<DataFileInfo> {
    inspect_data_file(&data_file_in(Path::new(&folder))).map_err(|e| payload(&e))
}

/// Moves the data file into `folder`; the service remembers it for next launch.
#[tauri::command]
pub fn relocate(
    app: AppHandle,
    service: State<'_, Service>,
    folder: String,
    mode: Relocate,
) -> Reply<Snapshot> {
    let path = data_file_in(Path::new(&folder));
    let result = lock(&service)?.relocate(path, mode);
    changed(&app, result)
}

/// Shows the data file in Finder (or the file manager on Linux).
#[tauri::command]
pub fn reveal_data_file(app: AppHandle, service: State<'_, Service>) -> Reply<()> {
    let path = lock(&service)?.data_path().to_path_buf();
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|error| ErrorPayload {
            code: "io",
            message: format!("could not show {}: {error}", path.display()),
        })
}
