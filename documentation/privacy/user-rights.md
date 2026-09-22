# ThemeSwitcher Data Subject & Principal Rights Execution Guide

This document outlines how users (Data Subjects under GDPR, Data Principals under India's DPDP Act, and Consumers under CCPA/CPRA) can exercise their privacy rights directly and autonomously.

---

## 1. Summary of Applicable Rights

| Right | Statutory Basis | How to Exercise in ThemeSwitcher | Verification Needed? |
| ----- | --------------- | -------------------------------- | -------------------- |
| **Right to Access & Transparency** | GDPR Art. 15 / DPDP Sec. 11 / CCPA 1798.100 | Open ThemeSwitcher Options page to view total count and stored preferences | None. Immediately available in UI |
| **Right to Data Portability** | GDPR Art. 20 / CCPA 1798.130 | Click **Export Settings (JSON)** in the Options page | None. Immediate local file download |
| **Right to Erasure / Deletion** | GDPR Art. 17 / DPDP Sec. 12 / CCPA 1798.105 | Click **Erase All Stored Data** in the Options page, or uninstall extension | None. One-click instant execution |
| **Right to Rectification / Correction** | GDPR Art. 16 / DPDP Sec. 12 | Adjust preference via popup or re-import modified JSON | None. Real-time in-place update |
| **Right to Opt-Out of Sale / Sharing** | CCPA 1798.120 / CPRA | Not applicable. Zero data is sold or shared | N/A |
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

### B. Exercising Right to Portability (Export Data)
1. In the **Privacy & Data Management** section of the Options page, click **Export Settings (JSON)**.
2. A file named `themeswitcher-settings-YYYY-MM-DD.json` will download immediately to your local computer.
3. This standardized JSON format contains all your configured rules and can be backed up or imported onto any other device running ThemeSwitcher.

### C. Exercising Right to Grievance Redressal
If you have concerns, inquiries, or require assistance:
- **Email Contact:** `pshah.lab@gmail.com`
- **Subject:** `[PRIVACY GRIEVANCE] - ThemeSwitcher`
- **SLA:** Initial response within **48 hours**; resolution within **30 days**.
