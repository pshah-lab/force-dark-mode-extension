# Opt-in Usage Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in, anonymous daily usage heartbeats from the extension to an owner-run endpoint, with SQL views for DAU/WAU/MAU, new versus returning users and D1/D7/D30 retention.

**Architecture:** A pure allow-list module (`src/shared/telemetry.js`) defines and validates every field. One service-worker module (`src/background/telemetrySender.js`) is the only code that touches the network; it takes injected `storage`/`fetchFn`/`now` so tests never use the network. Content script, viewer and theme editor only send tiny `USAGE` messages. The popup shows a one-time consent card; Options holds the toggle, payload preview and Delete my data. A separate `backend/telemetry/` Vercel + Supabase project re-validates and stores rows.

**Tech Stack:** Chrome MV3 (ES modules in the service worker, classic scripts in the popup), Node assert tests (`tests/*.mjs`), Vercel functions, Supabase Postgres.

**Spec:** `documentation/specs/2026-10-14-opt-in-usage-telemetry-design.md`

## Global Constraints

- Off by default: no ID and no network call until the user clicks Yes.
- Never sent: hostnames, URLs, page titles or content, document content, custom CSS, custom theme names or colours.
- Heartbeat shape (exact): `{ id, day, version, env: { chrome, os, lang }, engines: { auto, css, invert }, theme, features: { viewer, editor, customCss, sitePack } }`. `engines` and `features` values are booleans; `theme` is a built-in ID (`builtin:<slug>`) or `"custom"`.
- One heartbeat per UTC day, sent at the first usage event of that day.
- ID: random UUID in `chrome.storage.local` only (never `sync`); deleted on opt-out.
- Manifest: `permissions` stay `["storage","activeTab","contextMenus"]` (no `alarms`) and no host permissions are added (Ruling 13); the backend answers CORS for the extension origin instead.
- Endpoints: `https://pshah.fun/api/darkmode-telemetry` (ingest) and `https://pshah.fun/api/darkmode-telemetry-delete`.
- Do not bump the version (owner releases); changelog entry goes under "Unreleased".
- The owner deploys the backend, edits CWS disclosures, pushes, tags and uploads. Do not push.

## Review Focus

- Hostname or URL smuggled into `theme`, `lang` or any string: reject the whole heartbeat, never sanitise partially.
- Opt-out mid-day, then opt back in: a new ID is created, and the old tally and `lastSentDay` are gone.
- Send fails (offline, 500): no retry storm; retry only on the next usage event the same day; `lastSentDay` unchanged.
- Two `USAGE` events racing at the first use of a day: exactly one POST.
- Messages from web pages or other extensions: ignored (`sender.id` check).
- Delete my data when the server is unreachable: local ID is still discarded and the user is told the server copy was not confirmed deleted.

---

### Task 1: Allow-list module

**Files:**
- Create: `src/shared/telemetry.js`
- Create: `tests/telemetry_test.mjs`
- Modify: `package.json` (add `"test:telemetry": "node tests/telemetry_test.mjs"` and append `&& node tests/telemetry_test.mjs` to `test`)

**Interfaces:**
- Produces (ES module exports):
  - `ENGINES = ["auto","css","invert"]`, `FEATURES = ["viewer","editor","customCss","sitePack"]`, `BUILTIN_THEME_IDS` (the 8 IDs from `src/shared/builtinThemes.js`), `OS_FAMILIES = ["mac","windows","linux","chromeos","other"]`
  - `utcDay(date: Date): string` (`YYYY-MM-DD`)
  - `emptyTally(day: string): Tally` where `Tally = { day, engines:{auto,css,invert}, theme: string|null, features:{...} }`, all booleans false
  - `sanitizeUsage(msg: unknown): Usage | null` where `Usage = { engine?: string, theme?: string, feature?: string }`; unknown shapes or values return `null`
  - `recordUsage(tally: Tally, usage: Usage): Tally` (pure; theme = last seen; non-builtin theme IDs map to `"custom"`)
  - `buildEnv({ userAgent: string, lang: string }): { chrome: number, os: string, lang: string }`
  - `buildHeartbeat({ id, version, tally, env }): Heartbeat`
  - `validateHeartbeat(obj: unknown): boolean` (exact key sets at every level, UUID `id`, `day` shape, `version` semver, `chrome` integer 1-999, `lang` `^[a-z]{2,3}$`, `theme` in builtins or `"custom"`)

