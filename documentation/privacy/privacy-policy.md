# ThemeSwitcher Privacy Policy

**Effective Date:** September 23, 2026  
**Last Updated:** September 23, 2026  
**Policy Version:** 2.0.0  

---

## 1. Introduction & Core Commitment

ThemeSwitcher (Force Dark Mode) is an open-source, client-side browser extension and companion website developed with an uncompromising commitment to **privacy by design**, **local-first processing**, and **data minimization**.

Our guiding principle is simple:
> **ThemeSwitcher does not collect, track, sell, or transmit your personal data, browsing history, or website content. All theme processing and document rendering happen 100% locally on your device.**

This Privacy Policy explains transparently how ThemeSwitcher operates, what local configurations are stored, and how your privacy is protected under applicable laws, including the **Digital Personal Data Protection Act, 2023 (India)**, the **General Data Protection Regulation (EU GDPR)**, the **UK GDPR**, and the **California Consumer Privacy Act (CCPA/CPRA)**.

---

## 2. Scope

This policy applies to:
1. **The ThemeSwitcher Browser Extension** (Manifest V3 extension distributed via the Chrome Web Store).
2. **The ThemeSwitcher Companion Website & Documentation** hosted at `https://darkmode.pshah.fun`.

---

## 3. Information We Do NOT Collect

To prevent any ambiguity, ThemeSwitcher explicitly confirms that it **does NOT** collect, store remotely, intercept, or share any of the following:

- **No Browsing History:** We do not log, monitor, or transmit the websites, pages, or URLs you visit.
- **No Page Content or DOM Data:** While the extension inspects DOM color styles in memory to calculate contrast, the content of web pages (articles, emails, messages, documents) is never extracted or transmitted.
- **No Keystrokes or Form Input:** We do not access, log, or record form fields, passwords, search queries, payment card information, or credentials.
- **No Personal Identifiers:** We do not collect names, email addresses, phone numbers, IP addresses, or hardware MAC addresses through the extension.
- **No Behavioral Profiling or Analytics:** There are zero third-party telemetry libraries, crash reporting SDKs, advertising trackers, or tracking pixels in the extension.
- **No User Cookies:** The extension does not read, set, or transmit browser cookies.

---

## 4. Information Processed Locally by the Extension

The extension processes only minimal, non-sensitive display preferences required to fulfill its single core purpose:

| Data Category | Specific Elements | Storage Location | Retention Period |
| ------------- | ----------------- | ---------------- | ---------------- |
| **Site Theme Preferences** | Domain host (e.g. `example.com`), enabled state (`true`/`false`), selected engine (`auto`/`css`/`invert`), custom background color hex | `chrome.storage.sync` | Retained locally until edited or erased by user |
| **Global Defaults** | Default engine (`auto`), default background color (`#0f1115`), default active toggle state | `chrome.storage.sync` (`__global_defaults__`) | Retained locally until changed or erased |
| **Viewer Preferences** | Display mode (`smart`/`invert`/`sepia`/`original`), font size, contrast multiplier, custom palette colors | `chrome.storage.sync` (`__force_dark_viewer__`) | Retained locally until changed or erased |

### Cloud Synchronization Note
Preferences stored via `chrome.storage.sync` are synchronized across your own devices using Google Chrome's built-in synchronization infrastructure if you are signed into Chrome with sync enabled. This synchronization is handled directly by Google under your Google account terms; ThemeSwitcher has no server, database, or access to your Google account or synced payload.

---

## 5. Local Document & PDF Viewer

ThemeSwitcher includes a built-in Dark Document Viewer for reading PDF, TXT, Markdown, and RTF documents:
- **100% Local Sandboxed Rendering:** Document parsing and rendering are performed entirely on your machine using bundled offline rendering engines (PDF.js).
- **No File Uploads:** Files opened in the viewer are loaded via local memory pointers (`blob:` / `file:` / client `Uint8Array`). They are never uploaded to any remote server.
- **No File Content Logging:** Document text and metadata are never logged or stored.

---

## 6. Companion Website Privacy Practices

