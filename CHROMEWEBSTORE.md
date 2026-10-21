# Chrome Web Store Listing — Force Dark Mode - ThemeSwitcher

> Last Updated: 2026-10-21

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
Force Dark Mode - ThemeSwitcher transforms websites, PDFs, and local documents into a soothing, eye-friendly dark theme with intelligent engine selection and customizable color palettes.

Unlike simple global inverters that break photos, video thumbnails, and page layouts, ThemeSwitcher analyzes each webpage's structure and luminance to apply the optimal dark strategy automatically.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✦ Intelligent Auto Engine: Dynamically samples page elements, luminance, and media density. If a site natively supports dark mode (such as YouTube or GitHub in night mode), ThemeSwitcher automatically respects it and avoids double inversion.

✦ Layout-Safe CSS Engine: Recolors backgrounds, typography, forms, and borders using mathematical contrast calculations while preserving images, videos, and canvas elements. Black brand logos on dark backgrounds are automatically detected and inverted for clarity.

✦ Smart Invert Engine: Protected color inversion with re-inversion for media, perfect for complex graphics-heavy pages and specialized web applications.

✦ Local Document & PDF Reader: Open online and local PDFs, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV, Markdown (.md), TXT, and RTF files in a built-in dark reader. PDFs render through bundled PDF.js with saturation-aware canvas pixel conversion—diagrams and text stay crisp without uploading confidential files to external servers.

✦ Per-Site Custom Background Colors: Choose between pitch black (#000000) for OLED displays or a soft midnight slate (#0f1115) from the side panel. Surfaces and borders adapt automatically to guarantee WCAG AA contrast.

✦ Zero White Flashes: Applied at document_start before the DOM renders to protect your eyes from blinding white flashes between page navigations.

✦ Side Panel: Click the toolbar icon to open the controls beside the page. The panel stays open while you switch tabs and follows the site you are on.

✦ Instant Toggle: Switch dark mode on or off instantly with a single click—no page reloads required.

✦ Keyboard Shortcuts & Right-Click Menu: Toggle dark mode (Alt+Shift+D), open the document viewer (Alt+Shift+O), or open the current PDF tab directly in the dark viewer (Alt+Shift+V)—each also available from the right-click menu.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO USE IT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Click the ThemeSwitcher icon in your browser toolbar on any website to open the side panel.
2. Toggle dark mode on or off with a single click.
3. Switch between Auto, CSS, or Invert engines, or pick a custom background color for the current domain.
4. Click "Open file viewer" in the side panel (or press Alt+Shift+O) to open any supported document in dark mode—see Key Features above for the full format list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVATE BY DEFAULT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ThemeSwitcher is built with an uncompromising commitment to privacy:
• No third-party analytics, tracking pixels, or advertising.
• Nothing is sent on its own. There are two optional reports, and you decide on both.
• Daily usage report: off unless you turn it on (a card asks once, and you can change it any time in Options). If you turn it on, each day you use dark mode we receive a random ID for your install (not linked to you), the date and extension version, which engines you used, and how many sites dark mode was applied on, a number only and never which sites. Turning it off deletes what we hold for your ID.
• Report this site as broken: a button in the side panel. It shows exactly what will be sent (the site's domain, your engine and theme choice, and the extension version, never the page address, page content or an ID) and sends it only after you confirm, every time. These reports are used to fix sites and are deleted after 13 months.
• Everything else runs 100% locally in your browser. The only other network request is when you open a web PDF in the viewer: it downloads that PDF directly from the site that hosts it, and nothing is sent to us.
• No browsing history is collected, and page content and documents are never sent.
• Preferences sync strictly through your personal Google Account via chrome.storage.sync.
• Fully open-source under the MIT License for public security auditing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPPORT & RESOURCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
| 2.1.0   | 2026-10-17 | Side panel replaces the popup (adds the `sidePanel` permission, no host permissions); new Report this site as broken (user-confirmed, sends only the site's domain, engine, theme label and version); new optional usage report (off by default: random ID, day, version, engines used, count of sites darkened; deletable from Options), and 2.0.0 opt-ins are asked to confirm. | Ready to upload |
| 2.0.0   | 2026-10-14 | Built-in themes, 20 site packs, theme editor, per-site custom CSS, import/export, engine fixes, and optional anonymous usage statistics (off by default; random ID, day, version, Chrome/OS/language, yes/no feature flags; never sites or content; data-deletion button in Options; only combined totals are published at darkmode.pshah.fun/stats.html). No new permissions and no host permissions. | Published |
| 1.8.0   | 2026-10-12 | Added offline, read-only Excel (.xlsx) and CSV viewing to the Dark Document Viewer. No permission or manifest changes. |
| 1.7.0   | 2026-09-29 | Added offline .docx/.pptx support to the Dark Document Viewer, a matching "page card" surface for text-based documents, brightness/contrast/sepia filter sliders, automatic scheduling, toggle/viewer keyboard shortcuts with right-click equivalents, and a permanent`test-fixtures/` sample suite. Fixed PDF Smart Dark double-processing and render-scale performance. First submission rejected 2026-09-30 for keyword spam (the same file-format list was repeated in two sections of the description); resubmitted after removing the duplication. | Published |
| 1.6.1   | 2026-09-23 | Privacy & Security compliance update: added User Control Center in Options (JSON settings export/import, one-click data erasure for GDPR Art. 17 / DPDP Sec. 12), hardened iframe sandbox without allow-same-origin, refactored document viewer to safe DOM construction (0 innerHTML), minimized runtime messaging to host-only, eliminated third-party count APIs on companion site, and added 47 automated security/privacy compliance tests.                                                                                                           | Published |
| 1.6.0   | 2026-09-22 | Unified branding as Force Dark Mode - ThemeSwitcher, added local PDF/document dark viewer with PDF.js, enhanced YouTube/SPA native dark detection, improved smart SVG logo inversion, tightened CSP, and production SEO landing site.                                                                                                                                                                                                                                                                                                                      | Published |
| 1.4.2   | 2026-08-18 | Initial multi-engine release with Auto, CSS, and Invert engines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Published |
