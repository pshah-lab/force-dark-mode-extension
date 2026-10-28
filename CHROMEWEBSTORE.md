# Chrome Web Store Listing — Force Dark Mode - ThemeSwitcher

> Last Updated: 2026-10-21 (description trimmed after the keyword-spam rejection, reference Yellow Argon)

---

## Store Listing

**Extension Name** [REQUIRED]

```
Force Dark Mode - ThemeSwitcher
```

*(Alternative Options if character limits or branding priorities change: `Dark Mode - ThemeSwitcher` or `Force Dark Mode`) — `Force Dark Mode - ThemeSwitcher` is recommended because it captures both the high-volume query "force dark mode" and your unique brand identity "ThemeSwitcher".*

**Short Description** [REQUIRED] (128 / 132 chars)

```
Apply smart dark mode to websites, PDFs, and local docs with Auto detection, custom CSS palettes, and no tracking by default.
```

**Detailed Description** [REQUIRED]

```
Force Dark Mode - ThemeSwitcher turns websites, PDFs, and local documents dark without breaking photos, videos, or page layouts. It checks each page and picks the best method automatically.

KEY FEATURES
✦ Auto Engine: picks the right method for each page and leaves sites that already have a dark theme alone.
✦ CSS Engine: recolors backgrounds, text, forms, and borders while keeping images, videos, and canvas untouched.
✦ Invert Engine: protected inversion for graphics-heavy pages and web apps.
✦ Document Reader: read PDFs and everyday documents in a built-in dark reader. Files are processed on your device.
✦ Per-Site Settings: choose a theme, background color, brightness, contrast, and sepia for each site.
✦ No White Flashes: dark mode is applied as the page starts loading.
✦ Side Panel: click the toolbar icon to open the controls beside the page. It stays open and follows the site you are on.
✦ Shortcuts: Alt+Shift+D toggles dark mode, Alt+Shift+O opens the document viewer, and the right-click menu does both.

HOW TO USE IT
1. Click the toolbar icon to open the side panel.
2. Turn dark mode on or off and pick an engine, theme, or background for the site.
3. Click "Open file viewer" (or press Alt+Shift+O) to read a PDF or document in dark mode.

PRIVACY
• No third-party analytics, tracking pixels, or advertising. Settings sync through your Google Account (chrome.storage.sync). To avoid a white flash, sites where dark mode is on get one tiny flag in their own storage (__fdm_pre: "1" and a time, no personal data; the site can see it). Open source (MIT).
• Nothing is sent on its own. There are two optional reports, and you decide on both:
• Daily usage report: off unless you turn it on (a card asks once, and you can change it any time in Options). If you turn it on, each day you use dark mode we receive a random install ID (not linked to you), the date and extension version, which engines you used, and how many sites dark mode was applied on, a number only and never which sites. Turning it off deletes it.
• Report this site as broken: a button in the side panel. It shows exactly what will be sent (the site's domain, your engine and theme choice, and the extension version, never the page address or content) and sends it only after you confirm. These reports are deleted after 13 months.
• Everything else runs locally. The only other network request is when you open a web PDF in the viewer: it downloads straight from the site that hosts it, and nothing is sent to us.

SUPPORT
Website: https://darkmode.pshah.fun/
Support & Feedback: https://darkmode.pshah.fun/support.html
Help & Guides: https://darkmode.pshah.fun/how-it-works.html
```

**Category** [REQUIRED]

```
Accessibility
```

**Single Purpose** [REQUIRED]

```
Applies customizable, layout-safe dark themes to websites, documents, and PDFs to improve readability and reduce digital eye strain.
```

**Primary Language** [REQUIRED]

```
English
```

---

## Graphics & Asset Strategy

