# Tabstage

Editable statuses for the tabs you choose, in a tiled side panel, for Chrome and other
Chromium browsers, Firefox and Zen.

Add the tabs you are working on, put each one (or a group of them) in a status, and move them
around as your work moves. Everything lives in the extension's own storage: no account, no
server, and your native tab groups are never touched.

- **Side panel:** one tile per status (design "Tiling", Catppuccin Mocha / Latte, IBM Plex
  Sans bundled with the extension) with the tabs you added, loose or in groups.
- **Command palette:** inside the panel; search, move a tab or group to a status, or add the
  current tab, from the keyboard.
- **Options page:** edit statuses, back up the board to JSON, and an opt-in cleanup of the
  v0.1 title suffixes.

The extension is installed locally only. It is not published in any store yet (see
[Future steps: store publishing](#future-steps-store-publishing)).

## Install

Requires [Node.js](https://nodejs.org) 22.9 or later (`nvm use` reads `.nvmrc`) and git.

```sh
git clone git@github.com:de-hv/tabstage.git
cd tabstage
npm install
npm run build:all        # → .output/chrome-mv3 and .output/firefox-mv3
```

### Chromium: Chrome, Edge, Brave, Arc

1. Open the extensions page: `chrome://extensions` (Edge: `edge://extensions`,
   Brave: `brave://extensions`; Arc uses `chrome://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick the `.output/chrome-mv3` folder.

To update (or reinstall after a new version): `git pull && npm install && npm run build`, then
click the reload (↻) button on the Tabstage card. Your board and statuses are kept.

### Firefox and Zen

Firefox only keeps unsigned extensions until it restarts, so Tabstage is installed as a
**signed, unlisted** `.xpi`. Unlisted means Mozilla signs the file but doesn't publish it on
addons.mozilla.org (AMO).

1. Get your AMO API keys (once):
   1. Sign in at [addons.mozilla.org](https://addons.mozilla.org) with a Firefox account.
   2. Open [Developer Hub → Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/)
      and accept the developer agreement if asked.
   3. Click **Generate new credentials**. You get a **JWT issuer** (the key) and a
      **JWT secret** (shown once).
2. Save the keys in a `.env` file at the repo root (it is git-ignored, never commit it):
   ```sh
   cp .env.example .env
   # then fill in:
   # WEB_EXT_API_KEY=<JWT issuer>
   # WEB_EXT_API_SECRET=<JWT secret>
   ```
   You can also export both variables in your shell instead.
3. Sign:
   ```sh
   npm run sign:firefox
   ```
   This builds `.output/firefox-mv3`, uploads it to AMO with
   `web-ext sign --channel unlisted` and writes the signed `.xpi` to `.output/signed/`.
   Automatic review usually takes a few minutes.
4. Install the `.xpi`: drag it onto a Firefox or Zen window, or open `about:addons` →
   gear menu → **Install Add-on From File…**.

To update: `git pull && npm install`, bump `version` in `package.json` (AMO never signs the
same version twice), run `npm run sign:firefox` again and install the new `.xpi`.

After updating from 0.1 to 0.2: the version is already bumped to `0.2.0`, so run
`npm run sign:firefox` once and install the new `.xpi` over the old one. Your v0.1 statuses
are migrated (the untouched v0.1 defaults become the new defaults).

Firefox 140 or later is required. Zen is Firefox-based and works the same way.

For development only, you can load `.output/firefox-mv3` without signing via
`about:debugging` → **This Firefox** → **Load Temporary Add-on…**; it is removed on restart.

## Use

### The model

- **Statuses** belong to Tabstage: To do, In progress, In review, In dev and Done by default,
  all editable. There is no fixed flow: any tab or group can go to any status.
- **Tabs** show in the panel only after you add them. Nothing is added or grouped
  automatically, and tabs you didn't add are not shown.
- **Groups** are optional folders inside a status, with any name (a ticket like `CAR-6115`,
  or "Research"). A tab in a group follows the group's status.
- **Closed tabs stay as links:** dimmed, marked "closed". Click one to reopen it. Remove it
  with ✕, **Remove from Tabstage**, or **Clear closed links** on its group.
- **Restarts:** tab ids change when the browser restarts, so Tabstage relinks open tabs to
  your items by URL at startup and when a tab is created.
- **Native tab groups are never touched**: Tabstage doesn't read or change their titles,
  colors or members, and doesn't ask for the tab groups permission (except for the opt-in
  cleanup below).

### Adding tabs

- Right-click a page → **Tabstage → Add to ▸** a status or a group. In Firefox and Zen the
  same menu is also on the tab strip (right-click a tab).
- In the panel, press **+**, tick the open tabs of this window and pick a status or a group.
- In the palette, type `add` or `add <status>` to add the current tab.

### Opening the panel

| Action | How |
| --- | --- |
| Open and close the panel | Click the Tabstage toolbar icon |
| Open the panel (Chrome) / toggle the sidebar (Firefox, Zen) | `Alt+Shift+L` |
| Open the panel with the palette focused | `Alt+Shift+K` (macOS: `Cmd+Shift+K`) |

Change the shortcuts in `chrome://extensions/shortcuts` (Chromium) or in `about:addons` →
gear menu → **Manage Extension Shortcuts** (Firefox, Zen).

**Panel on the right:** no extension API can choose the side; each browser keeps it in its
own settings.

- **Chrome:** Settings → Appearance → **Side panel** → *Show on right side*.
- **Other Chromium browsers (Edge, Brave):** look for a *side panel position* option in their
  Appearance settings. Arc shows extension panels in its own sidebar.
- **Firefox:** View → Sidebar → **Move Sidebar to Right** (with the new sidebar, its
  *Customize sidebar* settings have the position).
- **Zen:** the extension sidebar follows Firefox's sidebar position; set it as in Firefox.

### Panel actions

- **Right-click a tab** (or press the Menu key / `Shift+F10` on it): New group with tab, Add
  to group ▸, Move to status ▸, Take out of group, Reopen / Go to tab, Remove from Tabstage.
- **Right-click a group header:** Rename, Move to status ▸, Open all, Clear closed links,
  Ungroup, Remove group. Click the header to collapse or expand it.
- **Status tile:** double-click its name to rename it. The **⋯** button has Rename, Color ▸,
  Move up, Move down, Add status after and Delete status. Deleting a status that has tabs
  asks whether to move them (with their groups) to another status or remove them.
- The menus work with the keyboard: `↑` / `↓`, `Enter`, `→` opens a submenu, `←` / `Esc`
  goes back.

### Command palette

Open it with `Alt+Shift+K` or the ⌕ button. Matching ignores case and extra spaces. Use `↑` /
`↓` to move, `Enter` to run and `Esc` to close.

| You type | Result |
| --- | --- |
| nothing | every group, then every tab |
| any text, e.g. `CAR-6124`, `6124`, `login` | groups by name and tabs by title or URL; a tab is focused (a closed one reopens), a group is shown in the panel |
| `<tab or group> <status>`, e.g. `6115 done`, `login in review` | moves it to that status. The status can be a prefix (`6115 in` offers In progress, In review and In dev) |
| `<status>`, e.g. `in review` | lists the groups and tabs in that status |
| `add`, `add <status>` | adds the current tab (to the first status, or to that one) |

A status matches by its label or its id (`in progress` or `in-progress`); a ticket number
(`6115`) matches names that contain `CAR-6115`.

### Options page

Right-click the toolbar icon → **Options** (or the extension's details page):

- **Statuses:** add, rename, recolor (10 Catppuccin accents), reorder, delete (asks where the
  tabs go) and restore defaults (tabs of removed statuses move to To do). Statuses sync across
  your browsers through the browser's sync storage; the board stays local to each browser.
- **Backup:** **Export board** downloads `tabstage-backup.json` with your statuses and board;
  **Import board…** replaces both after checking the whole file. Imported tabs come back as
  closed links and relink to open tabs with the same URL.
- **Clean up v1 titles:** Tabstage 0.1 wrote ` · <status>` at the end of native group titles.
  **Remove Tabstage suffix from native group titles** strips it once. It asks for the tab
  groups permission only when you press it, and never changes colors or grouping.

## Development

```sh
npm run dev              # Chrome with live reload
npm run dev:firefox      # Firefox with live reload
npm run build            # production build → .output/chrome-mv3
npm run build:firefox    # production build → .output/firefox-mv3
npm run build:all        # both builds
npm run zip              # store-ready zip of the Chrome build → .output/
npm run zip:firefox      # store-ready zip (and sources zip) of the Firefox build → .output/
npm run sign:firefox     # signed unlisted .xpi → .output/signed/ (needs AMO keys)
npm run test             # unit tests (Vitest)
npm run lint             # ESLint
npm run compile          # type check
```

The icons are generated from `assets/icon.svg` by `@wxt-dev/auto-icons` on every build
(greyscale in dev mode).

## Future steps: store publishing

In progress. Listing texts, permission justifications and the privacy policy are in
[`store/listing.md`](store/listing.md) and [`store/PRIVACY.md`](store/PRIVACY.md).

- **Chrome Web Store:** register a developer account (USD 5 one-time fee), run `npm run zip`
  and upload `.output/tabstage-<version>-chrome.zip` in the developer dashboard with the store
  listing, screenshots and privacy answers (Tabstage collects no data).
- **Microsoft Edge Add-ons:** register in Partner Center (free) and upload the same Chrome zip.
  Brave and Arc install from the Chrome Web Store.
- **Firefox AMO (listed):** run `npm run zip:firefox` and submit the zip, plus the sources zip
  that `wxt zip` writes for Firefox, on the [Developer Hub](https://addons.mozilla.org/developers/).
  Zen installs from AMO too. Listed versions get a public page and auto-updates.
- **Automation:** `npx wxt submit init` stores each store's credentials in `.env.submit`
  (git-ignored by the `.env.*` rule), then `npx wxt submit --chrome-zip … --firefox-zip …
  --firefox-sources-zip … --edge-zip …` uploads all of them in one go. A CI job can run
  `wxt zip` and `wxt submit` on each release tag.
