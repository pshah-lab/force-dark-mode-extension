# Opt-in usage report (2.1.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people opt in to one daily usage report (random ID, day, version, engines used, count of sites darkened) so the owner can compute DAU, WAU, returning users and retention.

**Architecture:** A pure allow-list module (`src/shared/usageReport.js`) builds and validates the report. A service-worker sender (`src/background/usageSender.js`) owns consent state, the per-day tally and the daily send, always through `postJson` in `network.js`. The existing 2.0.0 `heartbeats` table, delete endpoint and views are reused; the ingest endpoint learns a second, smaller payload shape. The side panel shows a one-time consent card and Options gets a toggle.

**Tech Stack:** Chrome MV3 extension (ES modules in the service worker, UMD classic scripts in the panel), plain Node test files (`node tests/x.mjs`), Vercel Node handlers, Supabase SQL.

**Spec:** `documentation/specs/2026-10-20-opt-in-usage-report-design.md`

## Global Constraints

- Version stays `2.1.0`. Do not edit `manifest.json` version. Do not move the `v2.1.0` tag.
- Off by default; nothing sent and no ID created before the user turns it on.
- Report fields, exactly: `id`, `day`, `version`, `engines` (`auto`,`css`,`invert` booleans), `sites` (integer 0..9999). Never a site name, URL, page content or typed text.
- `src/background/network.js` stays the only file that calls `fetch`.
- Consent copy never contains the word "anonymous" and states exactly the fields above.
- Public docs (`PRIVACY.md`, `docs/`, listing text) are edited on this branch only; they are pushed at release, not before.
- Private docs live under `documentation/`, never `docs/`. Never weaken or delete a test except where this plan says its behavior moved, and then the new test must assert the same behavior.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Every new test file is added to the `"test"` chain in `package.json` in the task that creates it.

## Rulings made while planning

- `used` is dropped from the report. A report is only created on a day dark mode was applied, so `used` would always be `true`.
- The spec said "extend the schema with an optional `sites`". The 2.0.0 shape also requires `env`, `theme`, `features`, which the spec excludes. So the endpoint accepts either the unchanged 2.0.0 shape or the new 5-field shape, and the DB columns the new shape leaves empty become nullable.
- The state key stays `telemetryState`, so 2.0.0 opt-ins keep their ID if they confirm. A new field `consentVersion: 2` marks consent given to this version's data.

## Review Focus

- A 2.0.0 opt-in (state has `enabled: true`, an ID, no `consentVersion`) must send nothing until they confirm the card.
- "No thanks" or "Turn off" with the network down must keep the ID as a pending delete and retry on the next worker start; a 400 from delete drops the ID.
- Messages from web pages or the extension's own pages must not be able to record usage; only content scripts (`sender.tab` with an http/https URL) can.
- Day rollover: a tally from yesterday is never sent as today; the site list never exceeds 9999 entries; the stored list holds hashes, not host names.
- Turning usage on twice, or off when it was never on, creates no second ID and sends nothing.

---

### Task 1: Report allow-list module

**Files:**
- Create: `src/shared/usageReport.js`
- Test: `tests/usage_report_test.mjs` (add to `package.json` test chain)

**Interfaces:**
- Produces (all named exports):
  - `ENGINES = ["auto","css","invert"]`, `MAX_SITES = 9999`
  - `utcDay(date: Date): string` (`YYYY-MM-DD`)
  - `hashSite(host: string): number` (FNV-1a 32-bit of the lower-cased host, unsigned integer)
  - `emptyTally(day: string): { day, engines: {auto,css,invert: boolean}, sites: number[] }`
  - `recordEngine(tally, engine): tally` and `recordSite(tally, host): tally` (pure; ignore unknown engines, empty hosts and duplicates; `sites` capped at `MAX_SITES`)
  - `buildReport({ id, version, tally }): { id, day, version, engines, sites }` where `sites = tally.sites.length`
  - `validateReport(obj): boolean`, `isUuid(v): boolean`