- [ ] **Step 1: Write failing tests** in `tests/telemetry_test.mjs` (same `test()` harness style as `tests/feedback_prompt_test.mjs`): `validateHeartbeat` accepts a built heartbeat; rejects an extra top-level key, an extra key inside `env`/`engines`/`features`, `theme: "github.com"`, `theme: "builtin:evil"`, `lang: "en-US"`, `lang: "https://x"`, a non-UUID `id`, a non-boolean feature; `sanitizeUsage` returns `null` for `{engine:"x"}`, `{host:"a.com"}`, `{feature:"viewer", url:"x"}` and non-objects; `recordUsage` maps `user:abc` theme to `"custom"`; `buildEnv` parses Chrome major from a UA string and maps `Macintosh`/`Windows`/`CrOS`/`Linux`/unknown to the `OS_FAMILIES` values and `en-US` to `en`.
- [ ] **Step 2: Run** `node tests/telemetry_test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/shared/telemetry.js` per the Interfaces block. `validateHeartbeat` compares `Object.keys(...).sort()` against the exact expected key list at every level.
- [ ] **Step 4: Run** `node tests/telemetry_test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(telemetry): add allow-list module for opt-in usage metrics`.

### Task 2: Sender, consent state and delete

**Files:**
- Create: `src/background/telemetrySender.js`
- Create: `tests/telemetry_sender_test.mjs` (add to `package.json` as `test:telemetrysender` and to `test`)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces (ES module): `INGEST_URL`, `DELETE_URL` (constants from Global Constraints) and
  `createTelemetry({ storage, fetchFn, now, version, env }): Telemetry`, where `storage` is `{ get(key): Promise<any>, set(key, value): Promise<void>, remove(key): Promise<void> }`, `now: () => Date`, `env: () => {userAgent, lang}`, and `Telemetry` has:
  - `setConsent(enabled: boolean): Promise<void>`: on true creates `crypto.randomUUID()` ID and state `{enabled:true,id,lastSentDay:null,tally:null}`; on false removes the whole `telemetryState` key.
  - `recordUsage(msg: unknown): Promise<void>`: ignores everything unless enabled and `sanitizeUsage` passes; updates the tally (resetting it on a new UTC day); then, if `lastSentDay !== today`, calls `send()`.
  - `send(): Promise<boolean>`: builds and validates the heartbeat, POSTs JSON with `fetchFn(INGEST_URL, {method:"POST", headers:{"Content-Type":"application/json"}, body, credentials:"omit", referrerPolicy:"no-referrer"})`; sets `lastSentDay` only on `res.ok`; never throws.
  - `preview(): Promise<{enabled: boolean, heartbeat: Heartbeat|null}>`
  - `deleteMyData(): Promise<{serverConfirmed: boolean}>`: POSTs `{id}` to `DELETE_URL`, then always removes local state.
  - Concurrency: an in-flight `send` promise is shared so two racing events produce one POST.

