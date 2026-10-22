# ThemeSwitcher Privacy Policy

**Effective Date:** September 23, 2026  
**Last Updated:** October 17, 2026  
**Policy Version:** 2.1.0 (covers versions 2.0.0 and 2.1.0)  

---

## 1. Introduction & Core Commitment

ThemeSwitcher (Force Dark Mode) is an open-source, client-side browser extension and companion website developed with an uncompromising commitment to **privacy by design**, **local-first processing**, and **data minimization**.

Our guiding principle is simple:
> **ThemeSwitcher does not collect, track, or sell your personal data, browsing history, or website content, and never sends them. All theme processing and document rendering happen 100% locally on your device. The only data that can leave your device is what section 3.1 describes: a broken-site report that you start and confirm yourself (version 2.1.0 and later), or an optional usage report that is OFF by default and only starts if you opt in (versions 2.0.0 and 2.1.0).**

This Privacy Policy explains transparently how ThemeSwitcher operates, what local configurations are stored, and how your privacy is protected under applicable laws, including the **Digital Personal Data Protection Act, 2023 (India)**, the **General Data Protection Regulation (EU GDPR)**, the **UK GDPR**, and the **California Consumer Privacy Act (CCPA/CPRA)**.

---

## 2. Scope

This policy applies to:
1. **The ThemeSwitcher Browser Extension** (Manifest V3 extension distributed via the Chrome Web Store).
2. **The ThemeSwitcher Companion Website & Documentation** hosted at `https://darkmode.pshah.fun`.

---

## 3. What the Extension Can Send

This policy covers two versions of the extension. Version 2.1.0 and later can send a broken-site report and an optional usage report; version 2.0.0 can send an optional anonymous usage report. Neither version sends anything else. Settings and documents are never sent. The full field lists are in the main `PRIVACY.md` (section 1).

### 3.1 Summary

| Report | Version | When it is sent | Fields (exactly) | Lawful basis | Server retention |
| ------ | ------- | --------------- | ---------------- | ------------ | ---------------- |
| **Broken-site report** | 2.1.0 and later | Only when you press **Report this site as broken**, then **Send report**; asked every time | `site` (domain only), `engine`, `theme` (built-in name, or custom or default), `version`. No install ID, account or cookie; the server adds the UTC date and counts repeats | Consent, each time | Purged after 13 months. Cannot be looked up or deleted individually, because it carries no ID |
| **Usage report** | 2.1.0 and later | Off by default; on only after you press **Turn on** on the side-panel card or switch on **Usage report** in Options. May be re-sent the same day (replacing the earlier one) at most once an hour | `id` (random), `day` (UTC), `version`, `engines.auto` / `engines.css` / `engines.invert` (used that day, yes or no), `sites` (a count of sites dark mode was applied on that day) | Consent, withdrawable at any time | Purged after 13 months, or earlier when you turn it off |
| **Usage statistics** | 2.0.0 only | Off by default; on only after you click Yes on the popup card or switch on Usage stats in Options. One report per day | `id`, `day`, `version`, `env.chrome`, `env.os`, `env.lang`, `engines.*`, `theme`, `features.viewer` / `features.editor` / `features.customCss` / `features.sitePack` | Consent, withdrawable at any time | Purged after 13 months, or earlier through **Delete my data** |

On your device only: the extension remembers which domains you reported today (never sent), and, if the 2.1.0 usage report is on, keeps a daily list of hashes of site names so each site is counted once (never sent; only the final number is sent). Combined totals from the 2.0.0 reports are published at darkmode.pshah.fun/stats.html (groups of fewer than 10 are hidden) and stop being updated as people move to 2.1.0. Individual reports and random IDs are never published. The only other network request the extension makes is downloading a web PDF directly from its host when you open it in the viewer.

---

## 4. Information We Do NOT Collect

To prevent any ambiguity, ThemeSwitcher explicitly confirms that it **does NOT** collect, store remotely, intercept, or share any of the following:

