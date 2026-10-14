# Public Aggregate Usage Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish combined opt-in usage numbers (active users, new/returning, retention, engine/theme/feature shares, environment mix) at darkmode.pshah.fun/stats.html with small-group suppression.

**Architecture:** A SQL function builds suppressed aggregates; a read-only Vercel handler validates and serves them with fixed CORS and caching; a static page fetches and renders them with DOM APIs only. Policy text, consent text and tests are updated to match.

**Tech Stack:** Node assert tests (`tests/*.mjs`), Postgres SQL (Supabase), Vercel function, static HTML/JS.

**Spec:** `documentation/specs/2026-10-14-public-usage-stats-design.md`

## Global Constraints

- `MIN_GROUP = 10`: any published count or share resting on fewer than 10 installs is `null`; MAU < 10 hides every section except `active`; exclusive categories merge small groups into `"other"` with complementary suppression; an engine/feature share is also null when fewer than 10 active installs did NOT use it (spec "Disclosure control").
- JSON shape exactly as in the spec; shares are integers 0-100; window = 30 days ending yesterday (UTC).
- The endpoint exposes no ID, row or per-install series, reads no request header, sets static CORS `https://darkmode.pshah.fun`, and fails closed (500, no detail) if `validatePublicStats` rejects the document.
- Website script writes with `textContent`/DOM APIs only; no cookies or analytics on the stats page; the stats URL appears only in `docs/js/stats.js`.
- Extension text change is exactly one added sentence: "Only combined totals are published at darkmode.pshah.fun/stats.html." in the popup consent card and the Options Usage stats card; extension permissions unchanged; no version bump.
- Never weaken an existing test. `npm test` stays green after every task. Do not push, deploy or upload. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Differencing: a group of 3 hidden by suppression recoverable from total minus the published rest (exclusive categories, MAU vs weeks).
- A day or week with fewer than 10 installs in the trend.
- Brand-new deployment with 0 rows: valid document, all sections null, no division by zero.
- Handler fed a document containing a UUID-looking string or an unknown key: must refuse.
- Stats page when the endpoint is down, returns malformed JSON, or contains HTML in a string.

---

### Task 1: SQL function and stats endpoint

**Files:**
- Create: `backend/telemetry/supabase/public_stats.sql`, `backend/telemetry/api/darkmode-stats.js`, `backend/telemetry/lib/publicStats.js`
- Modify: `backend/telemetry/lib/cors.js` (add exported `STATS_ALLOWED_ORIGIN`), `backend/telemetry/README.md`, `package.json` (`test:telemetrystats`, chained into `test` once)
- Test: `tests/telemetry_stats_test.mjs`

**Interfaces:**
- Produces `lib/publicStats.js`: `MIN_GROUP = 10`; `validatePublicStats(doc: unknown): boolean` (exact key sets per the spec shape, `generatedAt` ISO, every `n` null or integer >= 10, every `p` null or integer 0-100, `dau` has exactly 30 entries with valid days, no string value anywhere that matches a UUID or contains `<`, `http`); `suppressFixture(rows)` is NOT required (suppression lives in SQL).
- Produces `api/darkmode-stats.js`: `createStatsHandler({ store, now })` with `store.getPublicStats(): Promise<object>`; default export wires the Supabase store lazily like the other handlers (calls the SQL function via `rpc("public_stats")`). GET -> 200 JSON + `Cache-Control: public, s-maxage=3600, stale-while-revalidate=600` + static CORS; OPTIONS -> 204 with CORS (`Allow-Methods: GET, OPTIONS`); other methods 405 with `Allow: GET, OPTIONS`; store error or validation failure -> 500, empty body.
- Produces `public_stats()` SQL function (`stable`, returns `jsonb`, revoke execute from public/anon/authenticated) implementing the spec's disclosure control.

- [ ] **Step 1: Write failing tests** in `tests/telemetry_stats_test.mjs`: `validatePublicStats` accepts a full valid document and an all-null (empty) document; rejects `count: 9`, `count: 10.5`, a share of 101, an unknown extra key, a missing key, 29 dau entries, a string value containing a UUID, a string containing `<script>`; handler tests with a fake store (200 + headers, OPTIONS 204, POST 405 with Allow, store throws -> 500 empty body, invalid document from store -> 500 empty body and never serves it, request headers are never read: pass a `req` whose `headers` getter throws).
- [ ] **Step 2: Run** `node tests/telemetry_stats_test.mjs`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `lib/publicStats.js` and `api/darkmode-stats.js` (module-level default handler like the other handlers; CORS constants from `lib/cors.js`).
- [ ] **Step 4: Write `public_stats.sql`** and verify it on a THROWAWAY local Postgres 16 cluster (temp dir, non-default port, deleted afterwards; no existing instance, no network services): fixture rows covering (a) 0 rows, (b) MAU 9 (everything but `active` null), (c) a realistic 60-install set where one theme has 4 installs (merged into other), one OS has 3 (merged), an engine has 7 (null), and one day has 8 installs (dau count null), (d) cohorts for retention with pooled denominator under and over 10. Record fixture, commands and outputs in the report; the SQL output of case (c) must pass `validatePublicStats` (pipe it through a node check) and must show no hidden group derivable by subtraction.
- [ ] **Step 5: Run** the stats test and `npm test`. Expected: green.
- [ ] **Step 6: Commit** `feat(stats): add public aggregate statistics endpoint and SQL function`.