- [ ] **Step 1: Write the failing test** covering: `utcDay(new Date("2026-10-20T23:59:59Z")) === "2026-10-20"`; `hashSite("Example.com") === hashSite("example.com")` and differs from `hashSite("example.org")`; `recordSite` twice with the same host gives `sites.length === 1`; `recordEngine(t,"bogus")` unchanged; 10000 distinct hosts give `sites.length === 9999`; `buildReport` output has exactly the keys `id,day,version,engines,sites`; `validateReport` accepts a good report and rejects: an extra key, `sites: -1`, `sites: 10000`, `sites: 1.5`, a non-UUID id, bad day, bad version, an `engines` object with a missing key or a non-boolean value; `JSON.stringify(tally)` contains no host name after `recordSite(t,"example.com")`.
- [ ] **Step 2: Run** `node tests/usage_report_test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the module. Base validators on `git show v2.0.0:src/shared/telemetry.js` (same UUID, day and semver regexes, same `sameKeys` strictness).
- [ ] **Step 4: Run** `node tests/usage_report_test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(usage): allow-list module for the opt-in usage report`.

### Task 2: Backend accepts the new report

**Files:**
- Modify: `backend/telemetry/lib/schema.js` (add `validateUsage`, leave `validateHeartbeat` untouched), `backend/telemetry/api/darkmode-telemetry.js`, `backend/telemetry/README.md`
- Create: `backend/telemetry/supabase/usage_v2.sql`
- Test: `tests/usage_backend_test.mjs` (add to chain)

**Interfaces:**
- Consumes: `validateReport` rules from Task 1 (the backend file is a copy, as `reportSchema.js` is for site reports).
- Produces: `validateUsage(obj): boolean` in `lib/schema.js`; the handler stores a new-shape report as `{ install_id, day, version, engines, sites_darkened }` and a 2.0.0 shape exactly as before.

- [ ] **Step 1: Write the failing test** using `createHandler({ store, now })` from `api/darkmode-telemetry.js` with a fake store that records rows: new-shape report returns 204 and stored row has `sites_darkened` equal to `sites`, no `chrome/os/lang/theme/features`; a valid 2.0.0 heartbeat still returns 204 with its old row; extra key, `sites` 10000 and a day two days off each return 400; parity check that `validateUsage` and `validateReport` agree on the accept/reject cases from Task 1.
- [ ] **Step 2: Run** `node tests/usage_backend_test.mjs`. Expected: FAIL (`validateUsage` missing).
- [ ] **Step 3: Implement** `validateUsage` and the handler branch (valid 2.0.0 shape first, else valid new shape, else 400).
- [ ] **Step 4: Write `usage_v2.sql`:** `alter table heartbeats alter column chrome, os, lang, theme, features drop not null`; `alter table heartbeats add column if not exists sites_darkened smallint check (sites_darkened between 0 and 9999)`; view `sites_distribution` (per day, installs by bucket 0, 1-5, 6-20, 21+) with `revoke all ... from anon, authenticated` like `views.sql`. Document in the README that the owner runs it in Supabase, then deploys the handler and `lib/schema.js`.
- [ ] **Step 5: Run** `node tests/usage_backend_test.mjs && node tests/telemetry_backend_test.mjs`. Expected: both pass (the frozen 2.0.0 test is unchanged).
- [ ] **Step 6: Commit** `feat(backend): accept the opt-in usage report and add sites_darkened`.

### Task 3: Usage sender (consent, tally, daily send, delete)

**Files:**
- Create: `src/background/usageSender.js`
- Delete: `src/background/legacyTelemetryCleanup.js`, `tests/legacy_cleanup_test.mjs` (behavior moves here; update `package.json`)
- Test: `tests/usage_sender_test.mjs` (add to chain)

**Interfaces:**
- Consumes: Task 1 exports; `postJson(url, body)` from `network.js`.
- Produces: `INGEST_URL = "https://pshah.fun/api/darkmode-telemetry"`, `DELETE_URL = "https://pshah.fun/api/darkmode-telemetry-delete"`, and `createUsage({ storage, post, now, version, randomUUID })` returning `{ setConsent(enabled: boolean): Promise<{ ok, serverConfirmed? }>, recordDarkApplied({ engine, host }): Promise<void>, status(): Promise<{ enabled: boolean, consentNeeded: "ask"|"reconfirm"|null }>, retryPendingDelete(): Promise<void> }`. `storage` is `{get,set,remove}` over `chrome.storage.local`. State key `telemetryState`: `{ enabled, id, consentVersion: 2, lastSentDay, tally, pendingDeleteIds? }`. Card decision key `usageCardState`: `{ decided: boolean }`.
- Rules: send only when `enabled && consentVersion === 2`; `status().consentNeeded` is `"reconfirm"` for a state with `enabled:true`, an ID and no `consentVersion`, `"ask"` when nothing is enabled and `usageCardState.decided` is not true, else `null`. `setConsent(true)` on a legacy state keeps the ID and sets `consentVersion: 2`; on no state creates a new ID. `setConsent(false)` marks the card decided, stores the ID as pending delete, posts delete, removes confirmed IDs, treats status 400 as confirmed, and never throws. `recordDarkApplied` records engine and site hash, then sends once per UTC day (failure retries on the next event or start, never queues more than the tally).

- [ ] **Step 1: Write the failing tests** (fake storage and `post`): no post and no ID before consent; consent creates one UUID and a second `setConsent(true)` keeps it; `recordDarkApplied` with consent posts exactly one body that passes `validateReport`, and a second call the same day posts nothing; next UTC day posts again and the tally was reset; a failed post (reject or non-ok) is retried on the next call the same day; legacy opted-in state sends nothing, reports `"reconfirm"`, and keeps its ID after `setConsent(true)`; `setConsent(false)` with post failing leaves `pendingDeleteIds` containing the ID and `retryPendingDelete()` later posts delete and clears it; delete with status 400 clears the ID; state on disk never contains a host name; `status()` for each of the three cases; `post` is called only with `INGEST_URL` or `DELETE_URL`.
- [ ] **Step 2: Run** `node tests/usage_sender_test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `createUsage`. Reuse the exclusive-chain, `pendingIds` and flush-delete structure from `git show v2.0.0:src/background/telemetrySender.js`, with `post` replacing `fetchFn`.
- [ ] **Step 4: Run** `node tests/usage_sender_test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(usage): consent state, daily report and delete in the service worker`.

