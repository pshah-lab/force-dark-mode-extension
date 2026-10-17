# Side panel and broken-site report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the extension as a side panel instead of a popup, and replace the 2.0.0 daily usage heartbeat with a user-initiated "report this site as broken" that sends only the site's domain.

**Architecture:** The existing popup page becomes the side panel page (`chrome.sidePanel`), refreshed when the active tab changes. All network access stays in one background file, now `siteReportSender.js`. The backend gains one table and one endpoint, deployed into the portfolio repo as an App Router route.

**Tech Stack:** Chrome MV3, plain JS, Node test scripts (`node tests/<file>.mjs`, `npm test`), Vercel + Supabase.

**Spec:** `documentation/specs/2026-10-17-side-panel-and-site-report-design.md`

## Global Constraints

- Only one `src/` file may contain `fetch(`: `src/background/siteReportSender.js` (the privacy suite pins this).
- Every `fetch` sets `credentials: "omit"` and `referrerPolicy: "no-referrer"`.
- No host permissions. Permissions become exactly `["storage", "activeTab", "contextMenus", "sidePanel"]`.
- Consent copy is exactly the text in the spec; it never says "anonymous" and always names the domain.
- Payload keys are exactly `site`, `engine`, `theme`, `version`; custom theme names and URLs are never sent.
- Never weaken a test to pass; update a pin only when the spec changes the rule it pins.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. The owner pushes, tags and uploads.
- Private docs stay under `documentation/`, never `docs/`.

## Review Focus

- Panel left open while the user switches tabs or navigates: must show the new tab's site, not a stale one.
- Panel open on a restricted page (`chrome://`, new tab, Web Store): controls disabled, no report button.
- Hostnames that must never be sent: IPs, `localhost`, `.local`, `file:` (`local_files`), empty, over 253 chars.
- Double tap on "Send report" or reopening the panel the same day: exactly one request, second says already reported.
- Network failure or non-2xx: panel says it failed, nothing is stored as "reported", nothing is retried silently.
- A user who opted in on 2.0.0: their stored ID is deleted server-side, then removed locally; failure retries next start.

---

### Task 1: Side panel shell

**Files:**
- Modify: `manifest.json`, `src/background/serviceWorker.js`, `src/popup/popup.css`
- Test: `tests/side_panel_test.mjs` (new), `tests/privacy_security_test.mjs` (permission pins only)

**Interfaces:**
- Produces: manifest with `side_panel.default_path = "src/popup/popup.html"`, no `action.default_popup`, `minimum_chrome_version` `"114"`, permission `sidePanel`; worker calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.

- [ ] **Step 1: Write failing tests** in `tests/side_panel_test.mjs`: manifest permissions equal `["storage","activeTab","contextMenus","sidePanel"]`; `manifest.action.default_popup` is undefined; `manifest.side_panel.default_path` exists on disk; `minimum_chrome_version` is `"114"`; `serviceWorker.js` source contains `setPanelBehavior` with `openPanelOnActionClick: true`; `popup.css` declares no fixed `width` on `.popup` (use `max-width`/`100%`).
- [ ] **Step 2: Run** `node tests/side_panel_test.mjs`. Expected: FAIL on each assertion.
- [ ] **Step 3: Edit** manifest, add `chrome.sidePanel.setPanelBehavior(...).catch(() => {})` at worker top level (runs every start), make `.popup` fluid.
- [ ] **Step 4: Run** the new test and `npm test`; update only the permission/`action` pins in `privacy_security_test.mjs` that this task intentionally changes. Expected: PASS.
- [ ] **Step 5: Commit** `feat(panel): open the extension as a side panel`.

### Task 2: Panel follows the active tab

**Files:**
- Create: `src/popup/panelTabEvents.js`
- Modify: `src/popup/popup.js`, `src/popup/popup.html`
- Test: `tests/panel_tab_events_test.mjs` (new)

