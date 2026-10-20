# Opt-in usage report in 2.1.0: design

Date: 2026-10-20. Status: awaiting owner review. Version stays 2.1.0 (not yet submitted to the Web Store).
Builds on `2026-10-17-side-panel-and-site-report-design.md` and restores, with a fix and one new field, the
2.0.0 heartbeat (`2026-10-14-opt-in-usage-telemetry-design.md`) that 2.1.0 had removed.

## Intent

The owner wants to measure returning users, DAU, WAU and retention themselves, because the Web Store
dashboard only gives installs, uninstalls and a rolling active-user number. Constraints from the owner:
**off by default, opt-in only, "we are not taking any risks"**; the consent text states plainly what is
collected and never calls it "anonymous"; the broken-site report stays as designed.

## Decisions

1. Usage reporting is **opt-in and off by default**. Nothing is sent, and no ID exists, until the user turns it on.
2. One report per UTC day, sent from the service worker through `network.js` only.
3. The report contains exactly these fields (the code enforces the list and rejects anything else):
   - `id`: random UUID generated on opt-in
   - `day`: UTC date
   - `version`: extension version
   - `used`: whether dark mode was active on any page that day (boolean)
   - `engines`: which of `auto`, `css`, `invert` were used that day (booleans)
   - `sites`: integer 0..9999, the number of distinct sites where dark mode was applied that day
   - Never sent: site names or addresses, page content, anything typed, IP-derived data stored by us.
4. The Chrome Web Store data-usage form ticks **User activity** and **Web history** (domain in broken-site reports).

## Extension

- Restore `src/shared/telemetry.js` (allow-list, tally, validation) and `src/background/telemetrySender.js`
  from tag `v2.0.0`, adapted to the 2.1.0 layout. Fix the 2.0.0 bug: the content script sent
  `{type:"USAGE", engine}`; the sanitiser dropped it because of the extra `type` key. The handler strips `type`
  before sanitising, with a regression test.
- **Site tally:** the content script tells the service worker a page was darkened. The worker keeps a per-day
  set of 32-bit hashes of hostnames in `chrome.storage.local` (no readable site list on disk) and sends only the
  set size. The set is cleared when the day rolls over and after a successful send.
- **Consent card** in the side panel (reuses the welcome-card slot, shown once after the welcome card). Exact
  copy lists the fields above, says "Nothing is sent unless you turn this on", and offers **Turn on** and
  **No thanks**. "No thanks" is remembered and never re-asked.
- **Options toggle** "Usage report": on/off at any time. Turning it **off** stops sending, calls the existing
  delete endpoint for the ID, and removes the ID. Turning it on creates a new ID.
- **People who opted in on 2.0.0:** their old state is kept, but nothing new is sent until they see the same
  card once and confirm, because the site count is new data. **Turn on** keeps their ID. **No thanks** deletes
  their data via the delete endpoint. This replaces `legacyTelemetryCleanup.js`, which always deleted.
- **People who declined or never answered on 2.0.0:** off, and shown the same one-time card.
- `network.js` stays the only file calling `fetch`; `privacy_security_test.mjs` egress lists are updated.

## Backend (reuses the deployed 2.0.0 pieces)

- `POST /api/darkmode-telemetry` accepts the new optional integer `sites` (0..9999). 2.0.0 clients, which never
  send it, keep working. The strict "reject unknown fields" rule stays for everything else.
- Migration: add nullable `sites_darkened smallint` to the daily heartbeat table. Owner applies it in Supabase.
- `POST /api/darkmode-telemetry-delete` is unchanged and now serves "turn off" and "No thanks".
- Owner-only SQL views (`usage_dau`, `usage_wau_mau`, `usage_new_vs_returning`, `usage_retention` D1/D7/D30,
  `usage_versions`, `usage_sites_distribution`). Existing purge job keeps the 13-month limit.
- The public stats page and its view are not changed; it is described as 2.0.0 opt-in data and may be retired later.
- The portfolio repo copy of the schema and handler must get the same change (owner pushes it).

## Docs and store text (prepared on the branch, pushed only at release)

`PRIVACY.md`, `docs/privacy.html`, `TERMS.md`, site taglines, `CHROMEWEBSTORE.md`, `CHANGELOG.md`,
`docs/llms.txt`, README and the listing description: both opt-in reports (usage and broken-site) described
accurately, versions 2.0.0 and 2.1.0 both covered. Public pages deploy from main, so they merge at release.

## Release mechanics

The `v2.1.0` tag already exists on the pushed pre-change code. It is not moved without the owner's say-so.
A new `force-dark-mode-v2.1.0.zip` is built from the branch once merged.

## Testing (TDD)

Allow-list validation rejects extra and out-of-range fields; daily gate (one send per UTC day, retry next
start on failure); tally set and hashing; `USAGE` type regression; consent states (new, 2.0.0 opted-in,
2.0.0 declined); off deletes and clears; no send before consent; backend accepts and bounds `sites`;
egress and privacy suites updated; full `npm test` green.

## Out of scope

Public stats for the new report, per-site data, automatic breakage detection, on-by-default reporting.
