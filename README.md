# tabstage
Browser extension: Jira-like statuses for tab groups (Chrome, Firefox, Zen)

## Development

Requires Node 22 or later (`nvm use` reads `.nvmrc`).

```sh
npm install              # install dependencies (also runs `wxt prepare`)
npm run dev              # Chrome with live reload
npm run dev:firefox      # Firefox with live reload
npm run build            # production build → .output/chrome-mv3
npm run build:firefox    # production build → .output/firefox-mv3
npm run test             # unit tests (Vitest)
npm run lint             # ESLint
npm run compile          # type check
```