- [ ] **Step 1: Write failing tests** with fake `storage` (a `Map`), fake `fetchFn` recording calls, a controllable clock. Tests: no fetch and no ID before `setConsent(true)`; `recordUsage` with consent off never fetches; first event of a day posts exactly one valid heartbeat, second same-day event posts nothing; two concurrent first events post once; a 500 response leaves `lastSentDay` null and the next same-day event retries once; a rejected `fetchFn` does not throw; day rollover posts again; opt-out removes state (`storage` empty) and a later opt-in creates a different ID; `deleteMyData` posts the id, clears local state, and returns `serverConfirmed:false` when `fetchFn` rejects; the request has `credentials:"omit"` and body keys pass `validateHeartbeat`.
- [ ] **Step 2: Run** `node tests/telemetry_sender_test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `createTelemetry`. State lives under the single storage key `telemetryState`.
- [ ] **Step 4: Run** the test. Expected: all pass.
- [ ] **Step 5: Commit** `feat(telemetry): add opt-in sender with consent, daily heartbeat and delete`.

### Task 3: Service worker wiring and usage instrumentation

**Files:**
- Modify: `src/background/serviceWorker.js` (message listener, ~line 25)
- Modify: `src/content/index.js` (near the "engine actually applied dark mode" branch, ~line 48), `src/viewer/viewer.js`, `src/options/themeEditor.js`
- Test: extend `tests/telemetry_sender_test.mjs` and add static checks in `tests/telemetry_test.mjs`

**Interfaces:**
- Consumes: `createTelemetry` (Task 2). The worker builds one instance with `chrome.storage.local`-backed `storage`, `fetchFn: fetch`, `version: chrome.runtime.getManifest().version`, `env: () => ({userAgent: navigator.userAgent, lang: chrome.i18n.getUILanguage()})`.
- Produces message types, all requiring `sender.id === chrome.runtime.id`: `USAGE` (`{type, engine?|theme?|feature?}`), `TELEMETRY_CONSENT` (`{type, enabled: boolean}`), `TELEMETRY_STATUS` (reply `preview()`), `TELEMETRY_DELETE` (reply `deleteMyData()`). Replies use `sendResponse` and the listener returns `true`.

- [ ] **Step 1: Write failing tests**: a static test that every `type: "USAGE"` message literal under `src/` uses only the keys `type`, `engine`, `theme`, `feature` and none of `host`, `url`, `title`; a static test that `serviceWorker.js` still returns early on `sender.id !== chrome.runtime.id` before handling any telemetry type.
- [ ] **Step 2: Run** both tests. Expected: FAIL.
- [ ] **Step 3: Implement.** The content script sends `{type:"USAGE", engine}` once per page load when an engine applied dark mode, `{type:"USAGE", theme}` with the active theme ID (builtin or user), and `{type:"USAGE", feature:"customCss"}` / `"sitePack"` when those apply. The viewer sends `feature:"viewer"` on file open; the theme editor sends `feature:"editor"` on save. Never include any other field. The worker routes the four message types to the telemetry instance.
- [ ] **Step 4: Run** `npm test`. Expected: all green (the egress scan updated in Task 5 may fail until then; fix it there in the same branch, but run the suite after Task 5).
- [ ] **Step 5: Commit** `feat(telemetry): wire usage events through the service worker`.

### Task 4: Popup consent card and Options controls

**Files:**
- Create: `src/popup/telemetryPrompt.js` (classic UMD like `src/popup/feedbackPrompt.js`)
- Create: `tests/telemetry_prompt_test.mjs` (add to `package.json`)
- Modify: `src/popup/popup.html` (script tag + card), `src/popup/popup.css`, `src/popup/popup.js`, `src/options/options.html`, `src/options/options.js`, `src/options/options.css`

**Interfaces:**
- Produces `TelemetryPrompt` global: `STATE_KEY = "telemetryPromptState"`, `SHOW_AFTER_OPENS = 5`, `recordOpen(state)`, `shouldShow(state)`, `decide(state)` (marks `decided: true`), with the same normalisation rules as `feedbackPrompt.js`.
- The popup card shows only when the feedback card is hidden and `shouldShow` is true. Yes sends `TELEMETRY_CONSENT {enabled:true}`; No only calls `decide`. Both call `decide`.
- Card copy (exact): title "Share anonymous usage stats?"; "We count: that you used the extension today, which engine and built-in theme you use, which features you used, and your version, Chrome version, OS family and language, plus a random ID for this install (not linked to you) used to tell days apart." (random-ID clause added in the final fix wave) "We never see: the sites you visit, what you read or watch, your documents, or anything you type." Buttons "Yes, share stats" and "No thanks".
- Options section "Usage stats": a checkbox (sends `TELEMETRY_CONSENT`), a `<pre id="telemetry-preview">` showing the `TELEMETRY_STATUS` heartbeat JSON (or "Nothing is sent while this is off"), and a "Delete my data" button (sends `TELEMETRY_DELETE`, shows "Deleted" or "Removed from this device; server deletion could not be confirmed"). DOM writes use `textContent` only.

- [ ] **Step 1: Write failing tests** for `TelemetryPrompt` (garbage state never shows, threshold of 5, `decide` hides forever and stops counting) in the vm-sandbox style of `tests/feedback_prompt_test.mjs`; plus `tests/theme_ui_test.mjs`-style static checks that `popup.html` contains the exact "We never see" sentence and the card ids `telemetry-prompt`, `telemetry-yes`, `telemetry-no`, and that `options.html` contains `telemetry-toggle`, `telemetry-preview`, `telemetry-delete`.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the files above following the feedback-card patterns in `popup.js` (lines ~40-65) and `popup.css`.
- [ ] **Step 4: Run** the tests. Expected: pass.
- [ ] **Step 5: Verify visually** with `preview_start` on the options page and a popup screenshot (card shows after 5 opens; toggle and preview work; Delete my data clears state).
- [ ] **Step 6: Commit** `feat(telemetry): add popup consent card and options controls`.

### Task 5: Manifest, privacy tests and policy documents

**Files:**
- Modify: `manifest.json` (no change after Ruling 13), `tests/privacy_security_test.mjs`, `PRIVACY.md` §1 and §2, `documentation/privacy/*.md` (data-inventory, data-flow, subprocessors), `documentation/ThemeSwitcher_Privacy_Compliance_Report.md`, `CHROMEWEBSTORE.md` (data disclosure wording), `CHANGELOG.md` ("Unreleased")

**Interfaces:**
- Consumes: Tasks 1-4 files. `EGRESS_SCANNED_FILES` gains `src/shared/telemetry.js` and `src/popup/telemetryPrompt.js` (both must contain no network patterns). `src/background/telemetrySender.js` moves to a new `EGRESS_ALLOWED = { "src/background/telemetrySender.js": [INGEST_URL, DELETE_URL] }` list.

- [ ] **Step 1: Update tests first** in `tests/privacy_security_test.mjs`: (a) remove the sender from the zero-egress scan and add: `fetch` appears in exactly one file under `src/` (the sender), `XMLHttpRequest`, `WebSocket`, `sendBeacon` appear nowhere; (b) every `https://` URL in the sender is one of the two constants; (c) `permissions` is still `["storage","activeTab","contextMenus"]` and the manifest declares no host permissions (Ruling 13; the backend answers CORS instead); (d) the sender never reads `chrome.tabs`, `location` or `document`; (e) `chrome.storage.sync` is not used with the `telemetryState` key; (f) `PRIVACY.md` no longer contains "Zero Telemetry" and does contain "off by default" and every field name from the heartbeat; (g) the policy's field list equals the keys of a built heartbeat.
- [ ] **Step 2: Run** `npm run test:privacy`. Expected: FAIL.
- [ ] **Step 3: Implement** the manifest change and rewrite the documents. `PRIVACY.md` §1 becomes "Anonymous, opt-in usage statistics" and states what is counted, that it is off by default, that no sites/content/IP are stored, how to turn off and delete. The other documents are updated to match, and `CHROMEWEBSTORE.md` gets the data-disclosure answers (collects "user activity", not sold, not used for unrelated purposes).
- [ ] **Step 4: Run** `npm test`. Expected: all green, test count increased.
- [ ] **Step 5: Commit** `docs(privacy): describe opt-in usage statistics and tighten egress tests`.

### Task 6: Backend and SQL views

**Files:**
- Create: `backend/telemetry/api/darkmode-telemetry.js`, `backend/telemetry/api/darkmode-telemetry-delete.js`, `backend/telemetry/lib/schema.js`, `backend/telemetry/supabase/schema.sql`, `backend/telemetry/supabase/views.sql`, `backend/telemetry/README.md`
- Create: `tests/telemetry_backend_test.mjs` (add to `package.json`)

**Interfaces:**
- `lib/schema.js` exports the same allow-lists and `validateHeartbeat` as `src/shared/telemetry.js` (a copy, because the deployed project cannot import from the extension). A test asserts the exported arrays are deep-equal to the extension module's.
- Each handler is `export default async function handler(req, res)` and accepts an injected store through `createHandler({ store, now })` for tests. `store.upsertHeartbeat(row)` and `store.deleteById(id)`.
- Ingest: POST only, JSON body ≤ 2 KB, `validateHeartbeat` must pass, `day` within one day of server UTC date; upsert on `(install_id, day)`; responds 204. Never reads or logs `req.headers["x-forwarded-for"]` or any IP.
- `schema.sql`: table `heartbeats(install_id uuid, day date, version text, chrome int, os text, lang text, engines jsonb, theme text, features jsonb, primary key (install_id, day))`, RLS enabled with no public policies (the function uses the service key).
- `views.sql`: `dau`, `wau`, `mau` (distinct installs over 1/7/30 days ending each day), `new_vs_returning` (per day: installs whose first day is that day versus earlier), `retention` (D1, D7, D30 as share of a cohort's installs seen exactly N days after first day).

- [ ] **Step 1: Write failing tests**: handler rejects non-POST (405), oversize or invalid bodies (400) including a heartbeat with `theme:"github.com"`, a stale day (400), accepts a valid one (204) and calls `store.upsertHeartbeat` once with a row containing no IP-like field; posting the same `(id, day)` twice leaves one row in a fake store; delete handler validates the UUID and calls `store.deleteById`; a static test that no file under `backend/` mentions `x-forwarded-for`, `remoteAddress` or `req.socket`; allow-list parity with the extension module; SQL files contain the objects `dau`, `wau`, `mau`, `new_vs_returning`, `retention`.
- [ ] **Step 2: Run** `node tests/telemetry_backend_test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** handlers and SQL. Verify the views by running them against a throwaway local Postgres or Supabase branch with fixture rows if available; otherwise record in the README that the views are unverified against a live database.
- [ ] **Step 4: Run** the test and `npm test`. Expected: green.
- [ ] **Step 5: Commit** `feat(telemetry): add ingest/delete functions and metric views`.

## Owner actions after merge

Create the Supabase project and run `schema.sql` and `views.sql`; deploy `backend/telemetry/` to Vercel under `pshah.fun/api/` (or change the two URLs, which the privacy test pins, and `EXTENSION_ID` in `backend/telemetry/lib/cors.js` if the store ID differs); complete the CWS data disclosures; bump the version, push, tag, upload.
