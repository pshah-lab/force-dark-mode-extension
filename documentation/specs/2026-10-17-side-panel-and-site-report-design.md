# Side panel and broken-site report: design

Date: 2026-10-17. Status: awaiting owner review. Replaces the opt-in daily usage heartbeat of 2.0.0
(`2026-10-14-opt-in-usage-telemetry-design.md`).

## Decisions (from the owner)

1. The toolbar icon opens a **side panel**, not a popup.
2. The only data the extension ever sends is a **broken-site report**, started by a button the user clicks.
3. The consent text says plainly what is sent, including the site's domain. It never calls the data "anonymous"
   unless that is literally true, and it never hides the domain.
4. The daily usage heartbeat, the random install ID and the Options "Usage stats" card are **removed**.

## Side panel

- `manifest.json`: add permission `sidePanel`, add `side_panel.default_path`, remove `action.default_popup`
  (keep `action` so the icon stays), add `minimum_chrome_version` 114. No host permissions are added.
- The service worker calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` on install and on
  every worker start.
- The page stays `src/popup/popup.html` (directory name kept to avoid churn; it is now the panel page). Its
  layout becomes fluid (no fixed popup width).
- A popup closes when focus leaves; a side panel does not. The panel must **follow the active tab**, and because Chrome hides a tab's address from an extension that only has `activeTab` once the user switches tabs, it asks the page's content script (`PAGE_INFO`) when the address is missing: it re-renders
  on `tabs.onActivated`, on `tabs.onUpdated` for the active tab (url or `status: "complete"`), and on
  `windows.onFocusChanged`. Restricted pages show the existing "Restricted page" state.
- Keyboard shortcuts, context menus and the viewer are unchanged.
- Risk to check in a real browser: whether adding `sidePanel` triggers a permission warning that disables the
  extension on update. It has no install warning today as far as known; verify on a built zip in
  `chrome://extensions` before upload.

## Broken-site report

- A "Report this site as broken" button in the panel (replaces the old "Report a broken site" link and the usage
  card). Not shown on restricted pages.
- Clicking it shows an inline confirmation. Exact copy:
  - Title: `Report this site as broken?`
  - Body: `This sends the site's domain (for example example.com), the engine and theme you are using, and the extension version to the developer so the site can be fixed. It does not send the page address, page content, anything you type, or any ID. You are asked every time.`
  - Buttons: `Send report` and `Cancel`.
- Payload (JSON, at most 1 KB): `{ site, engine, theme, version }`
  - `site`: the hostname only, lowercase, from `new URL(tab.url).hostname`; no port, path, query or fragment.
    Rejected when empty, longer than 253 characters, not a valid hostname, an IP address, `localhost`, a
    `.local`/`.internal`/`.test`/`.localhost`/`.home.arpa`/`.lan`/`.corp`/`.intranet`/`.private` name, or `local_files`.
  - `engine`: `auto`, `css` or `invert`.
  - `theme`: a built-in theme id, `default`, or `custom` (custom names are never sent).
  - `version`: `chrome.runtime.getManifest().version`.
- Sent from the service worker only, one `fetch` to `https://pshah.fun/api/darkmode-report`, `credentials: "omit"`,
  `referrerPolicy: "no-referrer"`, 5 s timeout. Nothing is retried or queued. The panel shows "Thanks, report sent"
  or "Could not send, try again".
- Client throttle: one report per site per UTC day (stored locally as `{ site, day }` only). A second tap says
  "Already reported today".
- There is no install ID, so reports cannot be linked to a person or to each other, and cannot be deleted per
  person. The privacy text says so.

## Backend

- New table `site_reports(day date, site text, engine text, theme text, version text, reports int)`, primary key on
  the first five columns, RLS on, no policies. The endpoint upserts and increments `reports`. A 13-month purge job
  mirrors the heartbeat purge.
- `POST /api/darkmode-report` (+ `OPTIONS`): same CORS rules as the other extension endpoints, 2 KB body cap,
  validates exactly the payload above, answers 204, never reads or stores headers or IP addresses.
- Owner-only SQL view `top_reported_sites` (site, reports, distinct days). Nothing about reports is published
  publicly in this change.
- The old heartbeat endpoints and stats page stay deployed for now so 2.0.0 and 2.0.1 clients keep working. Retiring
  them is a separate follow-up (the stats page would then show stale data).

## Legacy cleanup (people who opted in on 2.0.0)

On service-worker start, if `telemetryState` holds an ID, send the existing `POST /api/darkmode-telemetry-delete`
for that ID. On a 2xx remove `telemetryState` and `telemetryPromptState`; otherwise keep them and retry on the next
start. This is the only remaining use of the delete endpoint and honours the earlier promise that opted-in data can
be deleted.

## Privacy and store text (must change with the code)

- `docs/privacy.html`, `PRIVACY.md`, Options page text, `CHROMEWEBSTORE.md`, `CHANGELOG.md`, store listing
  translations (flag for the owner), `docs/llms.txt`: replace "anonymous opt-in usage statistics" with the report.
- Chrome Web Store data usage: declare **Web history** (a site's domain, only when the user sends a report) instead
  of "User activity". The three certifications stay true.
- Version: 2.1.0 (new permission and behavior change).

## Out of scope

Automatic breakage detection, free-text notes, per-user report history, public breakage statistics.
