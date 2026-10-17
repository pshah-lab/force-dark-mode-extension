# Privacy Policy for ThemeSwitcher (Force Dark Mode)

**Last Updated:** October 17, 2026  
**Policy Version:** 2.1.0  

ThemeSwitcher (Force Dark Mode) is committed to protecting your privacy through a **local-first**, **privacy-by-design** architecture. Your settings and documents stay on your device; the only data that can leave it is a broken-site report that you start and confirm yourself, described in section 1. This policy outlines our data handling practices across the extension and companion website.

---

## 1. Broken-site reports (only when you send one)
The extension sends nothing on its own. The one thing it can send is a **broken-site report that you start and confirm yourself**: in the side panel, press **Report this site as broken**, read what will be sent, and press **Send report**. You are asked every time. (The only other network request the extension can make is when you open a web PDF in the viewer: it then downloads that PDF directly from the site that hosts it.)

A report is sent from the background service worker only and contains exactly these fields:

<!-- fields:start -->
- `site`: the domain of the site you are reporting, for example example.com (never the page address, path, query or anything you typed)
- `engine`: the engine in use (auto, css or invert)
- `theme`: a built-in theme name, or the word custom or default (never the name or colours of your own theme)
- `version`: the extension version
<!-- fields:end -->

The confirmation shows the domain before you send. Nothing about what you read or watch, the documents you open or any text you type is ever collected or sent. No page address, page content, custom CSS text, theme colours or file names are included.

There is **no install ID, account or cookie** in a report, so reports are not linked to you or to each other. For the same reason a single report cannot be looked up or deleted afterwards. The server adds the UTC date and counts repeats. Our server function **does not store IP addresses** (the hosting platform's own request logs may transiently contain them, along with the browser's User-Agent and Accept-Language headers). The lawful basis is your consent, given each time you press Send report. Reports are used only to find and fix sites that look wrong; they are never sold, never shared with advertisers and never used for anything unrelated, and are purged automatically after 13 months. They are processed only by our hosting providers (Vercel, Supabase) on our behalf; the endpoint is operated by the developer (first-party) and no analytics company is involved. The extension remembers, on your device only, which sites you reported today (the domain and the date) so that a second tap says "Already reported today"; that note never leaves your device.

**Older version (2.0.0):** version 2.0.0 could, if you opted in, send a daily anonymous usage report tied to a random install ID. That report no longer exists. When this version starts, and if you had opted in, it asks the server to delete the data stored for your random ID and then forgets the ID; if the request fails it is retried each time the browser starts the extension. Combined totals published earlier at darkmode.pshah.fun/stats.html came from those reports and are no longer updated.

- **No Sale or Sharing:** Reports are never sold or shared. Your settings and documents are never sent to anyone.
- **Zero Page Content Extraction:** Web page text, form entries, credentials, and cookies are never accessed or transmitted.

---

## 2. Local Storage & Preferences
The extension uses Chrome's built-in `chrome.storage.sync` API solely to store your dark mode preferences:
- Selected theme engine per domain (`auto`, `css`, or `invert`).
- Custom background color selections.
- Viewer display settings (mode, font size, contrast).
- Global default preferences (`__global_defaults__`).

These preferences are synchronized through your Google Chrome account using Google's secure synchronization infrastructure if you have Chrome sync enabled. Your preferences are never sent to any server run by the developer; the only server involved is the broken-site report endpoint described in section 1, which does not receive your preferences.

---

## 3. Document & PDF Viewer
The built-in Dark Document Viewer processes all PDF, TXT, Markdown, and RTF documents **100% locally on your machine** using local browser APIs and bundled client-side rendering engines (PDF.js). Your documents are never uploaded, analyzed, or sent to any remote server, and they are never part of a report.

---

## 4. Permissions
- **`storage`**: Used to save your per-site preferences and viewer configuration across sessions.
- **`activeTab`**: Used only when you open the side panel to analyze the active tab for dark-mode suitability and apply your theme selection.
- **`sidePanel`**: Used to show the extension's controls in the browser's side panel instead of a popup. It gives no access to any page.
- **No host permissions**: The broken-site report (section 1) and the one-time deletion request for 2.0.x opt-ins need no host permission. The developer's endpoint answers CORS only for this extension's own origin, so the background service worker can reach it without any access to the websites you visit.
- **`<all_urls>` (Content Script)**: Used to inject CSS theme rules at `document_start` across sites, preventing white screen flashes.

---

## 5. User Rights & Data Control
Under GDPR (EU), DPDP Act 2023 (India), and CCPA/CPRA (US):
- **Right to Portability:** You can export all your saved configurations as a JSON file via the Options page.
- **Right to Erasure:** You can erase all stored site preferences with one click in the Options page ("Erase All Stored Data") or by uninstalling the extension. Broken-site reports carry no ID, so they cannot be deleted individually; they are purged automatically after 13 months. If you had opted in to the 2.0.x usage report, your data is deleted for you when this version starts (see section 1).

---

## 6. Contact & Support
If you have any questions or feedback regarding this privacy policy:
- **Email:** `pshah.lab@gmail.com`
- **Support & Feedback Page:** https://darkmode.pshah.fun/support.html