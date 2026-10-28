# Privacy Policy for ThemeSwitcher (Force Dark Mode)

**Last Updated:** October 17, 2026  
**Policy Version:** 2.1.0 (covers versions 2.0.0 and 2.1.0)  

ThemeSwitcher (Force Dark Mode) is committed to protecting your privacy through a **local-first**, **privacy-by-design** architecture. Your settings and documents stay on your device; the only data that can leave it is what section 1 describes: a broken-site report that you start and confirm yourself (version 2.1.0 and later), or an optional usage report that you opt in to (versions 2.0.0 and 2.1.0). This policy outlines our data handling practices across the extension and companion website.

---

## 1. What the extension can send
This policy covers two versions of the extension. **Version 2.1.0 and later** can send two things, both described below: a broken-site report that you start and confirm yourself (section 1.1) and an optional daily usage report that is off unless you turn it on (section 1.2). **Version 2.0.0** can send an optional anonymous daily usage report if you opt in (section 1.3). Neither version sends anything else. Your settings and documents are never sent.

### 1.1 Broken-site reports (version 2.1.0 and later)
In version 2.1.0 and later a broken-site report is never sent on its own. It is sent only when you start and confirm it yourself: in the side panel, press **Report this site as broken**, read what will be sent, and press **Send report**. You are asked every time. (The only other network request the extension can make is when you open a web PDF in the viewer: it then downloads that PDF directly from the site that hosts it.)

A report is sent from the background service worker only and contains exactly these fields:

<!-- fields:start -->
- `site`: the domain of the site you are reporting, for example example.com (never the page address, path, query or anything you typed)
- `engine`: the engine in use (auto, css or invert)
- `theme`: a built-in theme name, or the word custom or default (never the name or colours of your own theme)
- `version`: the extension version
<!-- fields:end -->

The confirmation shows the domain before you send. Nothing about what you read or watch, the documents you open or any text you type is ever collected or sent. No page address, page content, custom CSS text, theme colours or file names are included.

There is **no install ID, account or cookie** in a report, so reports are not linked to you or to each other. For the same reason a single report cannot be looked up or deleted afterwards. The server adds the UTC date and counts repeats. Our server function **does not store IP addresses** (the hosting platform's own request logs may transiently contain them, along with the browser's User-Agent and Accept-Language headers). The lawful basis is your consent, given each time you press Send report. Reports are used only to find and fix sites that look wrong; they are never sold, never shared with advertisers and never used for anything unrelated, and are purged automatically after 13 months. They are processed only by our hosting providers (Vercel, Supabase) on our behalf; the endpoint is operated by the developer (first-party) and no analytics company is involved. The extension remembers, on your device only, which sites you reported today (the domain and the date) so that a second tap says "Already reported today"; that note never leaves your device.

- **No Sale or Sharing:** Reports are never sold or shared. Your settings and documents are never sent to anyone.
- **Zero Page Content Extraction:** Web page text, form entries, credentials, and cookies are never accessed or transmitted.

### 1.2 Optional usage report (version 2.1.0 and later)
In version 2.1.0 and later the usage report is **off by default**. Nothing is sent, and no random ID exists, unless you press **Turn on** on the one-time card in the side panel or switch on **Usage report** in the Options page. If you press No thanks, or never choose, the extension sends no usage report. People who opted in to the usage statistics of version 2.0.0 are asked once to confirm, because this version also counts sites; until they confirm, nothing is sent from their install.

When you opt in, on each day you use dark mode the extension sends a small report, from the background service worker only. The same day's report may be sent again, replacing the earlier one for that day, when the engines you used or the number of sites change (at most once an hour). A report contains exactly these fields:

<!-- usage-fields:start -->
- `id`: a random identifier created when you turn the report on; it is not linked to your Google account, email or name
- `day`: the UTC calendar day of the report
- `version`: the extension version
- `engines.auto`, `engines.css`, `engines.invert`: whether each engine (Auto, CSS, Invert) was used that day (yes or no flags, not counts)
- `sites`: how many sites dark mode was applied on that day (a number only, never which sites)
<!-- usage-fields:end -->

Nothing about which sites you visit, what you read or watch, the documents you open or any text you type is ever collected or sent. So that each site is counted once, the extension keeps on your device a daily list of numeric fingerprints (hashes) of site names, replaced each day; the list never leaves your device, and only the final number is sent.

