# Chrome Web Store Listing — Force Dark Mode - ThemeSwitcher

> Last Updated: 2026-09-22

---

## Store Listing

**Extension Name** [REQUIRED]
```
Force Dark Mode - ThemeSwitcher
```
*(Alternative Options if character limits or branding priorities change: `Dark Mode - ThemeSwitcher` or `Force Dark Mode`) — `Force Dark Mode - ThemeSwitcher` is recommended because it captures both the high-volume query "force dark mode" and your unique brand identity "ThemeSwitcher".*

**Short Description** [REQUIRED] (128 / 132 chars)
```
Apply smart dark mode to websites, PDFs, and local docs with Auto detection, custom CSS palettes, and zero data tracking.
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

✦ Local PDF & Document Reader: Open online and local PDFs, Markdown (.md), TXT, and RTF documents in a built-in dark reader. Powered by bundled PDF.js with saturation-aware canvas pixel conversion—diagrams and text stay crisp without uploading confidential files to external servers.

✦ Per-Site Custom Background Colors: Choose between pitch black (#000000) for OLED displays or a soft midnight slate (#0f1115) from the popup. Surfaces and borders adapt automatically to guarantee WCAG AA contrast.

✦ Zero White Flashes: Applied at document_start before the DOM renders to protect your eyes from blinding white flashes between page navigations.

✦ Instant Toggle: Switch dark mode on or off instantly with a single click—no page reloads required.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO USE IT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Click the ThemeSwitcher icon in your browser toolbar on any website.
2. Toggle dark mode on or off with a single click.
3. Switch between Auto, CSS, or Invert engines, or pick a custom background color for the current domain.
4. Click "Open file viewer" to open any local or online PDF in dark mode.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
100% PRIVATE & OFFLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ThemeSwitcher is built with an uncompromising commitment to privacy:
• Zero analytics, telemetry, or tracking pixels.
• Zero external network calls—runs 100% locally in your browser.
• No browsing history or website URLs ever leave your computer.
• Preferences sync strictly through your personal Google Account via chrome.storage.sync.
• Fully open-source under the MIT License for public security auditing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPPORT & SOURCE CODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Website: https://darkmode.pshah.fun/
Source Code: https://github.com/pshah-lab/force-dark-mode-extension
Report Issues: https://github.com/pshah-lab/force-dark-mode-extension/issues
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

| Asset | Dimensions | Status | Recommendation |
| :--- | :--- | :---: | :--- |
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `assets/icon128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | 🟡 To Capture | Light Wikipedia / documentation page transformed into dark mode with popup open showing Auto Engine recommendation and color picker. |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 To Capture | Local Dark PDF Viewer rendering a complex PDF document with dark canvas rendering and toolbar controls. |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 To Capture | Complex web app (e.g. YouTube or GitHub) demonstrating native dark detection leaving already-dark surfaces alone. |
| Screenshot 4 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 To Capture | Side-by-side comparison illustrating glaring white vs. ThemeSwitcher soothing dark theme with preserved images. |
| Small Promo Tile [RECOMMENDED] | 440×280 PNG/JPEG | ⬜ Optional | Dark background with crisp extension logo and title text. |
| Marquee Promo Tile | 1400×560 PNG/JPEG | ⬜ Optional | Store front showcase banner. |

---

## Permissions Justification

| Permission | Type | Detailed Plain-English Justification |
| :--- | :--- | :--- |
| `storage` | permissions | Required to store user settings (selected engine, custom background color, viewer preferences) per domain and sync them across the user's signed-in devices using Chrome Sync with zero external servers. |
| `activeTab` | permissions | Required only when the user opens the extension popup to inspect page colors/luminance and apply theme changes without requesting broad, persistent tab access. |
| `<all_urls>` | content_scripts | Required to inject styling rules and evaluate surface luminance on websites at `document_start` so pages render dark immediately without bright white flashes. |

---

## Privacy & Data Use Disclosures

### Data Collection
**Does the extension collect user data?** No

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
| :--- | :--- | :--- | :--- | :--- |
| Personally identifiable info | No | No | None | No |
| Health info | No | No | None | No |
| Financial info | No | No | None | No |
| Authentication info | No | No | None | No |
| Personal communications | No | No | None | No |
| Location | No | No | None | No |
| Web history | No | No | None | No |
| User activity | No | No | None | No |
| Website content | No | No | None | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy URL
```
https://darkmode.pshah.fun/privacy.html
```
*(Also available in repo at `https://raw.githubusercontent.com/pshah-lab/force-dark-mode-extension/main/PRIVACY.md`)*

---

## Distribution

- **Visibility**: Public
- **Regions**: All regions
- **Pricing**: Free

---

## Developer Info

- **Publisher Name**: pshah-lab
- **Support URL**: https://github.com/pshah-lab/force-dark-mode-extension/issues

---

## Version History

| Version | Date | Changes | Status |
| :--- | :--- | :--- | :--- |
| 1.6.0 | 2026-09-22 | Unified branding as Force Dark Mode - ThemeSwitcher, added local PDF/document dark viewer with PDF.js, enhanced YouTube/SPA native dark detection, improved smart SVG logo inversion, tightened CSP, and production SEO landing site. | Draft |
| 1.4.2 | 2026-08-18 | Initial multi-engine release with Auto, CSS, and Invert engines. | Published |