**Interfaces:**
- Produces: `shouldRefresh(event: { kind: "activated" | "updated" | "focus", tabId?: number, changeInfo?: object }, activeTabId: number | undefined): boolean` — true for `activated`; for `updated` only when `tabId === activeTabId` and `changeInfo.url` is set or `changeInfo.status === "complete"`; true for `focus`; false for anything else.

- [ ] **Step 1: Write failing tests** covering each branch above, plus: update for a background tab returns false, `status: "loading"` without `url` returns false.
- [ ] **Step 2: Run** `node tests/panel_tab_events_test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `shouldRefresh` (UMD style like `telemetryPrompt.js`). In `popup.js` wrap the per-tab setup in `loadForTab(tab)` and call it again from `chrome.tabs.onActivated`, `chrome.tabs.onUpdated`, `chrome.windows.onFocusChanged` listeners guarded by `shouldRefresh`; remove stale per-tab handlers each load (assign `onclick`/`oninput` instead of adding listeners).
- [ ] **Step 4: Verify** tests pass, then in a built unpacked extension in the Browser pane or Chrome: open the panel, switch tabs, navigate, open `chrome://extensions` (restricted state). Expected: panel always matches the active tab.
- [ ] **Step 5: Commit** `feat(panel): follow the active tab`.

### Task 3: Remove the usage heartbeat, add legacy cleanup

**Files:**
- Delete: `src/background/telemetrySender.js`, `src/shared/telemetry.js`, `src/popup/telemetryPrompt.js`, `tests/telemetry_sender_test.mjs`, `tests/telemetry_prompt_test.mjs`, `tests/telemetry_test.mjs`
- Create: `src/background/legacyTelemetryCleanup.js`, `tests/legacy_cleanup_test.mjs`
- Modify: `src/background/serviceWorker.js`, `src/content/index.js` (remove `sendUsage` and `reportedUsage`), `src/options/themeEditor.js`, `src/viewer/viewer.js` (remove USAGE messages), `src/popup/popup.html` and `popup.js` (remove telemetry card), `src/options/options.html` and `options.js` (remove Usage stats card), `tests/run_tests.mjs`, `tests/privacy_security_test.mjs`, `tests/stats_page_test.mjs` only if they import removed modules

**Interfaces:**
- Produces: `createLegacyCleanup({ storage: { get(key), remove(key) }, fetchFn }): { run(): Promise<"none" | "deleted" | "retry"> }`. It reads `telemetryState`; with no `id` it returns `"none"` (and still removes `telemetryPromptState`); otherwise POSTs `{ id }` to `https://pshah.fun/api/darkmode-telemetry-delete` (`credentials: "omit"`, `referrerPolicy: "no-referrer"`); on 2xx removes `telemetryState` and `telemetryPromptState` and returns `"deleted"`; on non-2xx or throw keeps both and returns `"retry"`. Also removes `pendingDeleteIds` it finds by sending them first.
- Consumes: nothing from earlier tasks. Task 4 moves the `fetch` home: this file receives `fetchFn` injected from `siteReportSender.js` so `fetch` still lives in one file.

- [ ] **Step 1: Write failing tests** in `tests/legacy_cleanup_test.mjs`: no state → `"none"`, no fetch; enabled state with id → one DELETE to the exact URL with body `{"id":"<id>"}`; 204 → `"deleted"` and both keys removed; 500 and a thrown error → `"retry"`, keys kept; a second `run()` after success → `"none"`.
- [ ] **Step 2: Run** it. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `createLegacyCleanup`; wire it in `serviceWorker.js` at start (`run().catch(() => {})`) using the `fetchFn` exported by `siteReportSender.js` (Task 4 creates it; until then export a stub `fetchFn` from a temporary export in the worker and move it in Task 4 step 3).
- [ ] **Step 4: Delete** the listed files and remove their imports; fix `run_tests.mjs` and the privacy suite pins that named the removed files (`SENDER_PATH`, `senderModule`, `telemetryModule`, the "exactly one src file with fetch" rule now points at `siteReportSender.js`, the `telemetryState`-never-in-sync test stays).
- [ ] **Step 5: Run** `npm test`. Expected: PASS with no skipped or weakened assertions.
- [ ] **Step 6: Commit** `refactor: remove the usage heartbeat and clean up 2.0.0 opt-ins`.

