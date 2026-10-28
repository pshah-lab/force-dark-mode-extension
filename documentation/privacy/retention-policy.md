# ThemeSwitcher Data Retention Policy

**Effective Date:** September 23, 2026  
**Last Updated:** October 17, 2026 (Policy Version 2.1.0)  
**Applicability:** Browser Extension & Companion Website  

---

## 1. Statutory Background & Storage Limitation Principle

Under Article 5(1)(e) of the EU GDPR and Section 8(7) of India's Digital Personal Data Protection Act, 2023 (DPDP Act), personal data must not be kept longer than is necessary for the purposes for which it is processed.

ThemeSwitcher applies the strictest interpretation of this principle:
- **Server-Side Data:** Nothing is stored for anyone who has neither opted in to a usage report nor sent a broken-site report. Everything stored sits on the developer's first-party endpoint (Vercel and Supabase) and is purged automatically after 13 months:
  - **Broken-site reports (2.1.0 and later):** one row per report you confirm (domain, engine, theme, version, and the UTC date added by the server, with repeats counted). There is no ID, so a report cannot be looked up or deleted individually; it is purged after 13 months.
  - **Usage report (2.1.0 and later, opt-in):** the random ID, day, version, engine flags and a count of sites. Turning the report off deletes the records for the ID and forgets the ID; otherwise purged after 13 months.
  - **Usage statistics (2.0.0, opt-in):** one small row per active day (random ID, day, versions, OS family, UI language, yes/no usage flags). To delete it sooner, click Delete my data in Options > Usage stats BEFORE turning usage stats off or uninstalling (turning it off discards the random ID needed to find the rows).
  - Our server function does not store IP addresses.
- **Client-Side Data:** Exclusively user-controlled and stored locally within the browser profile.

---

## 2. Retention Schedules by Component

| Component | Data Type | Storage Medium | Retention Trigger | Disposal / Deletion Method |
| --------- | --------- | -------------- | ----------------- | -------------------------- |
| **Extension** | Domain preferences (engine, color) | `chrome.storage.sync` | Retained as long as user desires the site rule | 1. User clicks "Erase All Stored Data" in Options.<br>2. User removes rule via popup toggle.<br>3. User uninstalls extension. |
| **Extension** | Global defaults & Viewer settings | `chrome.storage.sync` | Retained until reconfigured by user | Overwritten by user in Options / Viewer or erased via "Erase All Stored Data". |
| **Extension** | In-Memory style tokens | Browser RAM | Discarded after DOM evaluation | Automatically reclaimed by browser garbage collector upon tab navigation or close. |
| **Extension** | Pre-paint flag `__fdm_pre` (`1:<time set>` only, no personal data) | The visited website's own `localStorage` | Removed as soon as dark mode resolves to off, disabled or natively dark for the site; ignored after 7 days | Turning dark mode off for the site, or clearing the site's data in Chrome. |
| **Extension** | Usage-report state, version 2.1.0 and later (opt-in only): random ID, today's counters, and a daily list of hashes of site names | `chrome.storage.local` (never synced; the hash list is never sent) | While the usage report is on (the hash list is replaced each day), or (the ID alone, with the report off) while a deletion request is waiting for the server to confirm it | Turning the usage report off in Options (the ID is kept only until the server confirms the deletion, then removed), or uninstalling. |
| **Extension** | "Reported today" note, version 2.1.0 and later: the domain and date of sites you reported | Local storage on the device (never sent) | Remembers which sites were reported today | Uninstalling the extension or clearing its data. |
| **Extension** | Usage-statistics state, version 2.0.0 (opt-in only): random ID, today's counters | `chrome.storage.local` (`telemetryState`, never synced) | Only exists while usage stats are on, or (the ID alone, with usage stats off) while a deletion request is waiting for the server to confirm it | Turning usage stats off in Options, Delete my data (the ID is kept only until the server confirms the deletion, then removed), or uninstalling. |
| **Server** | Broken-site report rows, version 2.1.0 and later (domain, engine, theme, version, UTC date, repeat count; no ID) | First-party database (Supabase) | Purged automatically after 13 months. Never published individually | Automatic purge only; a report carries no ID, so it cannot be deleted individually. |
| **Server** | Usage report rows, version 2.1.0 and later (opt-in only: random ID, day, version, engine flags, site count) | First-party database (Supabase) | Purged automatically after 13 months. Individual rows and IDs are never published | Turning the usage report off in Options deletes every row for the ID and forgets the ID. |
| **Server** | Anonymous usage report rows, version 2.0.0 (opt-in only) | First-party database (Supabase) | Purged automatically after 13 months. Only combined totals are published at darkmode.pshah.fun/stats.html (groups of fewer than 10 installs never shown); the rows themselves are never published | **Delete my data** in Options > Usage stats removes every row for the user's random ID (also turns usage stats off); do this BEFORE unticking the box or uninstalling, because turning it off discards the ID. |
| **Website** | Local feedback cache | `localStorage` (`fdex_feedback_entries`) | Retained in local browser storage | User clears browser storage / website cookies & site data. |
| **Website** | Session tracking debounce | `sessionStorage` (`fdex_visit_logged_v1`) | Retained for current tab session | Automatically purged upon closing the browser tab. |

---

## 3. Server-Side Data Retention Statement

ThemeSwitcher operates no user authentication system and no third-party analytics. The first-party endpoints for the broken-site report and the opt-in usage reports (see the table above) stores only the report fields listed above:
- Our server function does not store IP addresses, and ThemeSwitcher records no log files containing IP addresses or user agents beyond what the hosting platform itself keeps transiently for operating the service.
- No database backups containing user preferences are generated or retained.
- No archival or warm/cold storage of browsing activity exists.

---

## 4. End-of-Life & Extension Uninstallation

When a user uninstalls ThemeSwitcher:
- The browser automatically deletes the extension's local storage database on the machine.
- If Chrome Sync is enabled, synced preferences are cleared in accordance with the user's Google Chrome Sync account settings.
