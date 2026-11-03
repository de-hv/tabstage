# Tabstage

Jira-like statuses for native tab groups, in Chrome and other Chromium browsers, Firefox and Zen.

Use one tab group per ticket and give each group a status. The status lives in the group
title (`CAR-6124 · STG`) and in the group's native color, so it survives restarts and needs
no account or server.

- **Side panel:** your groups in lanes by status, with a filter and a status chip per group.
- **Command palette:** change a group's status or jump to a group or tab from the keyboard.
- **Options page:** add, rename, recolor, reorder and delete statuses.

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

To update: `git pull && npm install && npm run build`, then click the reload (↻) button on the
Tabstage card.

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

Firefox 140 or later is required. Zen exposes Firefox's tab groups API, so Tabstage works
there too.

For development only, you can load `.output/firefox-mv3` without signing via
`about:debugging` → **This Firefox** → **Load Temporary Add-on…**; it is removed on restart.

## Use

### Shortcuts

| Action | Shortcut |
| --- | --- |
| Open the command palette | `Alt+Shift+K` (macOS: `Cmd+Shift+K`) |
| Open the side panel | `Alt+Shift+L` |

Change them in `chrome://extensions/shortcuts` (Chromium) or in `about:addons` → gear menu →
**Manage Extension Shortcuts** (Firefox, Zen). The toolbar button also opens the palette.

### Command palette

Type in the palette; matching ignores case and extra spaces. Use `↑` / `↓` to move, `Enter`
to run the selected result and `Esc` to close.

| You type | Result |
| --- | --- |
| nothing | every group, then "Open side panel" |
| any text, e.g. `CAR-6124`, `6124`, `login` | groups by ticket key, ticket number or name, and tabs by title or URL; picking one focuses it |
| `<key or number> <status>`, e.g. `6115 dev`, `CAR-6115 stg` | sets that group's status. The status can be a prefix (`6115 d` offers Dev and Done) |
| `<key or number> none` or `<key or number> no status` | clears that group's status |
| `<status>`, e.g. `review` | lists the groups in that status (statuses that only start with the text rank lower) |
| `none` or `no status` | lists the groups with no status |
| `panel`, `side panel`, `sidebar`, `open panel` | opens the side panel |

A status matches by its label or its id (`in progress` or `in-progress`). A group can also be
named by a word of its name instead of its key.

### Side panel

Groups appear in one lane per status, in the order of your statuses, plus a **No status** lane
for groups whose title has no known status. Click a group's status chip to change it, and use
the filter to find a ticket, name or tab.

### Statuses and the options page

Default statuses: To do, In progress, Review, Dev, Test, STG, PROD, Done. Edit them on the
options page (right-click the toolbar button → **Options**, or the extension's details page):

- **Add**, **rename** and **recolor** a status. Renaming updates the titles of the groups in
  that status, and recoloring updates their color.
- **Reorder** with the up / down buttons; the side panel lanes follow.
- **Delete** a status. If groups use it, the page asks first, and those groups move to
  "No status".
- **Restore defaults** replaces your list with the defaults.

The list is synced across your browsers through the browser's sync storage. The group title is
the source of truth: typing ` · Dev` at the end of a group name by hand also sets the status,
and the extension never fights a color you set by hand.

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

Not done yet; the extension is private and installed locally. When it is published:

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