The server stores the random ID, the day and the fields above. Our server function **does not store IP addresses** (the hosting platform's own request logs may transiently contain them, along with the browser's User-Agent and Accept-Language headers). The random ID is treated as pseudonymous personal data, and the lawful basis is your consent, which you can withdraw at any time. The reports are used only by the developer to count daily and weekly users, returning users and retention, and to see which versions are in use; individual reports and random IDs are never published, never sold, never shared with advertisers and never used for anything unrelated, and reports are purged automatically after 13 months. They are processed only by our hosting providers (Vercel, Supabase) on our behalf; the endpoint is operated by the developer (first-party) and no analytics company is involved.

**Turning it off and deleting your data:** untick **Usage report** in the Options page, or press No thanks on the card if you are asked to confirm. This stops the reports, asks the server to delete every report stored for your random ID, and forgets the ID. If the deletion request cannot reach the server, the extension keeps the random ID only to retry the deletion (each time the browser starts the extension) until the server confirms it; the ID is then removed. Turning it on again creates a new random ID.

- **No Sale or Sharing:** Usage reports are never sold or shared. Your settings and documents are never sent to anyone.
- **Zero Page Content Extraction:** Web page text, form entries, credentials, and cookies are never accessed or transmitted.

### 1.3 Optional anonymous usage statistics (version 2.0.0 only)
In version 2.0.0, usage statistics are **off by default**. Nothing is sent unless you click **Yes** on the one-time card in the popup or switch on **Usage stats** in the Options page. Version 2.1.0 and later have their own usage report, described in section 1.2. If you click No, or never choose, the extension sends nothing to us. (The only other network request the extension can make is when you open a web PDF in the viewer: it then downloads that PDF directly from the site that hosts it.)

