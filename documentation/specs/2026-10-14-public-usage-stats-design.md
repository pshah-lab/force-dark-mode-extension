# Public aggregate usage statistics: design

Date: 2026-10-14. Target release: 2.0.0 (ships with the opt-in usage statistics). Builds on `2026-10-14-opt-in-usage-telemetry-design.md`.

## Goal

Publish the combined opt-in usage numbers at darkmode.pshah.fun/stats.html. Only aggregates are public: never IDs, rows, per-install series or anything an individual could be picked out of.

## What is published (agreed with the owner)

Active users (DAU trend, WAU, MAU), new versus returning installs and D1/D7/D30 retention, engine/theme/feature shares, and environment mix (OS family, Chrome major version, UI language). The page states that the numbers count opted-in installs only and therefore understate real use.

## Disclosure control

- Minimum group size `MIN_GROUP = 10` distinct installs. Any published count or share that rests on fewer than 10 installs is `null` ("fewer than 10" on the page).
- If MAU < 10, every section except `active` is `null` ("not enough data yet").
- Mutually exclusive categories (theme, os, chrome, lang): groups under 10 are merged into `"other"`; if `"other"` is still under 10 it is merged into the smallest remaining group (complementary suppression), so no hidden group can be derived by subtraction. Non-exclusive categories (engines, features) are `null` per item under 10; for engines and features, an item is also null when fewer than 10 active installs did NOT use it.
- Windows: 30 days ending yesterday (UTC). An install counts toward a flag if any of its heartbeats in the window has it true; its theme and environment are from its most recent heartbeat in the window.
- Shares are the number of installs in the group divided by MAU installs, rounded to a whole percent, published as integers 0-100.
- Residual risks (documented, accepted): the window is rolling, so comparing consecutive days' published numbers can reveal changes smaller than 10 in a published group; MAU - WAU can be under 10; and anyone can inflate a rare group with fake installs until it crosses the threshold.
- Retention pools cohorts first seen in the last 90 days: dN = installs seen exactly N days after their first day, over all cohort installs whose Nth day is in the past; published only if the pooled denominator is at least 10, as an integer percent.

## Endpoint

`GET https://pshah.fun/api/darkmode-stats` (file `backend/telemetry/api/darkmode-stats.js`), OPTIONS preflight supported, other methods 405.
- Static CORS: `Access-Control-Allow-Origin: https://darkmode.pshah.fun` (exported constant), `Allow-Methods: GET, OPTIONS`, `Vary: Origin`; no request header is read.
- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=600`.
- A SQL function `public_stats()` (file `backend/telemetry/supabase/public_stats.sql`) builds the document; the handler validates it again with `validatePublicStats` before serving and answers 500 with no body detail if validation fails (fail closed).

JSON shape (exact keys; `n` = integer >= 10 or null; `p` = integer 0-100 or null):

```
{ generatedAt: ISO string, minGroup: 10, windowDays: 30,
  active: { dau: [{ day: "YYYY-MM-DD", count: n }] (30 entries, oldest first), wau: n, mau: n },
  newVsReturning: null | { weeks: [{ weekStart: "YYYY-MM-DD", new: n, returning: n }] (up to 4) },
  retention: null | { d1: p, d7: p, d30: p },
  engines: null | { auto: p, css: p, invert: p },
  themes: null | { "<builtin id>": p, ..., other: p },
  features: null | { viewer: p, editor: p, customCss: p, sitePack: p },
  os: null | { "<os family>": p, ..., other: p },
  chrome: null | { "<major>": p, ..., other: p },
  lang: null | { "<code>": p, ..., other: p } }
```

## Website

New page `docs/stats.html` ("Usage statistics"), script `docs/js/stats.js`, linked from the footer of every page and listed in the sitemap/SEO tests the same way other pages are. The script fetches the endpoint once, renders bars and one SVG trend line, writes with `textContent` and DOM APIs only (no innerHTML), shows "fewer than 10" for nulls, "Statistics are temporarily unavailable" on failure, and states plainly: "These numbers count only people who opted in to anonymous usage statistics, so they understate real use. Groups of fewer than 10 installs are never shown." The existing website test that allows only two URLs in `docs/js/main.js` is extended so only `stats.js` may reference the stats URL.

## Wording and extension text

`PRIVACY.md`, `docs/privacy.html`, `CHROMEWEBSTORE.md`, `documentation/privacy/*`, the compliance report, `README.md`, `CHANGELOG.md` (2.0.0 section) and `backend/telemetry/README.md` say that combined totals (never individual reports or IDs) are published at darkmode.pshah.fun/stats.html and groups under 10 installs are hidden; "never shared with anyone else" becomes "only combined totals are published". The popup consent card and the Options Usage stats card each get one added sentence: "Only combined totals are published at darkmode.pshah.fun/stats.html." The extension zip is rebuilt afterwards.

## Out of scope

Raw data export, per-version or per-OS time series, live (uncached) numbers, any cookie or analytics on the stats page, deploying the endpoint, pushing or uploading.