### Task 4: Report payload and sender

**Files:**
- Create: `src/shared/siteReport.js`, `src/background/siteReportSender.js`, `tests/site_report_test.mjs`
- Modify: `src/background/serviceWorker.js` (route message `{ type: "SITE_REPORT", host, engine, themeId }`)

**Interfaces:**
- Produces in `siteReport.js`: `normalizeSite(urlOrHost: string): string | null` (hostname rules from the spec; `null` when rejected); `buildReport({ site, engine, themeId, version }): { site, engine, theme, version } | null`; `isReportable(url: string): boolean`; `REPORT_URL = "https://pshah.fun/api/darkmode-report"`.
- Produces in `siteReportSender.js`: `createReportSender({ storage, fetchFn, now, version }): { send(msg): Promise<"sent" | "already" | "invalid" | "failed"> }` and `export const fetchFn`.

- [ ] **Step 1: Write failing tests**: `normalizeSite("https://Docs.Example.com:8443/a?q=1#x")` → `"docs.example.com"`; rejects `127.0.0.1`, `[::1]`, `localhost`, `printer.local`, `x.internal`, `a.test`, `local_files`, `""`, a 254-char host, `"a b"`; `buildReport` maps built-in theme id → itself, `"user:abc"` → `"custom"`, empty/`"default"` → `"default"`, unknown engine → `null`; sender: `"sent"` posts exactly the four keys with `credentials: "omit"` and `referrerPolicy: "no-referrer"`, stores `{ site, day }` only on 2xx; second call same site and UTC day → `"already"`, no fetch; next UTC day → sends again; non-2xx and thrown errors → `"failed"`, nothing stored; invalid host → `"invalid"`, no fetch; two concurrent calls → one fetch.
- [ ] **Step 2: Run** `node tests/site_report_test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules; 5 s `AbortController` timeout; concurrency via an in-flight map keyed by `site`; storage key `siteReportState` as `{ day, sites: [] }` pruned when the day changes. Move the shared `fetchFn` here and point Task 3's cleanup at it.
- [ ] **Step 4: Run** the test and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(report): build and send a broken-site report`.

### Task 5: Panel report UI

**Files:**
- Modify: `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js`
- Create: `src/popup/reportCard.js`, `tests/report_card_test.mjs`

**Interfaces:**
- Produces: `REPORT_COPY = { title, body, send, cancel, sent, already, failed }` in `reportCard.js` with the spec's exact strings (`sent`: `Thanks, report sent`, `already`: `Already reported today`, `failed`: `Could not send, try again`); `outcomeMessage(outcome: "sent" | "already" | "invalid" | "failed"): string`.
- Consumes: the `SITE_REPORT` message and its four outcomes from Task 4.

