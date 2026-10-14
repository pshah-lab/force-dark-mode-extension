# Opt-in anonymous usage metrics: design

Date: 2026-10-14. Target release: 2.1.0. Status: draft for owner review.

## Goal

Give the owner simple, anonymous usage numbers across all installs: active users (DAU/WAU/MAU), new versus returning users, retention (D1/D7/D30), and which engines, themes and features are used. Users opt in; nothing is sent otherwise.

## Principles

- Off by default. Nothing is sent, and no ID exists, until the user clicks Yes.
- Simple metrics only. We never track what the user reads or watches: no hostnames, URLs, page titles, page content, document content, custom CSS, custom theme names or colours.
- Everything sent is drawn from small fixed allow-lists, enforced in the extension and again on the server.
- The user can see exactly what is sent, turn it off, and delete their data at any time.

## Consent UX

- The popup shows a one-time card after a few uses of the extension. The card says, in plain language:
  - **We count:** that you used the extension today, which engine (Auto, CSS, Invert) and built-in theme you use, whether you used the viewer, theme editor, custom CSS or a site pack, and your extension version, Chrome version, OS family and language, plus a random ID for this install (not linked to you) used to tell days apart.
  - **We never see:** the sites you visit, what you read or watch, your documents, or anything you type.
  - Buttons: Yes, share stats / No thanks. No is remembered and the card never returns.
- Options page: the same toggle, a preview (when off: a labelled example report with a placeholder id, nothing stored or sent; when on: today's report if sent now), and a **Delete my data** button. The same We count / We never see copy appears in the Options card, and beside the toggle: "Turning this off stops reports and discards your random ID. To remove reports already sent, click Delete my data first."

## Data sent

One heartbeat per UTC day, sent at the first use of the extension that day (so a user who never returns is still counted for that day), only if opted in. Engines and features are booleans for what had been used at that moment; there is no `alarms` permission, so no end-of-day tally.

```
{ id, day, version, env: { chrome, os, lang },
  engines: { auto, css, invert },     // booleans: used so far today
  theme: "<builtin id>" | "custom",   // last seen today
  features: { viewer, editor, customCss, sitePack } }  // booleans
```

- `id`: random UUID created at opt-in, kept in `chrome.storage.local` (never synced, so each device counts separately). Opting out deletes it.
- The server stores `(id, day, version, env, counters)`. Our server function does not store IP addresses; the hosting platform's request logs may transiently contain them. Rows older than 13 months are purged (`backend/telemetry/supabase/purge.sql`). **Delete my data** posts the ID to the delete endpoint before telemetry is turned off, so the server rows are removed.

## Components

1. `src/shared/telemetry.js`: pure module. Allow-lists, `buildHeartbeat`, `validateHeartbeat`. No `chrome.*` calls.
2. `src/background/telemetrySender.js`, wired from `serviceWorker.js`: on the first usage event of a UTC day, if opted in, POSTs the heartbeat. A failed send is retried on the next usage event the same day; nothing is queued across days.
3. `src/popup/` consent card; `src/options/` toggle, payload preview, Delete my data.
4. Backend (Vercel + Supabase), in its own directory:
   - `POST /api/ingest`: re-validates against the allow-lists, rejects unknown keys or values, upserts on `(id, day)` (so one row per ID per day) and rejects days more than one day from the server date.
   - `POST /api/delete`: removes all rows for an ID.
   - SQL views for DAU/WAU/MAU, new versus returning, D1/D7/D30 retention. No dashboard UI in this release.

## Privacy and policy changes

- `manifest.json`: unchanged, with no host permissions (superseded by Ruling 13: a host permission would disable the extension for existing users until they re-approve); the backend instead answers CORS with a static `Access-Control-Allow-Origin: chrome-extension://kmhhphbakbhohiohagkhhgdgfbplkfke` and handles the OPTIONS preflight.
- `PRIVACY.md` §1 changes from "zero telemetry" to "off by default, opt-in, anonymous", with the exact field list. CWS data disclosures, `CHANGELOG.md` and the privacy documentation under `documentation/privacy/` are updated to match.
- `tests/privacy_security_test.mjs`: from "no network calls anywhere" to: exactly one egress file; only to the one origin; only after consent; payload keys must be in the allow-list. The strictness stays; the single exception is explicit.

## Testing (TDD)

- Unit: payload builder and allow-list rejection (hostnames, URLs, unknown keys, custom theme names all fail).
- Service worker: nothing sent before opt-in or after opt-out; at most one send per UTC day; no send on an unused day; retry behaviour.
- Consent: choice persists; No is never re-asked; opt-out deletes the ID; Delete my data turns stats off at once, keeps the ID only as `pendingDeleteIds` until the delete endpoint returns 2xx (retried on the next Delete click and on worker start; Ruling 14), then clears local state; a later opt-in gets a new ID and never re-uses a pending one.
- Backend: ingest accepts valid and rejects invalid payloads, upserts idempotently, and our function does not store IP addresses (the hosting platform's request logs may transiently contain them); the SQL views are checked against fixture rows.

## Out of scope

Hostnames or any per-site data, error reporting, A/B tests, a dashboard UI, and sending from content scripts or the popup (the service worker is the only sender).

## Owner actions (not done by Claude)

Create the Supabase project and deploy the Vercel functions, edit the CWS data disclosures, push, tag and upload.