| Asset                          | Dimensions            |    Status    | Recommendation                                                                                                                       |
| :----------------------------- | :-------------------- | :-----------: | :----------------------------------------------------------------------------------------------------------------------------------- |
| Store Icon [REQUIRED]          | 128×128 PNG          |   ✅ Ready   | `assets/icon128.png`                                                                                                               |
| Screenshot 1 [REQUIRED]        | 1280×800 or 640×400 | 🟡 To Capture | Light Wikipedia / documentation page transformed into dark mode with popup open showing Auto Engine recommendation and color picker. |
| Screenshot 2 [RECOMMENDED]     | 1280×800 or 640×400 | 🟡 To Capture | Local Dark PDF Viewer rendering a complex PDF document with dark canvas rendering and toolbar controls.                              |
| Screenshot 3 [RECOMMENDED]     | 1280×800 or 640×400 | 🟡 To Capture | Complex web app (e.g. YouTube or GitHub) demonstrating native dark detection leaving already-dark surfaces alone.                    |
| Screenshot 4 [RECOMMENDED]     | 1280×800 or 640×400 | 🟡 To Capture | Side-by-side comparison illustrating glaring white vs. ThemeSwitcher soothing dark theme with preserved images.                      |
| Small Promo Tile [RECOMMENDED] | 440×280 PNG/JPEG     |  ⬜ Optional  | Dark background with crisp extension logo and title text.                                                                            |
| Marquee Promo Tile             | 1400×560 PNG/JPEG    |  ⬜ Optional  | Store front showcase banner.                                                                                                         |

---

## Permissions Justification

