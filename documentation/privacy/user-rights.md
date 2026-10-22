# ThemeSwitcher Data Subject & Principal Rights Execution Guide

This document outlines how users (Data Subjects under GDPR, Data Principals under India's DPDP Act, and Consumers under CCPA/CPRA) can exercise their privacy rights directly and autonomously.

---

## 1. Summary of Applicable Rights

| Right | Statutory Basis | How to Exercise in ThemeSwitcher | Verification Needed? |
| ----- | --------------- | -------------------------------- | -------------------- |
| **Right to Access & Transparency** | GDPR Art. 15 / DPDP Sec. 11 / CCPA 1798.100 | Open ThemeSwitcher Options page to view total count and stored preferences | None. Immediately available in UI |
| **Right to Data Portability** | GDPR Art. 20 / CCPA 1798.130 | Click **Export Settings (JSON)** in the Options page | None. Immediate local file download |
| **Right to Erasure / Deletion** | GDPR Art. 17 / DPDP Sec. 12 / CCPA 1798.105 | Click **Erase All Stored Data** in the Options page, or uninstall extension. Broken-site reports (2.1.0 and later) carry no ID, so they cannot be deleted individually and are purged automatically after 13 months. For the 2.1.0 usage report, untick **Usage report** in Options: it deletes the server records for your random ID and forgets the ID. For 2.0.0 usage statistics, click **Delete my data** in Options > Usage stats BEFORE turning them off or uninstalling (it also turns them off; turning off discards the random ID needed to find the server records; undeleted records are purged after 13 months) | None. One-click instant execution |
| **Right to Rectification / Correction** | GDPR Art. 16 / DPDP Sec. 12 | Adjust preference via popup or re-import modified JSON | None. Real-time in-place update |
| **Right to Opt-Out of Sale / Sharing** | CCPA 1798.120 / CPRA | Not applicable. No data is sold or shared; only combined totals from the 2.0.0 reports (never individual reports or random IDs) are published at darkmode.pshah.fun/stats.html, with groups of fewer than 10 installs never shown; the opt-in usage report can be switched off and deleted in Options (2.1.0: Usage report; 2.0.0: Usage stats), and a broken-site report is sent only when you confirm it | N/A |
| **Right of Grievance Redressal** | DPDP Sec. 13 / GDPR Art. 77 | Email grievance officer at `pshah.lab@gmail.com` | Standard email interaction |

---

## 2. Step-by-Step Execution Workflows

### A. Exercising Right to Erasure (Delete All Data)
1. Open the ThemeSwitcher Options page:
   - Right-click the ThemeSwitcher icon in your Chrome toolbar and select **Options**, or navigate to `chrome://extensions` and click **Details** -> **Extension options**.
2. Scroll to the **Privacy & Data Management** section.
3. Click the red button: **Erase All Stored Data**.
4. Confirm the browser dialog prompt.
5. All per-site rules, custom color palettes, and viewer configurations are wiped from your `chrome.storage.sync` profile instantly.
6. If you turned on the 2.1.0 usage report, untick **Usage report** in Options: this deletes the server records for your random ID and forgets the ID. Broken-site reports carry no ID and cannot be deleted individually; they are purged automatically after 13 months.
7. If you enabled the 2.0.0 usage statistics, first click **Delete my data** in **Options > Usage stats** (it deletes the server records and also turns usage stats off). Do this BEFORE unticking the box or uninstalling: turning usage stats off discards the random ID needed to find the records. Records not deleted this way are purged automatically after 13 months.

### B. Exercising Right to Portability (Export Data)
1. In the **Privacy & Data Management** section of the Options page, click **Export Settings (JSON)**.
2. A file named `themeswitcher-settings-YYYY-MM-DD.json` will download immediately to your local computer.
3. This standardized JSON format contains all your configured rules and can be backed up or imported onto any other device running ThemeSwitcher.

### C. Exercising Right to Grievance Redressal
If you have concerns, inquiries, or require assistance:
- **Email Contact:** `pshah.lab@gmail.com`
- **Subject:** `[PRIVACY GRIEVANCE] - ThemeSwitcher`
- **SLA:** Initial response within **48 hours**; resolution within **30 days**.
