# Backend: broken-site reports (and the frozen 2.0.x usage endpoints)

**Current (2.1.0+): `POST /api/darkmode-report`.** The extension sends one report only when the user confirms it:
`{ site, engine, theme, version }`, where `site` is the domain only (no path, query or port), `theme` is a built-in
theme id, `default` or `custom`, and nothing else. There is no install ID. Setup: run `supabase/site_reports.sql`
(table, `report_site()` function used by the endpoint, owner-only view `top_reported_sites`), schedule its purge
statement with pg_cron (13 months), and deploy `api/darkmode-report.js` with `lib/reportSchema.js` next to the other
functions. `lib/reportSchema.js` is a copy of the rules in `src/shared/siteReport.js`;
`tests/site_report_backend_test.mjs` asserts they agree, so change both together.

**Opt-in usage report (2.1.0): `POST /api/darkmode-telemetry`.** Sent at most once a day, only after the user turns it
on in the side panel card or Options. Body: `{ id, day, version, engines: {auto, css, invert}, sites }` where `id` is a
random install ID, `engines` says which engines were used that day and `sites` is how many sites dark mode was applied
on (a count, never the sites). The endpoint still accepts the unchanged 2.0.x heartbeat. Setup: run
`supabase/usage_v2.sql` (makes the 2.0.x device columns optional, adds `sites_darkened` and the owner-only view
`sites_distribution`), then re-run `supabase/public_stats.sql` (run `usage_v2.sql` before `public_stats.sql`: the public totals
now count 2.0.x heartbeats only and never publish 2.1.0 reports), then deploy the updated `api/darkmode-telemetry.js` and `lib/schema.js`. `validateUsage` in
`lib/schema.js` is a copy of `validateReport` in `src/shared/usageReport.js`; `tests/usage_backend_test.mjs` asserts they
agree, so change both together. Turning the report off calls `POST /api/darkmode-telemetry-delete`, which removes every
row for that ID. The existing views (`dau`, `wau`, `mau`, `new_vs_returning`, `retention`) cover both report shapes.

The rest of this file describes the 2.0.x usage heartbeat. The extension no longer sends it, but 2.0.x clients still
do and may still call the delete endpoint, so those endpoints stay deployed until they are retired.

## Opt-in usage metrics backend (2.0.x, frozen)

Three Vercel functions plus Supabase SQL. The `api/` and `lib/` folders must be deployed inside the
existing Vercel project that serves `pshah.fun`: copy them into that project's `api/` and `lib/` folders
and add `@supabase/supabase-js` to that project's dependencies. A separate Vercel project cannot also
claim the `pshah.fun` domain. (If you host the endpoints elsewhere, change the two URLs in
`src/background/telemetrySender.js`, which `tests/privacy_security_test.mjs` pins.)

## CORS and the extension ID

The extension declares no host permissions (so updating never disables it pending re-approval). Instead
the two ingest/delete functions answer CORS themselves, from `lib/cors.js`: every response, including errors,
carries a STATIC `Access-Control-Allow-Origin: chrome-extension://kmhhphbakbhohiohagkhhgdgfbplkfke`, plus
`Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`,
`Access-Control-Max-Age` and `Vary: Origin`, and an `OPTIONS` preflight gets 204 without touching the
store. No request header (not even `Origin`) is read. The third function, `darkmode-stats`, uses its own static
origin `https://darkmode.pshah.fun` (`STATS_ALLOWED_ORIGIN`, see Endpoints).

The ID is defined once, as `EXTENSION_ID` in `lib/cors.js`. If the Chrome Web Store ID of the published
extension differs from `kmhhphbakbhohiohagkhhgdgfbplkfke`, or you test an unpacked development build
(which gets a different ID), every telemetry request fails CORS (nothing is sent, nothing breaks for the
user) until `EXTENSION_ID` is changed and redeployed. Confirm the ID on the store dashboard before release.

## Setup (owner)

1. Create a Supabase project. In the SQL editor run `supabase/schema.sql`, then `supabase/views.sql`, then
   `supabase/public_stats.sql` (the public statistics function; re-run it whenever that file changes).
2. Copy `api/` and `lib/` into the `pshah.fun` Vercel project (see above) and set env vars `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` in that project.
   The table has RLS enabled and no policies, so only the service key (used by the functions) can touch it.
3. Schedule `supabase/purge.sql` (pg_cron or a Supabase scheduled function). It deletes heartbeats older
   than 400 days (13 months); change the interval if you want a different retention. Not scheduled automatically.

## Endpoints

- `OPTIONS` on either path: CORS preflight, 204, no body read and no store access.
- `POST /api/darkmode-telemetry`: JSON heartbeat, at most 2 KB. 405 for other methods, 413/400 for oversize
  or unparsable bodies, 400 if it fails `lib/schema.js` validation or `day` is not a real date within one day
  of the server's UTC date. Upserts on `(install_id, day)`, so repeats are idempotent. Responds 204.
