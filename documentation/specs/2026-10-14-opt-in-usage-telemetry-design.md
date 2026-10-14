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
  - **We count:** that you used the extension today, which engine (Auto, CSS, Invert) and built-in theme you use, whether you used the viewer, theme editor, custom CSS or a site pack, and your extension version, Chrome version, OS family and language.
  - **We never see:** the sites you visit, what you read or watch, your documents, or anything you type.
  - Buttons: Yes, share stats / No thanks. No is remembered and the card never returns.
- Options page: the same toggle, a live preview of today's exact payload, and a **Delete my data** button.

## Data sent

One heartbeat per UTC day, only on a day the extension was used, only if opted in.

```
{ id, day, version, env: { chrome, os, lang },
  engines: { auto, css, invert },     // apply counts
  theme: "<builtin id>" | "custom",
  features: { viewer, editor, customCss, sitePack } }  // booleans
```

- `id`: random UUID created at opt-in, kept in `chrome.storage.local` (never synced, so each device counts separately). Opting out deletes it.
- The server stores `(id, day, version, env, counters)` and never stores the IP address.

## Components

1. `src/shared/telemetry.js`: pure module. Allow-lists, `buildHeartbeat`, `validateHeartbeat`. No `chrome.*` calls.
2. `src/background/serviceWorker.js`: tallies counters into `chrome.storage.local`; once per UTC day, if opted in and active, POSTs the heartbeat. A failed send is retried on the next tick; at most one day is held.
3. `src/popup/` consent card; `src/options/` toggle, payload preview, Delete my data.
4. Backend (Vercel + Supabase), in its own directory:
   - `POST /api/ingest`: re-validates against the allow-lists, rejects unknown keys or values, rate-limits per ID, upserts on `(id, day)`.
   - `POST /api/delete`: removes all rows for an ID.
   - SQL views for DAU/WAU/MAU, new versus returning, D1/D7/D30 retention. No dashboard UI in this release.

## Privacy and policy changes

- `manifest.json`: `host_permissions` for the ingest origin only.
- `PRIVACY.md` §1 changes from "zero telemetry" to "off by default, opt-in, anonymous", with the exact field list. CWS data disclosures, `CHANGELOG.md` and the privacy documentation under `documentation/privacy/` are updated to match.
- `tests/privacy_security_test.mjs`: from "no network calls anywhere" to: exactly one egress file; only to the one origin; only after consent; payload keys must be in the allow-list. The strictness stays; the single exception is explicit.

## Testing (TDD)

- Unit: payload builder and allow-list rejection (hostnames, URLs, unknown keys, custom theme names all fail).
- Service worker: nothing sent before opt-in or after opt-out; at most one send per UTC day; no send on an unused day; retry behaviour.
- Consent: choice persists; No is never re-asked; opt-out deletes the ID; Delete my data calls the delete endpoint then clears local state.
- Backend: ingest accepts valid and rejects invalid payloads, upserts idempotently, and never stores the IP; the SQL views are checked against fixture rows.

## Out of scope

Hostnames or any per-site data, error reporting, A/B tests, a dashboard UI, and sending from content scripts or the popup (the service worker is the only sender).

## Owner actions (not done by Claude)

Create the Supabase project and deploy the Vercel functions, edit the CWS data disclosures, push, tag and upload.