The companion website (`https://darkmode.pshah.fun`) is a static resource deployed on GitHub Pages:
- **Zero Third-Party Tracking:** The website does not use Google Analytics, Meta Pixel, Hotjar, or any commercial tracking networks.
- **Zero Network Counter Requests:** The active user display and reader counters run purely client-side without external network calls.
- **Zero Cookies:** The website does not set any advertising, profiling, or tracking cookies.
- **Feedback & Support Submissions:** If you submit feedback via the support form, the entry is saved in your browser's local storage (`localStorage`) and opened in your email client (`mailto:`) for direct transmission to `pshah.lab@gmail.com`. You retain full control over whether to send the email.

---

## 7. Browser Permissions Explained

ThemeSwitcher requests only the minimum permissions necessary for its single purpose:

| Permission | Technical Requirement & Justification |
| ---------- | ------------------------------------- |
| `storage` | Required to persist your theme preferences and custom background colors per website across browser sessions. |
| `activeTab` | Required when clicking the extension popup to analyze page luminance on the current tab and apply immediate color overrides. |
| `<all_urls>` (Content Script) | Required to inject style overrides at `document_start` before page elements render, preventing severe white screen flashes across arbitrary websites visited by the user. |

---

## 8. Legal Bases for Processing (GDPR & International Frameworks)

Where data protection regulations apply:
- **Performance of Contract (GDPR Art. 6(1)(b)):** Processing of theme settings is strictly necessary to perform the service requested by the user (providing customized dark mode display).
- **Legitimate Interests (GDPR Art. 6(1)(f)):** Ensuring stability, layout legibility, and high-contrast accessibility.
- **Consent (where applicable):** User actions (toggling dark mode, importing settings) constitute affirmative, revocable consent.

---

## 9. User Rights & Controls (DPDP / GDPR / CCPA)

You have complete agency over your data:

1. **Right to Access & Transparency:** You can view all stored domain rules directly in the extension Options page (`chrome://extensions` -> ThemeSwitcher -> Options).
2. **Right to Data Portability (GDPR Art. 20):** You can export all your saved configurations as a standard JSON file at any time using the "Export Settings (JSON)" button.
3. **Right to Erasure / Deletion (DPDP Sec. 12 / GDPR Art. 17):** You can permanently delete all stored preferences with a single click using the "Erase All Stored Data" button in the Options page. Uninstalling the extension also removes all local extension storage.
4. **Right to Opt-Out (CCPA/CPRA):** We do not sell or share personal information. No opt-out mechanism is required because zero sale or sharing occurs.

---

## 10. Children’s Privacy

ThemeSwitcher is a general utility tool that does not target, market to, or knowingly collect data from children under the age of 18 (India) or 16 (EU/US). Because the extension collects zero personal data, no children’s personal information is processed.

---

## 11. Security Safeguards

We implement defense-in-depth security controls:
- Strict Content Security Policy (`script-src 'self'; object-src 'none'`).
- Prohibition of dynamic script evaluation (`eval`, `new Function`).
- Safe DOM node creation to prevent Cross-Site Scripting (XSS).
- Prototype pollution sanitization on all storage keys.
- Sender origin validation (`sender.id === chrome.runtime.id`) on all internal messaging.

---

## 12. Changes to this Policy

If we modify our privacy practices or introduce new features that impact data processing, we will update this document, increment the version number, and document changes in the changelog below.

### Version Changelog
- **Version 2.0.0 (September 23, 2026):** Complete compliance rewrite. Added DPDP Act 2023 alignment, GDPR user rights workflow, eliminated website counter network calls, documented data portability and erasure controls.
- **Version 1.0.0 (September 4, 2026):** Initial privacy policy.

---

## 13. Contact & Grievance Redressal

For questions, privacy inquiries, or grievance redressal:
- **Data Protection & Grievance Contact:** `pshah.lab@gmail.com`
- **Response Commitment:** Acknowledgment within 48 hours; resolution within 30 days.
- **Support Portal:** `https://darkmode.pshah.fun/support.html`