- [ ] **Step 1: Write failing tests**: `REPORT_COPY.body` equals the spec text exactly, contains `domain`, does not contain `anonymous`; `outcomeMessage` maps each outcome; `popup.html` contains the button `#report-site` and the card `#report-card` with `Send report` and `Cancel`, and no `telemetry` or `usage stats` text remains in `popup.html`/`popup.js`.
- [ ] **Step 2: Run** `node tests/report_card_test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the button (hidden on restricted pages via the existing unavailable-state path), the inline confirmation, and the send flow; the host sent is `new URL(tab.url).hostname` computed in the panel (same minimization rule the privacy suite pins for messages: no full URL in messages). Remove the old "Report a broken site" link from the feedback card text that said "Nothing is sent from your browser".
- [ ] **Step 4: Run** tests and `npm test`; verify in a real browser against the local backend or a stubbed endpoint: confirm card text, send, already-reported, failure path, and restricted page.
- [ ] **Step 5: Commit** `feat(panel): report a broken site with explicit confirmation`.

### Task 6: Backend table, endpoint, portfolio route

**Files:**
- Create: `backend/telemetry/supabase/site_reports.sql`, `backend/telemetry/api/darkmode-report.js`, `backend/telemetry/lib/reportSchema.js`, `tests/site_report_backend_test.mjs`
- Modify: `backend/telemetry/lib/cors.js` only if the extension-origin helper needs no change (it should not), `backend/telemetry/README.md`

**Interfaces:**
- Produces: `validateReport(body): boolean` in `reportSchema.js` (exact four keys, same hostname rules and engine/theme/version rules as `siteReport.js`; a parity test asserts both accept and reject the same fixtures); handler `createReportHandler({ store })` with `store.upsertReport({ day, site, engine, theme, version })`, answering 204 / 400 / 405 / 413 / 500 with the extension CORS headers (same pattern as `api/darkmode-telemetry.js`); `site_reports` table with a purge statement for rows older than 400 days and the view `top_reported_sites`.

- [ ] **Step 1: Write failing tests** mirroring `tests/telemetry_backend_test.mjs`: valid → 204 and one upsert; extra key, bad host, bad engine, oversize, wrong method → rejected without touching the store; preflight → 204 with CORS; store throws → 500; parity fixtures with `src/shared/siteReport.js`; `site_reports.sql` enables RLS, has no policies, and revokes the view from `anon`/`authenticated`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** the schema, handler and SQL. Upsert increments `reports` (`on conflict (...) do update set reports = site_reports.reports + 1`).
- [ ] **Step 4: Run** the test and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): broken-site report endpoint and table`.
- [ ] **Step 6 (owner-assisted, outside this repo): deploy.** Apply `site_reports.sql` to Supabase project `wtisuelehtaigydyxwvg`; copy `reportSchema.js` into `~/Documents/newPortfolio/developer-portfolio/lib/darkmode/`, add `app/api/darkmode-report/route.js` (same adapter pattern as the other routes), `pnpm build`, owner commits and pushes; verify `curl -i -X OPTIONS https://pshah.fun/api/darkmode-report` returns 204.

### Task 7: Privacy text, store disclosure, release 2.1.0

**Files:**
- Modify: `docs/privacy.html`, `PRIVACY.md`, `docs/llms.txt`, `src/options/options.html`, `CHROMEWEBSTORE.md`, `CHANGELOG.md`, `VERSIONING.md`, `manifest.json`, `package.json`, `src/shared/storage.js` (`EXTENSION_VERSION_META`), `src/options/options.html` footer, the two tests that pin the export version, `docs/stats.html` only to state that the usage statistics ended and the page shows past data
- Test: `tests/privacy_security_test.mjs`, `tests/seo_test.mjs`, `tests/stats_page_test.mjs`

- [ ] **Step 1: Write failing tests**: `docs/privacy.html` and `PRIVACY.md` name the report fields (`site`, engine, theme, version), say the domain is sent, say no ID is attached and per-person deletion is therefore not possible, and no longer claim usage statistics are collected; `CHROMEWEBSTORE.md` declares Web history and not User activity; `manifest.json`, `package.json`, `EXTENSION_VERSION_META` and the Options footer all read `2.1.0`.
- [ ] **Step 2: Run** the three suites. Expected: FAIL.
- [ ] **Step 3: Rewrite** the texts; add a `[2.1.0]` CHANGELOG entry (side panel, broken-site report, usage heartbeat removed, new `sidePanel` permission); update the version row and Web history answer in `CHROMEWEBSTORE.md`; flag store-listing translations as needing an update (do not machine-translate privacy wording).
- [ ] **Step 4: Run** `npm test`, then `./package-extension.sh`. Expected: PASS and `force-dark-mode-v2.1.0.zip` built.
- [ ] **Step 5: Verify in `chrome://extensions`**: load the built zip unpacked over a profile that has 2.0.x installed (or compare the permission list) and confirm no "permissions increased" disable prompt.
- [ ] **Step 6: Commit** `chore(release): 2.1.0`. The owner pushes, tags `v2.1.0` and uploads.
