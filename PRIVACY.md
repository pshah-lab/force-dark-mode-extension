# Privacy Policy for ThemeSwitcher (Force Dark Mode)

**Last Updated:** October 14, 2026  
**Policy Version:** 2.0.0  

ThemeSwitcher (Force Dark Mode) is committed to protecting your privacy through a **local-first**, **privacy-by-design** architecture. Your settings and documents stay on your device; the only data that can leave it is the optional, anonymous usage report described in section 1, which is off by default. This policy outlines our data handling practices across the extension and companion website.

---

## 1. Anonymous, opt-in usage statistics
Usage statistics are **off by default**. Nothing is sent unless you click **Yes** on the one-time card in the popup or switch on **Usage stats** in the Options page. If you click No, or never choose, the extension makes no network requests at all.

When you opt in, the extension sends one small anonymous report per day, from the background service worker only. A report says that you used the extension on that day and contains exactly these fields (you can see today's exact report in Options > Usage stats before and after you turn it on):

<!-- fields:start -->
- `id`: a random identifier created when you opt in; it is not linked to your Google account, email or name
- `day`: the UTC calendar day of the report
- `version`: the extension version
- `env.chrome`: the Chrome major version number
- `env.os`: your operating system family (mac, windows, linux, chromeos or other)
- `env.lang`: your browser UI language code
- `engines.auto`, `engines.css`, `engines.invert`: whether each engine (Auto, CSS, Invert) was used that day (yes or no flags, not counts)
- `theme`: the built-in theme you used, or the word custom for your own theme
- `features.viewer`, `features.editor`, `features.customCss`, `features.sitePack`: whether you used the document viewer, the theme editor, custom CSS or a site pack that day (yes or no flags)
<!-- fields:end -->

Nothing about the sites you visit, what you read or watch, the documents you open or any text you type is ever collected or sent. No hostnames, URLs, page content, custom CSS text, theme colours or file names are included.

The server stores the random ID, the day and the fields above. Our server function **does not store IP addresses** (the hosting platform's own request logs may transiently contain them). The random ID is treated as pseudonymous personal data, and the lawful basis is your consent, which you can withdraw at any time. The statistics are used only to understand how many people use the extension and which features matter; they are never sold, never shared with advertisers and never used for anything unrelated, and are processed only by our hosting providers (Vercel, Supabase) on our behalf. The endpoint is operated by the developer (first-party), hosted on Vercel with a Supabase database; no analytics company is involved.

**Turning it off and deleting your data:** open the Options page and go to **Usage stats**. To delete the data already sent, click **Delete my data** in Options > Usage stats (this deletes the server records and also turns usage stats off). Do this BEFORE unticking the box or uninstalling, because turning usage stats off discards the random ID needed to find the records. Records that are not deleted this way are purged automatically after 13 months. Untick the box only afterwards if you want to stop sending without deleting (unticking alone stops sending but does not delete anything).

- **No Sale or Sharing:** Usage statistics are never sold or shared with anyone else; they are processed only by our hosting providers (Vercel, Supabase) on our behalf. Your settings and documents are never sent to anyone.
- **Zero Page Content Extraction:** Web page text, form entries, credentials, and cookies are never accessed or transmitted.

---

## 2. Local Storage & Preferences
The extension uses Chrome's built-in `chrome.storage.sync` API solely to store your dark mode preferences:
- Selected theme engine per domain (`auto`, `css`, or `invert`).
- Custom background color selections.
- Viewer display settings (mode, font size, contrast).
- Global default preferences (`__global_defaults__`).

These preferences are synchronized through your Google Chrome account using Google's secure synchronization infrastructure if you have Chrome sync enabled. Your preferences are never sent to any server run by the developer; the only server involved is the optional usage-statistics endpoint described in section 1, which does not receive your preferences.

---

## 3. Document & PDF Viewer
The built-in Dark Document Viewer processes all PDF, TXT, Markdown, and RTF documents **100% locally on your machine** using local browser APIs and bundled client-side rendering engines (PDF.js). Your documents are never uploaded, analyzed, or sent to any remote server, and they are never part of the usage statistics.

---

## 4. Permissions
- **`storage`**: Used to save your per-site preferences and viewer configuration across sessions.
- **`activeTab`**: Used only when you click the extension popup to analyze the active tab for dark-mode suitability and apply your theme selection.
- **Host permission `https://pshah.fun/api/darkmode-telemetry*`**: Lets the background service worker send the opt-in usage report (section 1) and the "Delete my data" request, and nothing else. It grants no access to any website you visit.
- **`<all_urls>` (Content Script)**: Used to inject CSS theme rules at `document_start` across sites, preventing white screen flashes.

---

## 5. User Rights & Data Control
Under GDPR (EU), DPDP Act 2023 (India), and CCPA/CPRA (US):
- **Right to Portability:** You can export all your saved configurations as a JSON file via the Options page.
- **Right to Erasure:** You can erase all stored site preferences with one click in the Options page ("Erase All Stored Data") or by uninstalling the extension. To delete the usage statistics stored for your random ID, click **Delete my data** in Options > Usage stats (this deletes the server records and also turns usage stats off). Do this BEFORE unticking the box or uninstalling, because turning usage stats off discards the random ID needed to find the records. Records that are not deleted this way are purged automatically after 13 months.

---

## 6. Contact & Support
If you have any questions or feedback regarding this privacy policy:
- **Email:** `pshah.lab@gmail.com`
- **Support & Feedback Page:** https://darkmode.pshah.fun/support.html