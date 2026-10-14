# Site audit harness (dev-only)

`audit.mjs` loads real sites in Chromium with the unpacked extension and takes
before/after screenshots, so site pack `fixes` in `src/shared/sitePacks.js` can be
backed by evidence.

This folder is **never shipped**: `package-extension.sh` zips only
`manifest.json`, `assets/` and `src/`, and the harness is not part of `npm test`.
The extension itself sends no data by default (anonymous usage statistics are opt-in); only this dev tool opens sites.

## Requirements

- Node 18+.
- Playwright (not a project dependency). The harness looks for it in
  `$G/@playwright/cli/node_modules/playwright`, then `$G/playwright`, then a plain
  `require("playwright")`.
- A Chromium / Chrome for Testing binary that can load unpacked extensions
  (branded Google Chrome cannot).

## Usage

```sh
G="$(npm root -g)" \
B="$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
SITES='[["bbc","https://www.bbc.com/"],["hn","https://news.ycombinator.com/"]]' \
ENGINES=auto WAIT=9000 OUT=/tmp/fdm-audit \
node tools/site-audit/audit.mjs
```

| Variable | Meaning | Default |
| --- | --- | --- |
| `EXT` | extension directory to load | this repository |
| `B` | Chromium executable | required |
| `G` | global `node_modules` containing Playwright | optional |
| `SITES` | JSON `[[name, url], ...]`; names are `[A-Za-z0-9_-]` | required |
| `ENGINES` | comma list of `auto`, `css`, `invert` | `auto` |
| `WAIT` | ms to wait after the `load` event before the screenshot | `2500` |
| `SCHEME` | emulated `prefers-color-scheme`, `light` or `dark` | `light` |
| `OUT` | output directory; must be outside the repository | `<tmpdir>/fdm-site-audit` |

For each site the harness writes the per-host config through the extension's
service worker (`chrome.storage.sync`), loads the page once with the extension
off (`<name>-off.png`) and once per engine (`<name>-<engine>.png`), and prints a
JSON array with `loadMs`, `longTaskMs`, `mode` (`"css"` when the CSS engine ran),
`invert`, the page `title` and any navigation `error`. Site packs apply on their
own because they match on the host. `OUT/profile` holds the throwaway Chromium
profile; delete `OUT` when done. Screenshots and profiles must never be committed.

Use `WAIT=9000` for pack audits so the engine's bounded late rescans (up to 6 s
after load) have run. A Bash tool call or CI step may have a time limit; audit a
few sites per run.

## Reading results and adding fixes

Compare `<name>-off.png` with `<name>-auto.png`. Add a pack fix only when the
"after" screenshot shows a defect the engine does not already handle, and leave a
one-line comment in `sitePacks.js` naming the defect and the screenshot file.
Find the real element with Playwright `page.evaluate` (for example a wordmark
drawn as a CSS `background-image` on a container) and keep selectors as specific
as possible; every fix must pass `ForceDarkThemes.validateFix`.

Expected and not a defect: third-party ad slots that stay white (they are
cross-origin iframes the engine deliberately leaves alone).

## Bot checks (Cloudflare and similar)

Some sites answer automated browsers with a bot-check or "access denied" page
(seen with Daily Mail, NDTV, Reuters, The New York Times, The Hill). When a
screenshot or `title` shows such a page, record the site as **blocked** and keep
its pack at `fixes: []`. The harness does not retry, change its user agent, solve
challenges or otherwise try to get around bot checks, and it must not be changed
to do so. Fixes for those sites need screenshots supplied by a real user.