- **No Browsing History:** We do not log, monitor, or transmit the websites, pages, or URLs you visit.
- **No Page Content or DOM Data:** While the extension inspects DOM color styles in memory to calculate contrast, the content of web pages (articles, emails, messages, documents) is never extracted or transmitted.
- **No Keystrokes or Form Input:** We do not access, log, or record form fields, passwords, search queries, payment card information, or credentials.
- **No Personal Identifiers:** We do not collect names, email addresses, phone numbers, IP addresses, or hardware MAC addresses through the extension. The opt-in usage reports carry only a random ID, which we treat as pseudonymous personal data (lawful basis: consent, GDPR Art. 6(1)(a)); our server function does not store IP addresses (the hosting platform's own request logs may transiently contain them, along with the browser's User-Agent and Accept-Language headers).
- **No Behavioral Profiling or Third-Party Analytics:** There are zero third-party telemetry libraries, crash reporting SDKs, advertising trackers, or tracking pixels in the extension. The only first-party exceptions are the user-confirmed broken-site report (version 2.1.0 and later; the domain of the reported site, engine, theme and version, with no ID) and the opt-in usage reports described in section 3 and in the main `PRIVACY.md` (off by default; no page content or documents; in 2.1.0 only a count of sites, never which sites). Reports are never sold or shared; only combined totals from 2.0.0 (never individual reports or random IDs) are published at darkmode.pshah.fun/stats.html, and groups of fewer than 10 installs are never shown.
- **No User Cookies:** The extension does not read, set, or transmit browser cookies.

---

## 5. Information Processed Locally by the Extension

The extension processes only minimal, non-sensitive display preferences required to fulfill its single core purpose:

| Data Category | Specific Elements | Storage Location | Retention Period |
| ------------- | ----------------- | ---------------- | ---------------- |
| **Site Theme Preferences** | Domain host (e.g. `example.com`), enabled state (`true`/`false`), selected engine (`auto`/`css`/`invert`), custom background color hex | `chrome.storage.sync` | Retained locally until edited or erased by user |
| **Global Defaults** | Default engine (`auto`), default background color (`#0f1115`), default active toggle state | `chrome.storage.sync` (`__global_defaults__`) | Retained locally until changed or erased |
| **Viewer Preferences** | Display mode (`smart`/`invert`/`sepia`/`original`), font size, contrast multiplier, custom palette colors | `chrome.storage.sync` (`__force_dark_viewer__`) | Retained locally until changed or erased |

### Cloud Synchronization Note
Preferences stored via `chrome.storage.sync` are synchronized across your own devices using Google Chrome's built-in synchronization infrastructure if you are signed into Chrome with sync enabled. This synchronization is handled directly by Google under your Google account terms; ThemeSwitcher has no server, database, or access to your Google account or synced payload.

---

## 6. Local Document & PDF Viewer

ThemeSwitcher includes a built-in Dark Document Viewer for reading PDF, TXT, Markdown, and RTF documents:
- **100% Local Sandboxed Rendering:** Document parsing and rendering are performed entirely on your machine using bundled offline rendering engines (PDF.js).
- **No File Uploads:** Files opened in the viewer are loaded via local memory pointers (`blob:` / `file:` / client `Uint8Array`). They are never uploaded to any remote server.
- **No File Content Logging:** Document text and metadata are never logged or stored.

---

## 7. Companion Website Privacy Practices

The companion website (`https://darkmode.pshah.fun`) is a static resource deployed on GitHub Pages:
- **Zero Third-Party Tracking:** The website does not use Google Analytics, Meta Pixel, Hotjar, or any commercial tracking networks.
- **No Third-Party Counter Requests:** The website makes one cookie-free visit-count request to the developer's own endpoint at pshah.fun per browser, and the public stats page makes one GET to the developer's own stats endpoint. No third-party counter APIs are used.
- **Zero Cookies:** The website does not set any advertising, profiling, or tracking cookies.
- **Feedback & Support Submissions:** If you submit feedback via the support form, the entry is saved in your browser's local storage (`localStorage`) and opened in your email client (`mailto:`) for direct transmission to `pshah.lab@gmail.com`. You retain full control over whether to send the email.

---

## 8. Browser Permissions Explained

ThemeSwitcher requests only the minimum permissions necessary for its single purpose:

| Permission | Technical Requirement & Justification |
| ---------- | ------------------------------------- |
| `storage` | Required to persist your theme preferences and custom background colors per website across browser sessions. |
| `activeTab` | Required when you open the popup (version 2.0.0) or the side panel (version 2.1.0 and later) to analyze page luminance on the current tab and apply immediate color overrides. |
| `sidePanel` (version 2.1.0 and later) | Shows the extension's controls in the browser's side panel instead of a popup. It gives no access to any page. |
| `<all_urls>` (Content Script) | Required to inject style overrides at `document_start` before page elements render, preventing severe white screen flashes across arbitrary websites visited by the user. |