- `POST /api/darkmode-telemetry-delete`: body `{"id": "<uuid>"}`. Deletes every row for that ID. 204.
- `GET /api/darkmode-stats`: the public combined statistics shown at darkmode.pshah.fun/stats.html (see below).
  `OPTIONS` gets 204; other methods 405 with `Allow: GET, OPTIONS`. Its CORS is separate from the extension's:
  a static `Access-Control-Allow-Origin: https://darkmode.pshah.fun` (`STATS_ALLOWED_ORIGIN` in `lib/cors.js`),
  `Access-Control-Allow-Methods: GET, OPTIONS`, `Vary: Origin`. A 200 carries
  `Cache-Control: public, s-maxage=3600, stale-while-revalidate=600`, so the database is queried about once an hour.

The functions read only the HTTP method and body (the stats function reads only the method). They never read, log or store IP addresses or request
headers. The hosting platform's own request logs may transiently contain IPs and the browser's User-Agent and Accept-Language headers; that is outside this code.

`lib/schema.js` is a copy of the allow-lists and `validateHeartbeat` from `src/shared/telemetry.js`
(the deployed project cannot import from the extension). `tests/telemetry_backend_test.mjs` asserts parity.
Change both together.

## Public statistics

Only combined totals are published at darkmode.pshah.fun/stats.html (the same wording the privacy policy uses); individual reports and random IDs are never published, and groups of fewer than 10 installs are never shown.

`supabase/public_stats.sql` defines `public_stats()`, which returns the whole public document as JSON (shape in
`documentation/specs/2026-10-14-public-usage-stats-design.md`). Execute is revoked from `public`, `anon` and
`authenticated`, so only the service key used by the function can call it. `api/darkmode-stats.js` checks the
document again with `validatePublicStats` (`lib/publicStats.js`) and answers an empty 500 rather than serve anything
that fails the check (a small count, an unknown key, an ID-like string, markup or a link).

What it publishes and how small groups are hidden, in plain terms:

- Only totals. Never install IDs, rows or any one install's history.
- Period: the 30 days ending yesterday (UTC). Heartbeats dated today are ignored.
- A number that rests on fewer than 10 installs is replaced by `null` (the page shows "fewer than 10").
- If fewer than 10 installs were active in the 30 days, everything except the active-user counts is `null`.
- Theme, OS, Chrome version and language: each install counts once, by its most recent heartbeat in the period.
  Any value used by fewer than 10 installs is put into "other". If "other" would then hold between 1 and 9
  installs, the smallest named value is folded into "other" too, so no hidden value can be worked out by
  subtracting the published ones from the total.
- Engines and features: an install counts if any heartbeat in the period had the flag on; a flag is `null` if
  fewer than 10 installs used it OR fewer than 10 active installs did not use it (otherwise the few non-users
  could be worked out as the total minus the users).
- Shares are whole percentages of the 30-day active installs (they may add up to 99-101 because of rounding).
- Daily actives: 30 days, each `null` under 10. Weekly (last 7 days) and monthly (30 days) actives: `null` under 10.
- New vs returning: up to 4 most recent complete Monday-Sunday weeks. If either number of a week is under 10, both
  are `null`, because new + returning can equal the published weekly actives.
- Retention: installs first seen in the last 90 days, pooled; D1/D7/D30 is the share seen again exactly 1/7/30
  days after their first day, counting only installs whose day N has passed. Published only if at least 10 installs
  are counted.

Residual risks (documented, accepted): the window is rolling, so comparing consecutive days' published numbers can reveal changes smaller than 10 in a published group; MAU - WAU can be under 10; and anyone can inflate a rare group with fake installs until it crosses the threshold.

## Views

`dau`, `wau`, `mau` (distinct installs over 1, 7, 30 days ending each day with data), `new_vs_returning`
(per day, installs first seen that day versus earlier), `retention` (per first-day cohort, D1/D7/D30 share seen
exactly N days later). Retention returns NULL (not 0) for a cohort too young for that horizon (for example D7 for a cohort whose first day was fewer than 7 days ago).
Days with no heartbeats at all produce no row.

Purge caveat: first-seen dates are `min(day)` over rows that still exist. After `purge.sql` runs, installs
older than the retention window appear as new at the oldest surviving date, which inflates `new_vs_returning`
and distorts retention for the oldest cohort (the oldest ~13-month edge only).

## Verification status

The SQL (including `public_stats.sql`) was verified against fixture rows on a throwaway local Postgres 16 cluster. It was NOT verified against
a live Supabase or Vercel deployment, and the Supabase store code in the functions has not been run live.
