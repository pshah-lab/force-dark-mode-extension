# Privacy Policy for ThemeSwitcher (Force Dark Mode)

**Last Updated:** September 23, 2026  
**Policy Version:** 2.0.0  

ThemeSwitcher (Force Dark Mode) is committed to protecting your privacy through an uncompromising **local-first**, **privacy-by-design** architecture. This policy outlines our data handling practices across the extension and companion website.

---

## 1. Zero Data Collection & Zero Telemetry
ThemeSwitcher does **not** collect, track, sell, or transmit any personal information, browsing history, or user activity.
- **Zero Telemetry / Analytics:** There are no analytics libraries, tracking pixels, crash reporters, or external API calls.
- **Zero Third-Party Sharing:** No user data is ever sold, transferred, or shared with third parties.
- **Zero Page Content Extraction:** Web page text, form entries, credentials, and cookies are never accessed or transmitted.

---

## 2. Local Storage & Preferences
The extension uses Chrome's built-in `chrome.storage.sync` API solely to store your dark mode preferences:
- Selected theme engine per domain (`auto`, `css`, or `invert`).
- Custom background color selections.
- Viewer display settings (mode, font size, contrast).
- Global default preferences (`__global_defaults__`).

These preferences are synchronized through your Google Chrome account using Google's secure synchronization infrastructure if you have Chrome sync enabled. No proprietary servers or external databases are used.

---

## 3. Document & PDF Viewer
The built-in Dark Document Viewer processes all PDF, TXT, Markdown, and RTF documents **100% locally on your machine** using local browser APIs and bundled client-side rendering engines (PDF.js). Your documents are never uploaded, analyzed, or sent to any remote server.

---

## 4. Permissions
- **`storage`**: Used to save your per-site preferences and viewer configuration across sessions.
- **`activeTab`**: Used only when you click the extension popup to analyze the active tab for dark-mode suitability and apply your theme selection.
- **`<all_urls>` (Content Script)**: Used to inject CSS theme rules at `document_start` across sites, preventing white screen flashes.

---

## 5. User Rights & Data Control
Under GDPR (EU), DPDP Act 2023 (India), and CCPA/CPRA (US):
- **Right to Portability:** You can export all your saved configurations as a JSON file via the Options page.
- **Right to Erasure:** You can erase all stored site preferences with one click in the Options page ("Erase All Stored Data") or by uninstalling the extension.

---

## 6. Contact & Support
If you have any questions or feedback regarding this privacy policy:
- **Email:** `pshah.lab@gmail.com`
- **Support & Feedback Page:** https://darkmode.pshah.fun/support.html