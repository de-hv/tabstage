# Tabstage Desktop

Groups of tabs, and folders of tabs, sorted into profiles that open in the browser (and browser
profile) you choose, for macOS and Linux.
It is the desktop version of the [Tabstage extension](https://github.com/de-hv/tabstage), for
machines where browser extensions are not allowed.

- **Profiles:** every group belongs to a profile such as *Work* or *Personal*. Each profile
  opens in a browser and, for Chromium and Firefox browsers, one of that browser's profiles, so
  links land where you are signed in. The sidebar groups the groups by profile; each profile
  folds away, has a **+** to create groups, folders and tabs inside it, and a **⋯** menu to
  rename, recolor, configure or delete it. Every profile has its own color dot: new profiles get
  one no other profile uses, from 20 evenly spaced hues.
- **No duplicate tabs:** clicking a tab focuses it when it is already open. This works on
  macOS for Safari and Chromium browsers (Chrome, Edge, Brave, Vivaldi, Arc) through
  AppleScript. Firefox and Linux browsers do not expose their tabs, so a new tab is opened.
- **Statuses and a board view:** a new workspace starts with only *To do*; add the statuses
  you need. They show as chips in the list or as tiles ("By status"), as in the extension.
- **Drag and drop:** move tabs, folders and groups, or drop on a tile to change the status.
  Every row menu also has "Move to…" for the keyboard.
- **Quick search:** <kbd>⌥ Option</kbd> <kbd>⇧ Shift</kbd> <kbd>K</kbd> from any app, or
  <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> in the window.
- **Tray menu:** open a whole group without showing the window. Closing the window keeps
  Tabstage in the tray.
- **One JSON file:** put it in iCloud Drive, Dropbox, Syncthing or a git repo to share your
  groups across machines. Writes are atomic, and a change made on another machine is never
  silently overwritten.

## Profiles

Profile names and their groups live in the synced data file. **Which browser a profile opens
in is chosen on each machine** and kept in that machine's `config.json`, because browsers and
their profile ids differ between machines and operating systems. A profile that is not set up on
a machine opens in the system browser, and the app says so until you pick one in Settings.

| Browser | Profiles read from | Opens with |
|---|---|---|
| Chrome, Edge, Brave, Vivaldi, Chromium | `Local State` | `--profile-directory=<folder>`, `--new-window` |
| Firefox, Zen, LibreWolf | `profiles.ini` | `-P <name>`, `-new-window` |
| Safari, Arc and others | not exposed to other apps | the browser's active profile |

Limits worth knowing:

- Chrome's AppleScript does not say which profile a window belongs to, so "go to the open tab"
  may focus the same URL in another profile's window.
- Chromium installed as a Flatpak or Snap keeps its profiles elsewhere and may show none.
- Firefox's newer profile manager does not use `profiles.ini`; such profiles may not be listed.
- On recent macOS versions the system may ask to let Tabstage read other apps' data the first
  time it lists a browser's profiles.

**Data format 2.** Version 0.2 adds profiles to the data file. Files from 0.1 are upgraded
automatically: groups that followed the default browser go to a *Default* profile, and
each browser a group used becomes a profile bound to that browser. Version 0.1 cannot read the
new format, so update every machine that shares the file.

## Install

```sh
curl -fsSL https://de-hv.github.io/tabstage-desktop/install.sh | sh
```

On Linux this installs the AppImage for your user; add `-s -- --system` to install the `.deb`
or `.rpm` with apt or dnf instead. On macOS you can also use Homebrew:

```sh
brew install --cask de-hv/tap/tabstage
```

Or download a file from the [latest release](https://github.com/de-hv/tabstage-desktop/releases/latest).
Every release has a `SHA256SUMS` file, and the install script checks it.

> The macOS app is not notarized yet. The install script and the Homebrew cask install it
> without the quarantine flag; if you download the `.dmg` yourself, right-click the app and
> choose Open the first time.

## Develop

Requirements: Rust 1.88 or later, Node 22, and on Linux
`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`.

```sh
npm install
npm run dev        # starts Vite and the Tauri window
npm test           # UI tests (Vitest)
cargo test --workspace
sh tests/install_test.sh
```

The project is built test first: every crate and component has its tests next to it, and CI
runs formatting, Clippy with warnings as errors, and all tests on macOS and Ubuntu.

### Layout

```
crates/core      domain model, no IO: profiles, groups, folders, tabs, statuses
crates/store     JSON data file: atomic writes, versioned format, conflict detection
crates/browsers  find installed browsers and their profiles, open URLs, focus open tabs
crates/app       application service the UI talks to; tested with a fake system
src-tauri        thin Tauri shell: IPC commands, tray, global shortcut
ui               React + TypeScript interface
site             GitHub Pages site and install.sh
```

`ui/src/test/fixtures/snapshot.json` is generated by Rust and used as mock data by the UI
tests, so the TypeScript types cannot drift from the Rust JSON. Regenerate it with
`UPDATE_UI_FIXTURE=1 cargo test -p tabstage-app ui_fixture`.

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org). release-please
keeps a release PR open on `main`; merging it tags the version, builds the macOS universal
`.dmg` and the Linux `.AppImage`, `.deb` and `.rpm` (x86_64 and arm64), publishes
`SHA256SUMS`, and updates the Homebrew cask in `de-hv/homebrew-tap` when the
`HOMEBREW_TAP_TOKEN` secret is set.

## License

[MIT](LICENSE)
