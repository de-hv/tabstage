//! IPC commands. Each one locks the service, delegates and turns errors
//! into an [`ErrorPayload`] the UI can switch on.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::MutexGuard;

use tabstage_app::config::data_file_in;
use tabstage_app::{
    AppError, AppService, Command, DataFileInfo, ErrorPayload, ImportPreview, OpenSummary,
    Relocate, Snapshot, inspect_data_file,
};
use tabstage_browsers::Opened;
use tabstage_browsers::system::System;
use tabstage_core::{ProfileId, TicketId};
use tabstage_store::Role;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::Service;

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

/// Turns a service result into a reply for the UI.
fn changed(result: tabstage_app::Result<Snapshot>) -> Reply<Snapshot> {
    result.map_err(|e| payload(&e))
}

/// Current state.
#[tauri::command]
pub fn snapshot(service: State<'_, Service>) -> Reply<Snapshot> {
    Ok(lock(&service)?.snapshot())
}

/// Applies a change and saves it.
#[tauri::command]
pub fn apply(service: State<'_, Service>, command: Command) -> Reply<Snapshot> {
    let result = lock(&service)?.apply(command);
    changed(result)
}

/// Re-reads the data file after a change from another device.
#[tauri::command]
pub fn reload(service: State<'_, Service>) -> Reply<Snapshot> {
    let result = lock(&service)?.reload();
    changed(result)
}

/// Overwrites the data file with this window's state.
#[tauri::command]
pub fn force_save(service: State<'_, Service>) -> Reply<Snapshot> {
    let result = lock(&service)?.force_save();
    changed(result)
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

/// Opens a ticket's own address.
#[tauri::command(async)]
pub fn open_ticket(service: State<'_, Service>, ticket: TicketId) -> Reply<Opened> {
    lock(&service)?.open_ticket(ticket).map_err(|e| payload(&e))
}

/// Opens a ticket's address and its sub-tickets' addresses.
#[tauri::command(async)]
pub fn open_ticket_all(service: State<'_, Service>, ticket: TicketId) -> Reply<OpenSummary> {
    lock(&service)?
        .open_ticket_all(ticket)
        .map_err(|e| payload(&e))
}

/// Opens an address, such as a link in a note, in a profile's browser.
#[tauri::command(async)]
pub fn open_url(service: State<'_, Service>, profile: ProfileId, url: String) -> Reply<Opened> {
    lock(&service)?
        .open_url(profile, &url)
        .map_err(|e| payload(&e))
}

/// What importing a file from before tickets would give: the one set aside
/// at startup when `path` is `None`.
#[tauri::command]
pub fn preview_import(
    service: State<'_, Service>,
    path: Option<String>,
    roles: HashMap<String, Role>,
) -> Reply<ImportPreview> {
    lock(&service)?
        .preview_import(path.map(PathBuf::from), &roles)
        .map_err(|e| payload(&e))
}

/// Imports a file from before tickets into the workspace.
#[tauri::command]
pub fn import_legacy(
    service: State<'_, Service>,
    path: Option<String>,
    roles: HashMap<String, Role>,
) -> Reply<Snapshot> {
    let result = lock(&service)?.import(path.map(PathBuf::from), &roles);
    changed(result)
}

/// Stops offering to import the file set aside at startup.
#[tauri::command]
pub fn dismiss_import(service: State<'_, Service>) -> Reply<Snapshot> {
    let result = lock(&service)?.dismiss_import();
    changed(result)
}

/// First run: keeps the data file in `folder`, or in the default location
/// when it is `None`.
#[tauri::command]
pub fn choose_data_file(service: State<'_, Service>, folder: Option<String>) -> Reply<Snapshot> {
    let path = folder.map(|folder| data_file_in(Path::new(&folder)));
    let result = lock(&service)?.choose_data_file(path);
    changed(result)
}

/// What a folder the user picked already holds.
#[tauri::command]
pub fn inspect_data_folder(folder: String) -> Reply<DataFileInfo> {
    inspect_data_file(&data_file_in(Path::new(&folder))).map_err(|e| payload(&e))
}

/// Moves the data file into `folder`; the service remembers it for next launch.
#[tauri::command]
pub fn relocate(service: State<'_, Service>, folder: String, mode: Relocate) -> Reply<Snapshot> {
    let path = data_file_in(Path::new(&folder));
    let result = lock(&service)?.relocate(path, mode);
    changed(result)
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
