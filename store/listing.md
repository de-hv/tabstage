# Store listing texts

Copy these into the Chrome Web Store and Firefox Add-ons (AMO) forms.

## Name

Tabstage

## Short description (Chrome summary, max 132 characters / AMO summary, max 250)

Sort the tabs you choose into statuses and groups in a tiled side panel. Your native tab groups stay untouched.

## Detailed description

Tabstage gives your work tabs a status. Add the tabs you care about, put them in statuses like To do, In progress or In review, and see everything in a tiled side panel.

- Add a tab from the right-click menu on any page, or pick open tabs from the panel.
- Create, rename, recolor, reorder and delete statuses. Deleting a status asks where to move its tabs.
- Put tabs in groups inside a status, like one group per ticket or task.
- Closed tabs stay as links. Click to reopen them, or remove them.
- Search everything from the command palette (Alt+Shift+K).
- Tabstage never changes your browser's native tab groups.
- Your data stays in your browser. Tabstage has no servers and collects nothing.

## Category

- Chrome: Productivity → Workflow & planning
- AMO: Tabs

## Single purpose (Chrome, Privacy tab)

Tabstage lets users sort the tabs they choose into user-defined statuses and groups, shown in a side panel.

## Permission justifications (Chrome, Privacy tab)

- tabs: Reads the title, URL and icon of open tabs so the user can add them to Tabstage, and reopen or switch to them from the panel.
- storage: Saves the user's statuses and the tabs they added, locally in the browser.
- contextMenus: Adds "Tabstage → Add to…" to the page's right-click menu so the user can add the current tab to a status or group.
- sidePanel: Shows the Tabstage board in the browser's side panel.
- tabGroups (optional): Requested only when the user clicks "Remove Tabstage suffix" in the options, to clean up titles written by version 0.1. Not used otherwise.
- Remote code: No. All code is in the package.

## Data usage (Chrome, Privacy tab)

Don't check any data type: Tabstage doesn't collect or transmit user data off the device. Check the three certifications (no selling, no unrelated use, no creditworthiness use).

## Privacy policy URL

https://github.com/de-hv/tabstage/blob/main/store/PRIVACY.md

## Homepage and support URLs

- Homepage: https://github.com/de-hv/tabstage
- Support: https://github.com/de-hv/tabstage/issues

## Images

- Icon 128×128: `.output/chrome-mv3/icons/128.png`
- Screenshots: 1–5 images, 1280×800 or 640×400 (Chrome); any size for AMO. Suggested: panel with statuses and a group, right-click menu, command palette, options page.
- Chrome small promo tile 440×280: optional.

## Firefox source code (AMO)

The package is bundled, so upload `.output/tabstage-<version>-sources.zip`. Build instructions for reviewers:

```
Node 22 or later, npm 10 or later.
npm ci
npm run zip:firefox
The built add-on is .output/tabstage-<version>-firefox.zip (the same as .output/firefox-mv3).
```
