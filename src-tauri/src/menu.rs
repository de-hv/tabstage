//! The macOS menu bar: Tauri's default menu with a fuller "About Tabstage"
//! panel and Help links. Linux gets no menu bar, as before.

use tauri::menu::{AboutMetadata, HELP_SUBMENU_ID, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

const WEBSITE: &str = "https://de-hv.github.io/tabstage/";
const REPOSITORY: &str = "https://github.com/de-hv/tabstage";

const WEBSITE_ID: &str = "help-website";
const RELEASE_NOTES_ID: &str = "help-release-notes";
const REPORT_ISSUE_ID: &str = "help-report-issue";

/// The native About panel shows no links on macOS, so the credits say what
/// the app is and what it is built with, and the links live in Help.
const CREDITS: &str = "Tickets, statuses and notes that open in the browser you choose.\n\n\
Built with Tauri, React, Radix UI, Lucide and IBM Plex.";

/// Tauri's default menu, with the About item and the Help menu filled in.
pub(crate) fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let info = app.package_info();

    // The first submenu is the app menu; its first item is "About Tabstage".
    if let Some(app_menu) = menu
        .items()?
        .first()
        .and_then(|item| item.as_submenu().cloned())
    {
        let about = PredefinedMenuItem::about(
            app,
            None,
            Some(AboutMetadata {
                name: Some(info.name.clone()),
                version: Some(info.version.to_string()),
                copyright: app.config().bundle.copyright.clone(),
                credits: Some(CREDITS.into()),
                // Without it, a run outside the .app bundle (`tauri dev`)
                // shows a generic folder icon.
                icon: app.default_window_icon().cloned(),
                ..Default::default()
            }),
        )?;
        app_menu.remove_at(0)?;
        app_menu.insert(&about, 0)?;
    }

    if let Some(help) = menu
        .get(HELP_SUBMENU_ID)
        .and_then(|item| item.as_submenu().cloned())
    {
        help.append_items(&[
            &MenuItem::with_id(app, WEBSITE_ID, "Tabstage Website", true, None::<&str>)?,
            &MenuItem::with_id(app, RELEASE_NOTES_ID, "Release Notes", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, REPORT_ISSUE_ID, "Report an Issue…", true, None::<&str>)?,
        ])?;
    }
    Ok(menu)
}

/// Opens the page a Help item points to.
pub(crate) fn handle<R: Runtime>(app: &AppHandle<R>, event: &MenuEvent) {
    let version = app.package_info().version.to_string();
    let url = match event.id().as_ref() {
        WEBSITE_ID => WEBSITE.to_owned(),
        RELEASE_NOTES_ID => format!("{REPOSITORY}/releases/tag/v{version}"),
        REPORT_ISSUE_ID => format!("{REPOSITORY}/issues/new"),
        _ => return,
    };
    if let Err(error) = app.opener().open_url(url, None::<&str>) {
        tracing::warn!(
            error = &error as &dyn std::error::Error,
            "could not open the page"
        );
    }
}