| Permission     | Type            | Detailed Plain-English Justification                                                                                                                                                                      |
| :------------- | :-------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`    | permissions     | Required to store user settings (selected engine, custom background color, viewer preferences) per domain and sync them across the user's signed-in devices using Chrome Sync with no developer servers involved. |
| `activeTab`  | permissions     | Required only when the user opens the side panel to inspect page colors/luminance and apply theme changes without requesting broad, persistent tab access.                                           |
| `sidePanel`  | permissions     | Required to show the extension's controls in the browser's side panel instead of a popup. It gives no access to any page. |
| `<all_urls>` | content_scripts | Required to inject styling rules and evaluate surface luminance on websites at`document_start` so pages render dark immediately without bright white flashes.                                           |

No host permissions are requested. The user-confirmed broken-site report (and the optional usage report, with the deletion request sent when someone turns it off) goes to the developer's own first-party endpoint, which answers CORS only for this extension's origin, so no host permission is needed.

---

## Privacy & Data Use Disclosures

### Data Collection

**Does the extension collect user data?** Only if the user chooses it. (1) The optional usage report, off unless the user turns it on: each day the user uses dark mode it sends a random install ID, the UTC day, the extension version, which engines were used and how many sites dark mode was applied on (a number only, never the sites). Declared as "User activity". (2) A broken-site report, only when the user presses Report this site as broken and confirms: the domain of that site, the engine and theme label in use, and the extension version. Declared as "Web history" (the domain of a site the user chooses to report, with no page address, no ID and no other browsing data). Nothing else is collected.

| Data Type                    | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
| :--------------------------- | :--------- | :---------------------- | :------ | :------------------------- |
| Personally identifiable info | No         | No                      | None    | No                         |
| Health info                  | No         | No                      | None    | No                         |
| Financial info               | No         | No                      | None    | No                         |
| Authentication info          | No         | No                      | None    | No                         |
| Personal communications      | No         | No                      | None    | No                         |
| Location                     | No         | No                      | None    | No                         |
| Web history                  | Yes, only the domain of a site the user chooses to report, and only after the user confirms each report; no page address, no ID | Yes, to the developer's own endpoint (hosted on Vercel and Supabase) | Find and fix sites that look wrong; deleted after 13 months | No |
| User activity                | Yes, only if the user turns on the usage report: a random install ID, the day, the version, which engines were used and a count of sites dark mode was applied on (never the sites) | Yes, to the developer's own endpoint (hosted on Vercel and Supabase) | Count daily and weekly users, returning users and retention; deleted when the user turns it off, otherwise after 13 months | No |
| Website content              | No         | No                      | None    | No                         |

### Data Use Certification

- [X] Data is NOT sold to third parties (reports are used only to fix sites and count users; no individual report or ID is published)
- [X] Reports contain no ID, are sent only after the user confirms each one, and our server function does not store IP addresses (platform request logs may transiently contain them, along with the browser's User-Agent and Accept-Language headers)
- [X] Reports carry no ID so they cannot be deleted individually; they are purged after 13 months. Usage reports carry a random ID: turning the report off deletes them, otherwise they are purged after 13 months. People who opted in on 2.0.0 are asked to confirm before anything new is sent, and their data is deleted if they decline
- [X] Data is NOT used for purposes unrelated to the extension's core functionality
- [X] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy URL

```
https://darkmode.pshah.fun/privacy.html
```

---

## Distribution

- **Visibility**: Public
- **Regions**: All regions
- **Pricing**: Free

---

## Developer Info

- **Publisher Name**: pshah-lab
- **Support URL**: https://darkmode.pshah.fun/support.html

---

## Version History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status    |
| :------ | :--------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- |
| 2.2.0   | 2026-10-28 | No white flash on load (one small `__fdm_pre` flag in the site's own storage), iframe theming, per-site Photos & media and native-dark override, image dimming, Google Docs/Sheets dark canvas, PDF detection without ".pdf", Site CSS button and tutorial. No permission or manifest changes. |
| 2.1.0   | 2026-10-17 | Side panel replaces the popup (adds the `sidePanel` permission, no host permissions); new Report this site as broken (user-confirmed, sends only the site's domain, engine, theme label and version); new optional usage report (off by default: random ID, day, version, engines used, count of sites darkened; deletable from Options), and 2.0.0 opt-ins are asked to confirm. | Ready to upload |
| 2.0.0   | 2026-10-14 | Built-in themes, 20 site packs, theme editor, per-site custom CSS, import/export, engine fixes, and optional anonymous usage statistics (off by default; random ID, day, version, Chrome/OS/language, yes/no feature flags; never sites or content; data-deletion button in Options; only combined totals are published at darkmode.pshah.fun/stats.html). No new permissions and no host permissions. | Published |
| 1.8.0   | 2026-10-12 | Added offline, read-only Excel (.xlsx) and CSV viewing to the Dark Document Viewer. No permission or manifest changes. |
| 1.7.0   | 2026-09-29 | Added offline .docx/.pptx support to the Dark Document Viewer, a matching "page card" surface for text-based documents, brightness/contrast/sepia filter sliders, automatic scheduling, toggle/viewer keyboard shortcuts with right-click equivalents, and a permanent`test-fixtures/` sample suite. Fixed PDF Smart Dark double-processing and render-scale performance. First submission rejected 2026-09-30 for keyword spam (the same file-format list was repeated in two sections of the description); resubmitted after removing the duplication. | Published |
| 1.6.1   | 2026-09-23 | Privacy & Security compliance update: added User Control Center in Options (JSON settings export/import, one-click data erasure for GDPR Art. 17 / DPDP Sec. 12), hardened iframe sandbox without allow-same-origin, refactored document viewer to safe DOM construction (0 innerHTML), minimized runtime messaging to host-only, eliminated third-party count APIs on companion site, and added 47 automated security/privacy compliance tests.                                                                                                           | Published |
| 1.6.0   | 2026-09-22 | Unified branding as Force Dark Mode - ThemeSwitcher, added local PDF/document dark viewer with PDF.js, enhanced YouTube/SPA native dark detection, improved smart SVG logo inversion, tightened CSP, and production SEO landing site.                                                                                                                                                                                                                                                                                                                      | Published |
| 1.4.2   | 2026-08-18 | Initial multi-engine release with Auto, CSS, and Invert engines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Published |
