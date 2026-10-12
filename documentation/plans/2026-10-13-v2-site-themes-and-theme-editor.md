# Force Dark Mode 2.0.0 — Site Themes, Theme Editor, Custom CSS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship built-in themes, per-site "site packs", a local theme editor and sanitised per-site custom CSS, as release 2.0.0 — free, with no server, accounts or network calls.

**Architecture:** One shared UMD library (`ForceDarkThemes`, attached to `globalThis` like the existing `ForceDarkColorUtils`) holds theme schema/validation, palette derivation, contrast checks, built-in themes, site packs and the CSS sanitiser. The content script, popup and options page all consume it; `storage.js` (ES module) persists user themes and per-site CSS in `chrome.storage.sync`. The CSS engine gains a palette parameter, an image-dim variable and pack "fixes".

**Tech Stack:** Chrome MV3, vanilla JS (classic content scripts + ES modules), zero dependencies, Node `assert` tests in `tests/*.mjs` chained in `npm test`.

**Spec:** `documentation/specs/2026-10-13-site-themes-and-theme-editor-design.md`

## Global Constraints

- Version **2.0.0** everywhere `VERSIONING.md` §6 lists (manifest, package.json, storage.js export `version`, options footer, README badge, SECURITY.md table `2.0.x`/`< 2.0.0`, CHROMEWEBSTORE.md row, CHANGELOG `## [2.0.0]`, docs/index.html `softwareVersion`, `tests/privacy_security_test.mjs` assertion).
- **No new permissions, host permissions or network calls.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval`, `new Function`, `.innerHTML`, `insertAdjacentHTML`, `outerHTML` and no `http(s)://` literals in any new extension JS file; each new JS file is added to the file list in `tests/privacy_security_test.mjs`.
- Zero dependencies. Tests are plain Node `assert` files, each chained in `package.json` `test` and given a `test:<name>` script.
- `chrome.storage.sync` limits: 8,192 bytes per item, 102,400 total, 512 items.
- Limits (constants in `ForceDarkThemes.LIMITS`): `MAX_USER_THEMES 20`, `MAX_NAME 40`, `MAX_IMAGE_DIM 60`, `MAX_IMPORT_BYTES 16384`, `MAX_CSS_CHARS 6000`, `MAX_CSS_SITES 30`.
- Theme text fields are written to the DOM with `textContent` only.
- Existing per-site configs (`{enabled, engine, backgroundColor, brightness, contrast, sepia}`) must behave exactly as before when no `themeId` is present.
- Contrast rule: text/background and link/background ≥ 4.5:1 saves cleanly; < 4.5 warns; < 3 blocks saving. All built-ins must pass ≥ 4.5 for text, muted and link on both background and surface.
- Never weaken a test or constant to make something pass. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never stage `.DS_Store`, `.claude/`, `.playwright-mcp/`, `.superpowers/` or the user's unrelated uncommitted `CHROMEWEBSTORE.md` edit.
- Content scripts are **classic scripts** (no `import`); the popup is a classic script; options is an ES module; the service worker is an ES module. Shared code that content/popup/options all need therefore lives in UMD files.

## Review Focus