When you opt in, the extension sends one small anonymous report per day, from the background service worker only. A report says that you used the extension on that day and contains exactly these fields (Options > Usage stats shows an example report, with a placeholder ID, before you turn it on, and today's report afterwards):

<!-- legacy-fields:start -->
- `id`: a random identifier created when you opt in; it is not linked to your Google account, email or name
- `day`: the UTC calendar day of the report
- `version`: the extension version
- `env.chrome`: the Chrome major version number
- `env.os`: your operating system family (mac, windows, linux, chromeos or other)
- `env.lang`: your browser UI language code
- `engines.auto`, `engines.css`, `engines.invert`: whether each engine (Auto, CSS, Invert) was used that day (yes or no flags, not counts)
- `theme`: the built-in theme you used, or the word custom for your own theme
- `features.viewer`, `features.editor`, `features.customCss`, `features.sitePack`: whether you used the document viewer, the theme editor, custom CSS or a site pack that day (yes or no flags)
<!-- legacy-fields:end -->

Nothing about the sites you visit, what you read or watch, the documents you open or any text you type is ever collected or sent. No hostnames, URLs, page content, custom CSS text, theme colours or file names are included.

The server stores the random ID, the day and the fields above. Our server function **does not store IP addresses** (the hosting platform's own request logs may transiently contain them, along with the browser's User-Agent and Accept-Language headers). The random ID is treated as pseudonymous personal data, and the lawful basis is your consent, which you can withdraw at any time. The statistics are used only to understand how many people use the extension and which features matter, and to publish combined totals at darkmode.pshah.fun/stats.html (groups of fewer than 10 installs are never shown); they are never sold, never shared with advertisers and never used for anything unrelated, and are processed only by our hosting providers (Vercel, Supabase) on our behalf. The endpoint is operated by the developer (first-party), hosted on Vercel with a Supabase database; no analytics company is involved.

**Turning it off and deleting your data:** open the Options page and go to **Usage stats**. To delete the data already sent, click **Delete my data** in Options > Usage stats (this deletes the server records and also turns usage stats off). Do this BEFORE unticking the box or uninstalling, because turning usage stats off discards the random ID needed to find the records. Records that are not deleted this way are purged automatically after 13 months. Untick the box only afterwards if you want to stop sending without deleting (unticking alone stops sending but does not delete anything). If the deletion request cannot reach the server, usage stats stay off and the extension keeps the random ID only to retry the deletion (the next time you click the button, and each time the browser starts the extension) until the server confirms it; the ID is then removed.

- **No Sale or Sharing:** Usage statistics are never sold. Only combined totals (never individual reports or random IDs) are published at darkmode.pshah.fun/stats.html, and groups of fewer than 10 installs are never shown. The hosting providers (Vercel, Supabase) process the data on our behalf. Your settings and documents are never sent to anyone.
- **Zero Page Content Extraction:** Web page text, form entries, credentials, and cookies are never accessed or transmitted.

**Moving to 2.1.0:** version 2.1.0 does not send anything from a 2.0.0 opt-in until the person confirms the card described in section 1.2. If they confirm, they keep their random ID. If they decline, the extension asks the server to delete the data stored for that ID and then forgets the ID; if the request fails it is retried each time the browser starts the extension. Combined totals published earlier at darkmode.pshah.fun/stats.html came from the 2.0.0 reports and stop being updated as people update.

---

## 2. Local Storage & Preferences
The extension uses Chrome's built-in `chrome.storage.sync` API solely to store your dark mode preferences:
- Selected theme engine per domain (`auto`, `css`, or `invert`).
- Custom background color selections.
- Viewer display settings (mode, font size, contrast).
- Global default preferences (`__global_defaults__`).

These preferences are synchronized through your Google Chrome account using Google's secure synchronization infrastructure if you have Chrome sync enabled. Your preferences are never sent to any server run by the developer; the only server involved is the report endpoint described in section 1, which does not receive your preferences.

**Pre-paint flag (the one value kept in a website's own storage):** so that a site you use in dark mode does not flash white while the extension starts, the extension keeps one small flag, `__fdm_pre`, in that website's own `localStorage`. It holds only the digit `1` and the time it was set (for example `1:1760000000000`), meaning "dark mode was applied on this site last time". It is removed when dark mode is off for the site, the site is natively dark, or dark mode is not applied there for any other reason, and it is ignored after 7 days. It contains no settings, themes, page addresses or personal data, and it is never sent anywhere by the extension. Because it lives in the site's storage, that site's own scripts can see it (and so could tell that dark mode was applied there); clearing the site's data in Chrome removes it. Nothing else is ever written to a website's storage, and the extension uses no cookies.

---

## 3. Document & PDF Viewer
The built-in Dark Document Viewer processes all PDF, TXT, Markdown, and RTF documents **100% locally on your machine** using local browser APIs and bundled client-side rendering engines (PDF.js). Your documents are never uploaded, analyzed, or sent to any remote server, and they are never part of a report or usage statistics.

---

## 4. Permissions
- **`storage`**: Used to save your per-site preferences and viewer configuration across sessions.
- **`activeTab`**: Used only when you open the popup (version 2.0.0) or the side panel (version 2.1.0 and later) to analyze the active tab for dark-mode suitability and apply your theme selection.
- **`sidePanel`** (version 2.1.0 and later): Used to show the extension's controls in the browser's side panel instead of a popup. It gives no access to any page.
- **No host permissions**: The reports in section 1 and the one-time deletion request for 2.0.0 opt-ins need no host permission. The developer's endpoint answers CORS only for this extension's own origin, so the background service worker can reach it without any access to the websites you visit.
- **`<all_urls>` (Content Script)**: Used to inject CSS theme rules at `document_start` across sites, preventing white screen flashes.

---

## 5. User Rights & Data Control
Under GDPR (EU), DPDP Act 2023 (India), and CCPA/CPRA (US):
- **Right to Portability:** You can export all your saved configurations as a JSON file via the Options page.
- **Right to Erasure:** You can erase all stored site preferences with one click in the Options page ("Erase All Stored Data") or by uninstalling the extension. Broken-site reports (2.1.0) carry no ID, so they cannot be deleted individually; they are purged automatically after 13 months. In version 2.0.0, click **Delete my data** in Options > Usage stats to delete the usage statistics stored for your random ID (do this BEFORE turning usage stats off or uninstalling, because turning them off discards the ID needed to find the records); records not deleted are purged after 13 months. If you opted in to the 2.0.0 usage report, updating to 2.1.0 deletes that data for you.

---

## 6. Contact & Support
If you have any questions or feedback regarding this privacy policy:
- **Email:** `pshah.lab@gmail.com`
- **Support & Feedback Page:** https://darkmode.pshah.fun/support.html