---

## 9. Legal Bases for Processing (GDPR & International Frameworks)

Where data protection regulations apply:
- **Performance of Contract (GDPR Art. 6(1)(b)):** Processing of theme settings is strictly necessary to perform the service requested by the user (providing customized dark mode display).
- **Legitimate Interests (GDPR Art. 6(1)(f)):** Ensuring stability, layout legibility, and high-contrast accessibility.
- **Consent (where applicable):** User actions (toggling dark mode, importing settings) constitute affirmative, revocable consent. Consent (GDPR Art. 6(1)(a)) is the lawful basis for every report in section 3: given each time you press Send report for a broken-site report, and withdrawable at any time for the usage reports.

---

## 10. User Rights & Controls (DPDP / GDPR / CCPA)

You have complete agency over your data:

1. **Right to Access & Transparency:** You can view all stored domain rules directly in the extension Options page (`chrome://extensions` -> ThemeSwitcher -> Options).
2. **Right to Data Portability (GDPR Art. 20):** You can export all your saved configurations as a standard JSON file at any time using the "Export Settings (JSON)" button.
3. **Right to Erasure / Deletion (DPDP Sec. 12 / GDPR Art. 17):** You can permanently delete all stored preferences with a single click using the "Erase All Stored Data" button in the Options page. Uninstalling the extension also removes all local extension storage.
4. **Right to Opt-Out (CCPA/CPRA):** We do not sell personal information. Only combined totals (never individual reports or random IDs) are published at darkmode.pshah.fun/stats.html, with groups of fewer than 10 installs never shown. Usage statistics are opt-in and can be switched off at any time in Options > Usage stats. Broken-site reports (2.1.0) carry no ID, so they cannot be deleted individually; they are purged automatically after 13 months. In 2.1.0, untick **Usage report** in Options to delete the server records for your random ID and forget the ID. In 2.0.0, to delete the reports stored for your random ID, click **Delete my data** in Options > Usage stats (this deletes the server records and also turns usage stats off). Do this BEFORE unticking the box or uninstalling, because turning usage stats off discards the random ID needed to find the records. Records that are not deleted this way are purged automatically after 13 months.

---

## 11. Children’s Privacy

ThemeSwitcher is a general utility tool that does not target, market to, or knowingly collect data from children under the age of 18 (India) or 16 (EU/US). Without a usage report enabled, the extension collects no personal data (a broken-site report carries no ID); usage reports are off by default and carry only a pseudonymous random ID with no information about who the user is.

---

## 12. Security Safeguards

We implement defense-in-depth security controls:
- Strict Content Security Policy (`script-src 'self'; object-src 'none'`).
- Prohibition of dynamic script evaluation (`eval`, `new Function`).
- Safe DOM node creation to prevent Cross-Site Scripting (XSS).
- Prototype pollution sanitization on all storage keys.
- Sender origin validation (`sender.id === chrome.runtime.id`) on all internal messaging.

---

## 13. Changes to this Policy

If we modify our privacy practices or introduce new features that impact data processing, we will update this document, increment the version number, and document changes in the changelog below.

### Version Changelog
- **Version 2.1.0 (October 17, 2026):** Added the broken-site report (sent only when you press Report this site as broken and then Send report; domain, engine, theme and version; no ID; purged after 13 months). Added a new optional usage report (off by default; random ID, day, version, engine flags, and a count of sites) with a local daily list of site-name hashes that is never sent, and turn-off that deletes the server records. The policy now covers versions 2.0.0 and 2.1.0.
- **Version 2.0.0 usage statistics (October 14, 2026):** Added optional, anonymous, opt-in usage statistics (off by default) with Options controls to turn it off and delete the data. Only combined totals are published at darkmode.pshah.fun/stats.html.
- **Version 2.0.0 (September 23, 2026):** Complete compliance rewrite. Added DPDP Act 2023 alignment, GDPR user rights workflow, eliminated website counter network calls, documented data portability and erasure controls.
- **Version 1.0.0 (September 4, 2026):** Initial privacy policy.

---

## 14. Contact & Grievance Redressal

For questions, privacy inquiries, or grievance redressal:
- **Data Protection & Grievance Contact:** `pshah.lab@gmail.com`
- **Response Commitment:** Acknowledgment within 48 hours; resolution within 30 days.
- **Support Portal:** `https://darkmode.pshah.fun/support.html`
