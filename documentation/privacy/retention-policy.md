# ThemeSwitcher Data Retention Policy

**Effective Date:** September 23, 2026  
**Applicability:** Browser Extension & Companion Website  

---

## 1. Statutory Background & Storage Limitation Principle

Under Article 5(1)(e) of the EU GDPR and Section 8(7) of India's Digital Personal Data Protection Act, 2023 (DPDP Act), personal data must not be kept longer than is necessary for the purposes for which it is processed.

ThemeSwitcher applies the strictest interpretation of this principle:
- **Server-Side Data:** Zero days. ThemeSwitcher maintains no proprietary databases or backend servers.
- **Client-Side Data:** Exclusively user-controlled and stored locally within the browser profile.

---

## 2. Retention Schedules by Component

| Component | Data Type | Storage Medium | Retention Trigger | Disposal / Deletion Method |
| --------- | --------- | -------------- | ----------------- | -------------------------- |
| **Extension** | Domain preferences (engine, color) | `chrome.storage.sync` | Retained as long as user desires the site rule | 1. User clicks "Erase All Stored Data" in Options.<br>2. User removes rule via popup toggle.<br>3. User uninstalls extension. |
| **Extension** | Global defaults & Viewer settings | `chrome.storage.sync` | Retained until reconfigured by user | Overwritten by user in Options / Viewer or erased via "Erase All Stored Data". |
| **Extension** | In-Memory style tokens | Browser RAM | Discarded after DOM evaluation | Automatically reclaimed by browser garbage collector upon tab navigation or close. |
| **Website** | Local feedback cache | `localStorage` (`fdex_feedback_entries`) | Retained in local browser storage | User clears browser storage / website cookies & site data. |
| **Website** | Session tracking debounce | `sessionStorage` (`fdex_visit_logged_v1`) | Retained for current tab session | Automatically purged upon closing the browser tab. |

---

## 3. Server-Side Data Retention Statement

Because ThemeSwitcher does not operate backend servers, cloud databases, user authentication systems, or proprietary analytics endpoints:
- No log files containing user IP addresses or user agents are recorded by ThemeSwitcher.
- No database backups containing user preferences are generated or retained.
- No archival or warm/cold storage of browsing activity exists.

---

## 4. End-of-Life & Extension Uninstallation

When a user uninstalls ThemeSwitcher:
- The browser automatically deletes the extension's local storage database on the machine.
- If Chrome Sync is enabled, synced preferences are cleared in accordance with the user's Google Chrome Sync account settings.