### Task 4: Wire content script and service worker

**Files:**
- Modify: `src/content/index.js` (inside `applyEngine`, where `reportUsageOnce` used to be called), `src/background/serviceWorker.js`
- Test: `tests/usage_wiring_test.mjs` (add to chain)

**Interfaces:**
- Consumes: `createUsage` from Task 3.
- Produces messages: from content script `{ type: "DARK_APPLIED", engine }` once per page load when an engine actually applied dark mode (engine is one of `ENGINES`); from extension pages `{ type: "USAGE_CONSENT", enabled: boolean }` and `{ type: "USAGE_STATUS" }`.

- [ ] **Step 1: Write the failing test** reading the two source files: the service worker no longer imports `legacyTelemetryCleanup`; it builds `createUsage` with `postJson`; it calls `retryPendingDelete()` at start; `DARK_APPLIED` is handled only when `sender.tab` has an http/https URL (host from `new URL(sender.tab.url).hostname`) and the `engine` is valid; `USAGE_CONSENT`/`USAGE_STATUS` are ignored when `sender.tab` is set; the content script sends `DARK_APPLIED` with no host or URL in the message.
- [ ] **Step 2: Run** `node tests/usage_wiring_test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the wiring (replace the legacy cleanup block in `serviceWorker.js`).
- [ ] **Step 4: Run** `node tests/usage_wiring_test.mjs && node tests/side_panel_test.mjs`. Expected: pass.
- [ ] **Step 5: Commit** `feat(usage): content script and worker wiring for the usage report`.

### Task 5: Consent card in the side panel and Options toggle

**Files:**
- Create: `src/popup/usageCard.js` (UMD like `welcomeCard.js`)
- Modify: `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/popup.css`, `src/options/options.html`, `src/options/options.js`, `src/popup/welcomeCard.js` (the "usage report removed" bullet and `DATA_NOTE` must describe the opt-in reports truthfully)
- Test: `tests/usage_card_test.mjs` (add to chain); update `tests/welcome_card_test.mjs` expectations for the new text only

**Interfaces:**
- Consumes: `USAGE_STATUS` and `USAGE_CONSENT` messages (Task 4).
- Produces: `USAGE_COPY.ask` and `USAGE_COPY.reconfirm`, each `{ title, intro, items: string[4], note, yes, no }`; `cardFor(consentNeeded): copy | null`. Copy: `ask` yes/no are `Turn on` / `No thanks`; `reconfirm` are `Keep it on` / `Turn off and delete my data`. The four items state: a random ID for this install not linked to the user's name or account; the date and extension version; which engines were used that day (Auto, CSS, Invert); how many sites dark mode was applied on that day, a number only, never the sites. The note states that site names, page content and typed text are never received and that Options turns it off and deletes the data for the ID.

- [ ] **Step 1: Write the failing test:** `cardFor(null) === null`; both copies contain all four item topics, never the word "anonymous", and the button labels above; `popup.html` has the card elements and loads `usageCard.js` before `popup.js`; `options.html` has `#usage-toggle` and `#usage-delete`... (toggle only: `#usage-toggle`) and a section naming the same four fields; `options.js` sends `USAGE_CONSENT` on change.
- [ ] **Step 2: Run** `node tests/usage_card_test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** The panel asks `USAGE_STATUS` after the welcome card is dismissed (or when there is none) and shows the card for `ask` or `reconfirm`; both buttons send `USAGE_CONSENT` and hide the card. Options shows the toggle reflecting `status().enabled`; turning it off sends `USAGE_CONSENT {enabled:false}` and says data was deleted or will retry. Model the Options markup on `git show v2.0.0:src/options/options.html` (Usage stats section) with the new field list and no example-preview block.
- [ ] **Step 4: Run** `node tests/usage_card_test.mjs && node tests/welcome_card_test.mjs`. Expected: pass.
- [ ] **Step 5: Commit** `feat(panel): usage report consent card and Options toggle`.

### Task 6: Privacy suite, public text and store text

**Files:**
- Modify: `tests/privacy_security_test.mjs` (egress lists: `legacyTelemetryCleanup.js` removed, `usageSender.js` added to scanned files with `postJson` as its only network call; endpoint pins for `INGEST_URL` and `DELETE_URL`), `PRIVACY.md`, `docs/privacy.html`, `TERMS.md`, `docs/{index,about,features,how-it-works,support,terms}.html`, `docs/llms.txt`, `README.md`, `CHANGELOG.md` (the `[2.1.0]` entry), `CHROMEWEBSTORE.md`, `documentation/store-listing-translations.md`
- Test: `node tests/privacy_security_test.mjs` and the full suite

- [ ] **Step 1: Update `privacy_security_test.mjs` first** so it expects the new egress layout and asserts the public text names the usage report fields and that it is opt-in; run it and confirm it FAILS on the old text.
- [ ] **Step 2: Rewrite the public and store text** so both versions are described truthfully: 2.0.0 (opt-in usage report) and 2.1.0 (opt-in usage report with the site count, plus the confirmed broken-site report). `CHROMEWEBSTORE.md`: data usage ticks **User activity** and **Web history**; refresh the listing description from the one the owner pasted, adding the usage report line to Privacy. Mark translations as needing the same update.
- [ ] **Step 3: Run** `node tests/privacy_security_test.mjs && npm test`. Expected: exit 0.
- [ ] **Step 4: Commit** `docs: opt-in usage report in the public and store text` and `test: privacy suite for the usage sender`.

### Final steps (owner-assisted, after the branch review)

1. Owner applies `backend/telemetry/supabase/usage_v2.sql` in Supabase.
2. Copy `backend/telemetry/lib/schema.js` and the new handler logic into `~/Documents/newPortfolio/developer-portfolio/lib/darkmode/{schema,handler-darkmode-telemetry}.js`, push that repo, and verify with a curl of a valid new-shape report (expect 204) and a bad one (expect 400), then delete the test row.
3. Run `npm test`, build `force-dark-mode-v2.1.0.zip` from the merged branch, load it unpacked in real Chrome and check: card shows once, Turn on sends one report, Options off deletes, a 2.0.0 opt-in sees the reconfirm card.
4. Merge to main and push (owner decides when); public docs go live then. Ask before moving the `v2.1.0` tag.
