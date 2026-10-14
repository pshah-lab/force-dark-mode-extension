# Opt-in usage metrics backend

Two Vercel functions plus Supabase SQL. Deploy this directory under `pshah.fun/api/`
(or change the two URLs in `src/background/telemetrySender.js` and the manifest host pattern).

## Setup (owner)

1. Create a Supabase project. In the SQL editor run `supabase/schema.sql`, then `supabase/views.sql`.
2. Deploy `backend/telemetry/` to Vercel with env vars `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   The table has RLS enabled and no policies, so only the service key (used by the functions) can touch it.
3. Schedule `supabase/purge.sql` (pg_cron or a Supabase scheduled function). It deletes heartbeats older
   than 400 days (13 months); change the interval if you want a different retention. Not scheduled automatically.

## Endpoints

- `POST /api/darkmode-telemetry`: JSON heartbeat, at most 2 KB. 405 for other methods, 413/400 for oversize
  or unparsable bodies, 400 if it fails `lib/schema.js` validation or `day` is not a real date within one day
  of the server's UTC date. Upserts on `(install_id, day)`, so repeats are idempotent. Responds 204.
- `POST /api/darkmode-telemetry-delete`: body `{"id": "<uuid>"}`. Deletes every row for that ID. 204.

The functions read only the HTTP method and body. They never read, log or store IP addresses or request
headers. The hosting platform's own request logs may transiently contain IPs; that is outside this code.

`lib/schema.js` is a copy of the allow-lists and `validateHeartbeat` from `src/shared/telemetry.js`
(the deployed project cannot import from the extension). `tests/telemetry_backend_test.mjs` asserts parity.
Change both together.

## Views

`dau`, `wau`, `mau` (distinct installs over 1, 7, 30 days ending each day with data), `new_vs_returning`
(per day, installs first seen that day versus earlier), `retention` (per first-day cohort, D1/D7/D30 share seen
exactly N days later). Retention returns NULL (not 0) for a cohort too young for that horizon (for example D7 for a cohort whose first day was fewer than 7 days ago).
Days with no heartbeats at all produce no row.

Purge caveat: first-seen dates are `min(day)` over rows that still exist. After `purge.sql` runs, installs
older than the retention window appear as new at the oldest surviving date, which inflates `new_vs_returning`
and distorts retention for the oldest cohort (the oldest ~13-month edge only).

## Verification status

The SQL was verified against fixture rows on a throwaway local Postgres 16 cluster. It was NOT verified against
a live Supabase or Vercel deployment, and the Supabase store code in the functions has not been run live.