### Task 2: Stats page on the website

**Files:**
- Create: `docs/stats.html`, `docs/js/stats.js`
- Modify: every `docs/*.html` and `docs/blog/*.html` footer (add a "Usage statistics" link under Support & Legal, `stats.html` or `../stats.html` as the page's relative base requires), `docs/sitemap.xml` and any SEO list the existing SEO test requires (read `tests/seo_test.mjs`), `tests/privacy_security_test.mjs` website URL allow-list test (only `docs/js/stats.js` may reference `https://pshah.fun/api/darkmode-stats`; `docs/js/main.js` rule unchanged)
- Test: `tests/stats_page_test.mjs` (add to `package.json` as `test:statspage`, chained once)

**Interfaces:**
- Consumes: the JSON document shape from the spec.
- Produces `docs/js/stats.js`: `renderStats(doc, root)` (pure DOM, exported on `window.FdmStats` for tests via a vm/fake DOM like `tests/helpers/fakeDom.mjs`) and the page bootstrap that fetches once and calls it.

- [ ] **Step 1: Write failing tests**: fake-DOM rendering of a full document (counts, bars with percent widths set via `style.width` only after clamping to 0-100), nulls rendered as "fewer than 10", an all-null document renders "Not enough data yet" and no chart, hostile strings (`<img onerror>`) in `themes`/`lang` keys appear as inert text; fetch failure and malformed JSON render "Statistics are temporarily unavailable" and throw nothing; static checks: `stats.js` contains no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, no cookie/localStorage use; `stats.html` has the exact sentence "These numbers count only people who opted in to anonymous usage statistics, so they understate real use. Groups of fewer than 10 installs are never shown.", loads no third-party script, has the site's standard head/footer pattern, and every other page's footer links to the stats page.
- [ ] **Step 2: Run** `node tests/stats_page_test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the page and script following the existing page patterns (read `docs/support.html`, `docs/js/main.js`); SVG trend line built with `createElementNS`.
- [ ] **Step 4: Run** the page test and `npm test`. Expected: green.
- [ ] **Step 5: Commit** `feat(site): add public usage statistics page`.

### Task 3: Wording, consent text and package

**Files:**
- Modify: `src/popup/popup.html`, `src/options/options.html`, `tests/telemetry_prompt_test.mjs` (exact-copy tests), `tests/privacy_security_test.mjs` (policy-text tests), `PRIVACY.md`, `docs/privacy.html`, `CHROMEWEBSTORE.md`, `documentation/privacy/*.md`, `documentation/ThemeSwitcher_Privacy_Compliance_Report.md`, `README.md`, `CHANGELOG.md` (2.0.0 section, under Added), `backend/telemetry/README.md`, `documentation/store-listing-translations.md` (one clause in each language's usage-statistics bullet, machine-drafted, flagged)

- [ ] **Step 1: Update tests first (RED)**: the card and Options copy tests require the new sentence verbatim in `popup.html` and `options.html`; policy tests require that PRIVACY.md, docs/privacy.html and CHROMEWEBSTORE.md each contain "combined totals", "stats.html" and "fewer than 10", and none contains "never shared with anyone else" or "never sold or shared with anyone else" unqualified (replace with "only combined totals are published; individual reports and IDs are never shared"); `docs/privacy.html` must still list every heartbeat field.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL on the new assertions only.
- [ ] **Step 3: Edit** the extension HTML and all documents listed. Everywhere the docs say statistics are "used only to understand how many people use the extension", add that combined totals are published at darkmode.pshah.fun/stats.html and groups under 10 installs are hidden.
- [ ] **Step 4: Run** `npm test`. Expected: green.
- [ ] **Step 5: Rebuild** `force-dark-mode-v2.0.0.zip` with `bash package-extension.sh` from the worktree (the zip is untracked; copy the result next to the main checkout's zip only if the owner approves: leave it in the worktree and report its size and the two changed files inside it).
- [ ] **Step 6: Commit** `docs(privacy): state that combined usage totals are published`.