1. **Hostile imports** (theme JSON / settings JSON): `__proto__`/`constructor` keys, wrong types, 1 MB payloads, 500 themes, hex colours like `#12345g`, names with markup. Expect: rejected or sanitised, nothing partially stored, no crash. (Task 3)
2. **Look-alike hosts for site packs:** `evilbbc.com`, `bbc.com.evil.io`, `notbbc.co.uk`, uppercase `WWW.BBC.COM`, trailing dot. Expect: only exact host or a true dot-suffix matches. (Task 6)
3. **CSS sanitiser bypasses:** `URL(`, `u\72l(`, `ur/**/l(`, `@IMPORT`, `image-set(`, `-webkit-image-set(`, `expression(`, `</style><script>`, 7,000 characters. Expect: rejected with a plain message. (Task 9)
4. **Deleted or corrupt theme in use:** a site's `themeId` points at a theme the user deleted, or `__customThemes` is not an array. Expect: fall back to the site pack / default colour, no exception, dark mode still applies. (Tasks 3, 4)
5. **Sync quota exhaustion:** saving a theme or CSS when storage is full. Expect: a visible plain-language error and no data loss of what was already saved. (Tasks 3, 8, 10)

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/themeCore.js` (create) | UMD. Theme schema/validation, `derivePalette`, `paletteFromTheme`, `contrastIssues`, `resolveTheme`, `LIMITS`. |
| `src/shared/builtinThemes.js` (create) | UMD. The 8 built-in themes. |
| `src/shared/sitePacks.js` (create) | UMD. Pack data, `findSitePack`, `validateFix`. |
| `src/shared/customCss.js` (create) | UMD. `validateCss`. |
| `src/shared/constants.js` (modify) | `THEME_ID_PATTERN`. |
| `src/shared/storage.js` (modify) | `themeId` in config, user themes + per-site CSS CRUD, export/import/clear. |
| `src/background/serviceWorker.js` (modify) | Persist `themeId` from TOGGLE. |
| `src/content/index.js`, `src/content/themeEngine/cssOverrideEngine.js` (modify) | Resolve theme, apply palette/image dim/pack fixes/custom CSS. |
| `manifest.json` (modify) | Add the four UMD files to the content-script list, before the engines. |
| `src/popup/*` (modify) | Theme dropdown, "Site CSS" link. |
| `src/options/*` (modify) | Theme editor with live preview; custom CSS manager. |
| `tests/helpers/loadUmd.mjs` (create) | Load UMD files into a `vm` sandbox. |
| `tools/site-audit/` (create) | Dev-only Playwright harness for verifying packs (never packaged). |
| Tests | `theme_core_test.mjs`, `builtin_themes_test.mjs`, `storage_themes_test.mjs`, `site_packs_test.mjs`, `custom_css_test.mjs`, `theme_ui_test.mjs`, plus additions to `dom_engine_test.mjs` and `privacy_security_test.mjs`. |

---

### Task 1: Theme core library and UMD test loader

**Files:**
- Create: `src/shared/themeCore.js`, `tests/helpers/loadUmd.mjs`, `tests/theme_core_test.mjs`
- Modify: `package.json` (`test` chain, `test:themecore`)

**Interfaces:**
- Produces `tests/helpers/loadUmd.mjs`: `loadUmd(relPaths: string[]): object` — runs the given repo-relative files in order inside one fresh `vm` context (a plain object as global; `window` undefined) and returns that context object, so tests read `ctx.ForceDarkThemes`. `colorUtils.js` is always run first.
- Produces on `ForceDarkThemes`:
  - `LIMITS` (values in Global Constraints)
  - `validateTheme(input: unknown): {ok:true, theme: Theme} | {ok:false, error: string}` — allow-list `id` (`/^user:[a-z0-9-]{1,40}$/` or `builtin:[a-z0-9-]{1,40}`), `name` (trimmed, 1–`MAX_NAME` chars, no `<` or `>`), `colors` (`background` required; `surface,text,muted,link,border` optional; each `/^#[0-9a-f]{6}$/i`, stored lowercase), `imageDim` (integer 0–`MAX_IMAGE_DIM`, default 0). Unknown keys dropped. Rejects non-objects, arrays, and any own key `__proto__`/`constructor`/`prototype` at any level.
  - `derivePalette(background: string): Palette` where `Palette = {bg, surface, surfaceSoft, elevated, text, muted, border, link, input, selection}` — **the same maths as `applyCustomPalette` in `cssOverrideEngine.js` today** (copy it; Task 4 makes the engine call this).
  - `paletteFromTheme(theme: Theme): Palette` — starts from `derivePalette(theme.colors.background)` then overrides `surface,text,muted,link,border` where the theme supplies them.
  - `contrastIssues(theme: Theme): {level: "ok"|"warn"|"block", messages: string[]}` — checks text/background and link/background (using the derived value when a colour is omitted).

**Tests (`tests/theme_core_test.mjs`)** — names and key assertions:
- `validateTheme accepts a minimal theme` — `{id:"user:a", name:"A", colors:{background:"#101010"}}` → ok, `imageDim 0`, background lowercased.
- `validateTheme drops unknown keys and rejects markup in names` — `name:"<b>x</b>"` → `{ok:false}`.
- `validateTheme rejects hostile input` — `JSON.parse('{"__proto__":{"x":1},"id":"user:a","name":"A","colors":{"background":"#000000"}}')`, arrays, `null`, `"str"`, bad hex `#12345g`, `imageDim:99`, name of 41 chars → each `{ok:false}`; `Object.prototype.x` stays undefined.
- `derivePalette("#0f1115")` equals the palette the engine produces today (assert `bg === "#0f1115"`, `text === "#e8eaed"`, `link === "#8ab4f8"`; light base `#ffffff` gives text `#14171c`).
- `paletteFromTheme overrides only supplied colours`.
- `contrastIssues` — `text:"#e8eaed"` on `#0f1115` → `ok`; `text:"#3a3a3a"` on `#000000` → `block`; a 3.5:1 pair → `warn`.

- [ ] **Step 1:** Write `loadUmd.mjs` and `theme_core_test.mjs` (tests above); run `node tests/theme_core_test.mjs`; expect failure (module missing).
- [ ] **Step 2:** Implement `themeCore.js` as a UMD that does `global.ForceDarkThemes = Object.assign(global.ForceDarkThemes || {}, {...})`; reads `global.ForceDarkColorUtils` for luminance/contrast/mix helpers.
- [ ] **Step 3:** Run the test; expect all pass. Chain it in `package.json`; run `npm test`.
- [ ] **Step 4:** Commit `feat(themes): theme schema, palette derivation and contrast checks`.

---

### Task 2: Built-in themes

**Files:** Create `src/shared/builtinThemes.js`, `tests/builtin_themes_test.mjs`; modify `package.json`.

**Interfaces:**
- Consumes: `validateTheme`, `contrastIssues`, `derivePalette` (Task 1).
- Produces: `ForceDarkThemes.getBuiltinThemes(): Theme[]` (stable order) and `getBuiltinTheme(id: string): Theme | null`. IDs and exact colours (all pre-checked ≥ 4.5:1):

| id | name | background | surface | text | muted | link | border |
|---|---|---|---|---|---|---|---|
| builtin:midnight | Midnight | #0f1115 | #171a20 | #e8eaed | #b8bec7 | #8ab4f8 | #343b46 |
| builtin:oled | OLED Black | #000000 | #0b0b0b | #f2f2f2 | #b5b5b5 | #7ab7ff | #2a2a2a |
| builtin:dracula | Dracula | #282a36 | #343746 | #f8f8f2 | #bfc3d9 | #8be9fd | #44475a |
| builtin:nord | Nord | #2e3440 | #3b4252 | #eceff4 | #c0c8d8 | #88c0d0 | #4c566a |
| builtin:solarized | Solarized Dark | #002b36 | #073642 | #eee8d5 | #a3b1b1 | #4fa8e8 | #2a5560 |
| builtin:contrast | High Contrast | #000000 | #101010 | #ffffff | #e0e0e0 | #7fd4ff | #8a8a8a |
| builtin:dim | Dim | #22252b | #2b2f36 | #dcdfe4 | #b0b6c0 | #8fb8f0 | #444b57 |
| builtin:sepia | Sepia Dark | #1f1a14 | #2a231b | #ead9bf | #c2ae92 | #e0a85c | #4a3d2c |

`imageDim` is 0 for all except `builtin:dim` (15).

**Tests:** `every built-in passes validateTheme`; `every built-in has contrastIssues level ok`; `text, muted and link each ≥ 4.5:1 on background and on surface` (compute with `ForceDarkColorUtils.getContrastRatio`); `ids are unique and match the table`; `getBuiltinTheme("builtin:nope")` is `null`; returned themes are frozen copies (mutating one does not change the next call).

- [ ] **Step 1:** Write the test; run; expect failure.
- [ ] **Step 2:** Implement `builtinThemes.js` (UMD, same pattern).
- [ ] **Step 3:** Run; expect pass; chain in `npm test`.
- [ ] **Step 4:** Commit `feat(themes): eight built-in themes`.

---

### Task 3: Storage layer, config `themeId`, service worker

**Files:** Modify `src/shared/constants.js`, `src/shared/storage.js`, `src/background/serviceWorker.js`; create `tests/storage_themes_test.mjs`; modify `package.json`.

**Interfaces:**
- Consumes: `ForceDarkThemes.validateTheme`, `LIMITS` — `storage.js` is an ES module, so add imports of the UMD files for their side effects (`import "./colorUtils.js"; import "./themeCore.js";`, in that order) and read `globalThis.ForceDarkThemes`. `customCss.js` does not exist yet: `setCustomCss` must call `ForceDarkThemes.validateCss` through optional chaining and return `{ok:false, error:"Custom CSS is not available yet."}` while it is undefined; Task 9 adds `import "./customCss.js";` to `storage.js` and a test for the real behaviour.
- Produces in `constants.js`: `export const THEME_ID_PATTERN = /^(builtin|user):[a-z0-9-]{1,40}$/;`
- Produces in `storage.js`:
  - `setSiteConfig` / `importSettingsJson` accept an optional `themeId: string` that must be `""`, `"default"` or match `THEME_ID_PATTERN`; anything else is stored as `""`. `getSiteConfig` returns it unchanged.
  - `getCustomThemes(): Promise<Theme[]>` — reads `__customThemes`; non-array or invalid entries are dropped silently (returns `[]`).
  - `saveCustomTheme(theme: unknown): Promise<{ok:true, theme: Theme} | {ok:false, error: string}>` — validates, enforces `MAX_USER_THEMES` and unique ids, writes the whole array, and returns `{ok:false}` with a plain message if `chrome.runtime.lastError` is set (quota).
  - `deleteCustomTheme(id: string): Promise<void>`.
  - `getCustomCss(host: string): Promise<string>` / `setCustomCss(host: string, css: string): Promise<{ok:boolean, error?:string}>` — key `__css:<host>`, `isSafeKey(host)` required, validates with `ForceDarkThemes.validateCss`, enforces `MAX_CSS_SITES`, empty string deletes the key.
  - `exportSettingsJson()` payload gains `themes: Theme[]` and `customCss: {[host]: string}`, `version: "2.0.0"`. `importSettingsJson` additionally accepts those two fields (validated with the same functions, `MAX_IMPORT_BYTES` not applied to settings imports but applied to single-theme import in Task 8) and must **not** treat `__customThemes` / `__css:*` keys as site configs.
  - `clearAllConfigs` already clears everything; add a test that themes and CSS are gone afterwards.
- Service worker: `handleToggleMessage` reads `msg.themeId`; if it is `""`, `"default"` or matches `THEME_ID_PATTERN` it is saved, otherwise the existing `currentConfig.themeId` is kept.

**Tests (`tests/storage_themes_test.mjs`)** — uses its own in-memory `chrome.storage.sync` mock that supports `get(null|string|string[]|object)`, `set`, `remove`, `clear`, and a `lastError` toggle:
- `themeId round-trips and invalid values become ""` (`"user:ok-1"` kept; `"../x"`, `"builtin:"`, `42` → `""`).
- `existing configs without themeId are unchanged`.
- `saveCustomTheme enforces the 20-theme cap and unique ids`.
- `saveCustomTheme surfaces quota errors without losing earlier themes` (mock `lastError` set during `set`; earlier themes still readable).
- `getCustomThemes returns [] for corrupt storage` (string, object, array of garbage).
- `import rejects hostile payloads` — `__proto__`, 500 themes (only first 20 kept, rest dropped, no throw), non-object `themes`; `Object.prototype` untouched.
- `export then import round-trips themes, css and configs`, and `__customThemes`/`__css:*` never appear as site configs in `getAllConfigs`-based counting (`!k.startsWith("__")`).
- `clearAllConfigs removes themes and custom CSS`.
- `setCustomCss rejects unsafe host keys and over-limit sites` (use a stub `ForceDarkThemes.validateCss` that accepts everything, installed in the test before calling).

- [ ] **Step 1:** Write the tests; run; expect failures.
- [ ] **Step 2:** Implement constants + storage functions + service-worker change.
- [ ] **Step 3:** Run `node tests/storage_themes_test.mjs` and `npm test`; expect pass (existing privacy test export assertion changes to `"2.0.0"` in Task 12, not here — keep `1.8.0` until then and make `exportSettingsJson` read `version` from one `const EXTENSION_VERSION` that Task 12 bumps).
- [ ] **Step 4:** Commit `feat(storage): per-site themeId, custom themes and per-site CSS storage`.

---

### Task 4: Engine and content-script integration of themes

**Files:** Modify `src/content/index.js`, `src/content/themeEngine/cssOverrideEngine.js`, `manifest.json`, `tests/dom_engine_test.mjs`.

**Interfaces:**
- Consumes: `ForceDarkThemes.resolveTheme`, `paletteFromTheme`, `derivePalette`, `getBuiltinThemes`.
- Produces `ForceDarkThemes.resolveTheme(args: {config: SiteConfig|null, host: string, userThemes: Theme[]}): {theme: Theme|null, source: "user"|"builtin"|"pack"|"default", pack: Pack|null}` (add to `themeCore.js`; `findSitePack` is provided by Task 6 — until then treat as always `null` via `ForceDarkThemes.findSitePack?.(host) ?? null`). Order: `config.themeId` valid and found → that theme; `"default"` → `{theme:null, source:"default"}`; `""`/absent → pack's theme if a pack exists and its `themeId` resolves, else `{theme:null,"default"}`; a `themeId` that does not resolve (deleted theme) falls through to the pack/default branch.
- `manifest.json` content-script `js` order: `colorUtils.js`, `themeCore.js`, `builtinThemes.js`, `sitePacks.js` (create a placeholder in Task 6 — until then omit it), `engines…`, `index.js`.
- `enableDarkMode(config)` honours `config.palette` (a `Palette`) when present, otherwise derives from `config.backgroundColor` exactly as today (call `ForceDarkThemes.derivePalette`; remove the duplicated maths). `config.imageDim` (0–60) sets `--force-dark-image-brightness: (100 - n)%` on the root; the engine's image rule changes from `filter: none !important` to `filter: brightness(var(--force-dark-image-brightness, 100%)) !important`, with the existing `[data-force-dark-image="invert"]` rule keeping priority.
- `index.js`: read `chrome.storage.sync.get([host, "__customThemes"])`; add `currentUserThemes`; `applyEngine` computes `resolveTheme`, and passes `{...config, palette, imageDim}` to `enableDarkMode`. `chrome.storage.onChanged` re-applies when `__customThemes` or the host key changes.

**Tests (add to `dom_engine_test.mjs`, load the UMD files via the existing vm pattern):**
- `engine applies a theme palette` — `enableDarkMode({palette: paletteFromTheme(dracula)})` sets `--force-dark-bg` to `#282a36` and `--force-dark-link` to `#8be9fd`.
- `engine without palette still derives from backgroundColor` (existing behaviour; reuse current assertions).
- `imageDim sets the image brightness variable and 0 clears it`.
- `resolveTheme` table: user theme chosen; builtin chosen; `"default"` → null; deleted user theme → falls back (no throw); corrupt `userThemes` (`"x"`) → falls back; absent `themeId` + no pack → default.
- Back-compat: a config with only `backgroundColor:"#000000"` yields palette `bg "#000000"`.

- [ ] **Step 1:** Write the tests; run; expect failures.
- [ ] **Step 2:** Implement `resolveTheme`; wire engine, `index.js`, manifest.
- [ ] **Step 3:** `npm test` green. Then in the audit harness (Task 7 creates it; until then a one-off Playwright run is fine) confirm Wikipedia with `themeId:"builtin:dracula"` renders Dracula colours.
- [ ] **Step 4:** Commit `feat(engine): apply theme palettes and image dimming`.

---

### Task 5: Popup theme dropdown

**Files:** Modify `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/popup.css`; create `tests/theme_ui_test.mjs` (popup part); modify `package.json`.

**Interfaces:**
- Consumes: `ForceDarkThemes.getBuiltinThemes`, `findSitePack` (Task 6; optional until then), `storage` keys `__customThemes` read directly via `chrome.storage.sync.get` (popup is a classic script).
- Produces: `<select id="theme-select">` below the engine list. Options: `""` "Automatic" (label becomes `Automatic (BBC theme)` when a pack matches), `"default"` "Default colour", optgroup "Built-in" (the 8), optgroup "My themes" (omitted when none). Values are theme ids. Changing it sends `{type:"TOGGLE", host, themeId, forceEnabled: <current enabled>, ...}` exactly like the existing handlers. Scripts `themeCore.js`, `builtinThemes.js`, `sitePacks.js` are loaded in `popup.html` before `popup.js`. Option text uses `textContent`.

**Tests (`theme_ui_test.mjs`, static + vm):** `popup.html declares #theme-select and loads the theme scripts before popup.js`; `popup.js sends themeId in TOGGLE` (string check on source plus a vm-run of the dropdown builder if extracted as `buildThemeOptions(userThemes, pack): {value,label,group}[]` — extract it into `themeCore.js` as `ForceDarkThemes.buildThemeOptions` so it is unit-testable): empty user themes → no "My themes" group; pack present → Automatic label includes the pack name; a user theme named `<img onerror>` is kept as plain text in `label`.

- [ ] **Step 1–4:** test first, implement, `npm test`, commit `feat(popup): theme dropdown`.

---

### Task 6: Site packs — matching, data, resolution

**Files:** Create `src/shared/sitePacks.js`, `tests/site_packs_test.mjs`; modify `manifest.json` (add to content scripts), `package.json`.

**Interfaces:**
- Produces on `ForceDarkThemes`:
  - `findSitePack(host: string): Pack | null` — normalise: lowercase, strip one trailing `.`; match an entry when `host === m` or `host.endsWith("." + m)`. Never regular expressions from data.
  - `validateFix(fix: unknown): boolean` — `action` ∈ `{"invert-image","keep-light","surface:strong"}`; `selector` is a string ≤ 200 chars matching `/^[A-Za-z0-9_\-#.\[\]="':>*,()~+^$| ]+$/` (no braces, semicolons, backslashes, angle brackets, `@`).
  - `getSitePacks(): Pack[]`.
  - `Pack = {id: string, name: string, match: string[], themeId: string, fixes: Fix[]}`.
- Initial data: one pack per site in this list, each `themeId: "builtin:midnight"` and `fixes: []` (fixes are added with evidence in Task 7): bbc (`bbc.com`,`bbc.co.uk`), cnn (`cnn.com`), forbes (`forbes.com`), npr (`npr.org`), guardian (`theguardian.com`), nytimes (`nytimes.com`), reuters (`reuters.com`), aljazeera (`aljazeera.com`), dailymail (`dailymail.co.uk`,`dailymail.com`), hindustantimes (`hindustantimes.com`), indianexpress (`indianexpress.com`), ndtv (`ndtv.com`), globo (`globo.com`), medium (`medium.com`), substack (`substack.com`), wikipedia (`wikipedia.org`), github (`github.com`), mdn (`developer.mozilla.org`), reddit (`reddit.com`), hackernews (`news.ycombinator.com`).

**Tests:** matches `bbc.com`, `www.bbc.com`, `news.bbc.co.uk`, `WWW.BBC.COM`, `bbc.com.` ; **does not match** `evilbbc.com`, `bbc.com.evil.io`, `notbbc.co.uk`, `bbc.co.uk.attacker.net`, `""`, `undefined`, `"bbc"`; `all packs validate` (ids unique, `match` non-empty lowercase, every `themeId` resolves via `getBuiltinTheme`, every fix passes `validateFix`); `validateFix` rejects `{}`-containing selectors, `;`, `\`, `<script>`, `@import`, 201-char selectors and unknown actions.

- [ ] **Step 1–4:** test first, implement, add to manifest, `npm test`, commit `feat(themes): site pack matching and initial packs`.

---

### Task 7: Pack fixes in the engine, and the audit harness

**Files:** Create `tools/site-audit/audit.mjs`, `tools/site-audit/README.md`; modify `src/content/themeEngine/cssOverrideEngine.js`, `src/content/index.js`, `src/shared/sitePacks.js`, `tests/dom_engine_test.mjs`.

**Interfaces:**
- Consumes: `Pack.fixes` from `resolveTheme(...).pack` (Task 4/6).
- Produces in the engine: `applyPackFixes(fixes: Fix[]): void` and `clearPackFixes(): void` (called from `enableDarkMode`/`disableDarkMode`; fixes are re-applied by the existing rescans). Semantics, each validated with `ForceDarkThemes.validateFix` before use, selectors run through `document.querySelectorAll` inside try/catch (an invalid selector is skipped, never throws):
  - `invert-image`: set `data-force-dark-image="invert"` on matches (so the existing `filter: invert(0.9) hue-rotate(180deg)` rule applies; also applies to elements with a CSS background image).
  - `surface:strong`: set `data-force-dark-surface="strong"` on matches.
  - `keep-light`: set `data-force-dark-keep` on matches and skip them and their descendants during scanning (no surface/text/border markers); add one CSS rule `:root[data-force-dark-mode="css"] [data-force-dark-keep] { background-color: #ffffff !important; color: #111111 !important; }` and `[data-force-dark-keep] * { color: inherit !important; }`.
- `tools/site-audit/audit.mjs`: dev-only. Env `EXT` (extension dir), `B` (Chromium executable), `G` (global node_modules dir containing `@playwright/cli/node_modules/playwright`), `SITES` (JSON `[[name,url]]`), `ENGINES`, `WAIT` (ms), `SCHEME` (`light|dark`), `OUT`. Launches a persistent context with `--load-extension`, sets per-host config through the service worker's `chrome.storage.sync`, loads each site once with the extension off and once on, writes `<name>-<engine>.png` and prints JSON (load ms, long-task ms, title). Document usage and the Cloudflare caveat in the README; the folder is never packaged (`package-extension.sh` zips only `manifest.json assets/ src/`).

**Tests (`dom_engine_test.mjs`):**
- `invert-image fix marks matches` / `surface:strong fix marks matches` / `keep-light skips scanning of the subtree`.
- `an invalid selector in a fix is skipped without throwing` (selector `"div["`).
- `clearPackFixes removes markers`, and `disableDarkMode` clears them.
- `fixes are not applied for engine invert` (CSS engine only).

**Evidence step (not unit-testable):** for each pack, run the harness with the pack and compare before/after screenshots. Add `fixes` only where a screenshot shows a defect the engine does not already handle, with a one-line comment naming the defect (e.g. Hindustan Times wordmark drawn as a CSS background image → `invert-image` on its container). Sites that block the harness (Daily Mail, NDTV, The Hill, NYT, Reuters) keep `fixes: []` unless the owner supplies screenshots. Record the reviewed screenshots' names in the commit message.

- [ ] **Step 1:** Write the engine tests; run; expect failure.
- [ ] **Step 2:** Implement the fix actions in the engine.
- [ ] **Step 3:** Write the harness; run it on the 20 pack sites in Auto with `WAIT=9000`; review screenshots; add evidence-backed fixes to `sitePacks.js`.
- [ ] **Step 4:** `npm test` green; commit `feat(themes): pack fixes and site-audit harness`.

---

### Task 8: Theme editor in Options

**Files:** Modify `src/options/options.html`, `src/options/options.js`, `src/options/options.css`; extend `tests/theme_ui_test.mjs`.

**Interfaces:**
- Consumes: `ForceDarkThemes.validateTheme`, `paletteFromTheme`, `contrastIssues`, `getBuiltinThemes`; storage `getCustomThemes`, `saveCustomTheme`, `deleteCustomTheme` (Task 3). `options.html` loads the three UMD scripts as classic scripts before the module script.
- Produces a "Themes" section: list of "My themes" (name, swatch, Edit/Duplicate/Delete) and a "Create theme" form: name input (`maxlength 40`), six colour inputs (`background, surface, text, muted, link, border`), `imageDim` range 0–60, a **live preview** `<section id="theme-preview">` (headline, paragraph, link, button, input, code block, card, image placeholder) styled via CSS custom properties set from `paletteFromTheme` of the form state, a contrast message area (`role="status"`), and Save/Cancel. Save is disabled while `contrastIssues(...).level === "block"`; `warn` shows a message but allows saving. Start-from list lets the user pick a built-in as a template. Errors from `saveCustomTheme` (cap, quota) are shown in `#statusMessage`. Export-one and Import-one JSON buttons: import reads a file ≤ `MAX_IMPORT_BYTES`, `JSON.parse`, `validateTheme`, assigns a fresh `user:` id, then `saveCustomTheme`. All text via `textContent`.

**Tests:** `options.html has the theme editor markup and loads theme scripts`; `options.js never uses innerHTML` (privacy test list extended to cover it already); a vm/fake-DOM test for the pure helper `ForceDarkThemes.themeFromForm(formState): unknown` (add to `themeCore.js`): trims the name, lowercases hex, clamps `imageDim`; and `importThemeFile(text: string): {ok:true, theme}|{ok:false,error}` (add to `themeCore.js`): rejects > `MAX_IMPORT_BYTES`, bad JSON, hostile keys, and returns a theme with a fresh `user:` id.

- [ ] **Step 1–4:** tests first, implement, `npm test`, verify in a real browser (screenshot the editor at default width and 400px wide), commit `feat(options): theme editor with live preview and import/export`.

---

### Task 9: Custom CSS sanitiser and content injection

**Files:** Create `src/shared/customCss.js`, `tests/custom_css_test.mjs`; modify `src/content/index.js`, `src/content/themeEngine/cssOverrideEngine.js`, `manifest.json`, `package.json`.

**Interfaces:**
- Produces `ForceDarkThemes.validateCss(css: unknown): {ok:true, css: string} | {ok:false, error: string}`. Algorithm: must be a string ≤ `MAX_CSS_CHARS`; reject if it contains a backslash, `<`, `>`, a NUL; strip `/* … */` comments (an unterminated comment is rejected) **before** scanning; then reject (case-insensitive, whitespace-insensitive around the token) any of: `@import`, `@namespace`, `@font-face`, `url(`, `image-set(`, `-webkit-image-set(`, `image(`, `src(`, `cross-fade(`, `expression(`, `behavior:`, `-moz-binding`, `javascript:`. Returns the original text (comments kept) when OK. Error strings are plain sentences naming the first offending construct.
- Content script: `chrome.storage.sync.get([host, "__customThemes", "__css:" + host])`; when the site is enabled **and** the CSS is non-empty and `validateCss` passes again at apply time, insert `<style id="__force_dark_custom_css__">` (after the engine style, via `textContent`) — for both CSS and Invert engines; remove it on disable; update on `storage.onChanged`. The manifest lists `customCss.js` after `sitePacks.js`.

**Tests (`custom_css_test.mjs`):** accepts `body{font-family:Inter,sans-serif !important}`, `pre{border-radius:12px}`, `/* note */ a{color:red}`; rejects each of: `@import "x"`, `@IMPORT`, `a{background:url(x)}`, `a{background:URL( x )}`, `a{background:u\72l(x)}`, `a{background:ur/**/l(x)}` (after comment stripping this becomes `url(` and must be rejected), `image-set(`, `-webkit-image-set(`, `expression(`, `</style><script>`, a 6,001-char string, non-strings, an unterminated `/*`. Content script tests (in `dom_engine_test.mjs`): style element appears when enabled with valid CSS, is absent when CSS is invalid or the site is disabled, is removed by `disableDarkMode`, and is inserted via `textContent`.

- [ ] **Step 1–4:** tests first, implement, manifest, `npm test`, commit `feat(css): sanitised per-site custom CSS`.

---

### Task 10: Custom CSS manager in Options, popup link

**Files:** Modify `src/options/options.html`, `options.js`, `options.css`, `src/popup/popup.html`, `popup.js`; extend `tests/theme_ui_test.mjs`.

**Interfaces:**
- Consumes: storage `getCustomCss`, `setCustomCss`, `getAllConfigs`.
- Produces: an Options "Custom CSS" section: a hostname input (lowercased, must pass `isSafeKey`), a monospace textarea (`maxlength 6000`) with a live character counter, Save (validates with `validateCss`, shows the sanitiser's message on failure, shows quota errors), a list of sites that have CSS with Edit/Delete, and a note that `url()`, `@import` and escapes are blocked to keep the extension offline. Popup footer link "Site CSS…" opens `options.html#css=<host>`; Options reads the hash and pre-fills the host.

**Tests:** markup present; a pure helper `ForceDarkThemes.hostFromHash(hash: string): string` (`"#css=bbc.com"` → `"bbc.com"`; `"#css=../x"`, `"#css="`, `"#x"` → `""`).

- [ ] **Step 1–4:** tests first, implement, `npm test`, real-browser check (save CSS on a local test page and see it apply), commit `feat(options): custom CSS manager and popup link`.

---

### Task 11: Privacy and security tests for the new surface

**Files:** Modify `tests/privacy_security_test.mjs`.

- Add `src/shared/themeCore.js`, `builtinThemes.js`, `sitePacks.js`, `customCss.js`, and the changed popup/options/content files to the network-egress file list.
- Add: `manifest permissions unchanged` (`storage`, `activeTab`, `contextMenus` only; no `host_permissions` added); `new extension pages never use innerHTML/outerHTML/insertAdjacentHTML`; `no new web_accessible_resources`; `CSP unchanged`.
- [ ] Run `npm test`; commit `test: privacy and security coverage for themes and custom CSS`.

---

### Task 12: Release 2.0.0

**Files:** version strings listed in Global Constraints; `README.md`, `CHANGELOG.md`, `VERSIONING.md`, `CHROMEWEBSTORE.md`, `docs/index.html`, `docs/features.html`, `docs/llms.txt`, `docs/sitemap.xml` (only if a new page is added), `documentation/store-listing-translations.md`.

- [ ] **Step 1:** Bump to `2.0.0` (including the `EXTENSION_VERSION` constant from Task 3 and the privacy test assertion); `VERSIONING.md` checklist lines and tag text (`v2.0.0`, "Site Themes Release"); SECURITY table `2.0.x` active / `< 2.0.0` deprecated.
- [ ] **Step 2:** `CHANGELOG.md` `## [2.0.0] - <date>`: Added (8 themes, popup dropdown, site packs for 20 sites, theme editor with live preview and contrast guard, theme import/export, per-site custom CSS with sanitiser), Changed (image dimming variable; export format v2 adds `themes` and `customCss`; old exports still import), Privacy (no new permissions or network calls).
- [ ] **Step 3:** Docs: README feature bullets and test totals (recount from `npm test`); features page and homepage mention themes once, without repeating the document-format list (keyword-spam rejection history); `llms.txt` version and capability line. The store description gets one new feature bullet; keep the existing format list exactly once.
- [ ] **Step 4:** `npm test` all green; `./package-extension.sh`; unzip-list check for the four UMD files and absence of `tools/`, `tests/`, `documentation/`.
- [ ] **Step 5:** Real-browser smoke test with the audit harness on Wikipedia, GitHub, MDN, BBC, Forbes, Hindustan Times with the pack/theme applied; screenshots reviewed.
- [ ] **Step 6:** Commit `chore(release): v2.0.0`. Do not push or tag; the owner does that and the store upload.

## Self-Review

- **Spec coverage:** data model (T1,3), built-ins (T2), site packs + fixes (T6,7), editor + preview + contrast guard + import/export (T8), popup dropdown (T5), engine integration + image dim (T4), custom CSS + sanitiser + UI (T9,10), privacy/security + tests (T11), phases/release (T12). Open decisions resolved: all free; first-20 list as specified; built-in names as specified.
- **Type consistency:** `Theme`, `Palette`, `Pack`, `Fix`, `LIMITS`, `THEME_ID_PATTERN` are defined once (T1, T3, T6) and referenced by name afterwards; `buildThemeOptions`, `themeFromForm`, `importThemeFile`, `hostFromHash` are added to `themeCore.js` in the tasks that need them.
- **Proportion:** tasks give signatures, exact values and test names; bodies are left to the implementer.
