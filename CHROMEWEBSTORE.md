# Chrome Web Store Listing — Force Dark Mode

> Last Updated: 2026-09-04

## Store Listing

**Extension Name** [REQUIRED]
Force Dark Mode

**Short Description** [REQUIRED]
Apply smart dark mode to websites, PDFs, and documents with Auto, CSS, Invert, native dark detection, and local PDF rendering.

**Detailed Description** [REQUIRED]
Force Dark Mode transforms websites, PDFs, and local documents into a clean, eye-friendly dark theme with intelligent engine selection and customizable colors.

Unlike simple global inverters that break videos, photos, and layouts, Force Dark Mode analyzes each webpage to pick the best dark-mode strategy automatically.

KEY FEATURES
- Auto Engine: Intelligently detects whether a page is text-heavy, media-heavy, or already dark. If a site natively supports dark mode, it leaves it alone.
- CSS Engine: Clean, layout-safe dark mode that recolors backgrounds, typography, forms, and borders while preserving media and inverting dark logos.
- Invert Engine: Smart color inversion with media protection, ideal for specialized media and graphic layouts.
- Local PDF & Document Viewer: Open PDFs, Markdown, TXT, and RTF documents in a built-in dark reader with customizable text size, contrast, and color palettes.
- Per-Site Persistence: Save your preferred engine and background color for each domain, automatically synced across your Chrome devices.
- Zero Lag & No White Flashes: Applied at document start to ensure smooth, immediate dark loading.

HOW TO USE IT
1. Click the Force Dark Mode icon in your toolbar when visiting any website.
2. Toggle dark mode on or off with a single click.
3. Choose your preferred engine (Auto, CSS, or Invert) or pick a custom CSS background color.
4. Open the Dark Document Viewer from the popup to view any local or online PDF in dark mode.

PRIVACY & PERMISSIONS
Force Dark Mode is 100% private and runs completely offline.
- No telemetry, analytics, or tracking.
- No external network requests.
- All documents and files are rendered locally in your browser and never leave your computer.
- "storage" permission is used solely to store your site preferences locally in Chrome Sync.
- "activeTab" permission is used only when you click the extension popup to inspect page colors and apply your settings.

SUPPORT & FEEDBACK
Open source under the MIT License. Report issues or contribute at:
https://github.com/pshah-lab/force-dark-mode-extension

**Category** [REQUIRED]
Accessibility

**Single Purpose** [REQUIRED]
Applies customizable dark themes to websites, documents, and PDFs to improve readability and reduce eye strain.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
| :--- | :--- | :---: | :--- |
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `assets/icon128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | 🟡 Needs capture | Webpage with popup controls |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Needs capture | Dark PDF / Document viewer |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Needs capture | Side-by-side comparison on article/wiki |
| Small Promo Tile [RECOMMENDED] | 440×280 PNG/JPEG | ⬜ Optional | |
| Marquee Promo Tile | 1400×560 PNG/JPEG | ⬜ Optional | |

### Screenshot Notes
- **Screenshot 1**: Show a light website (e.g. Wikipedia or GitHub) transformed into dark mode with the extension popup open displaying the Auto recommendation and color picker.
- **Screenshot 2**: Show the Dark Document Viewer rendering a PDF document with the toolbar, contrast controls, and dark theme options visible.
- **Screenshot 3**: Show a complex web app (like YouTube or docs) illustrating native dark detection or CSS engine fidelity with thumbnails preserved.

---

## Permissions Justification

| Permission | Type | Justification |
| :--- | :--- | :--- |
| `storage` | permissions | Required to store user settings (selected engine, custom background color, viewer settings) per domain and sync them across the user's signed-in devices using Chrome Sync. |
| `activeTab` | permissions | Required to inspect page elements when the user opens the popup to recommend the optimal engine and apply theme changes without requesting broad, persistent tab access. |
| `<all_urls>` | content_scripts | Required to inject styling rules and evaluate surface luminance on websites at `document_start` so pages render dark immediately without bright white flashes. |

---

## Privacy & Data Use

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

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://raw.githubusercontent.com/pshah-lab/force-dark-mode-extension/main/PRIVACY.md

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
| 1.6.0 | 2026-09-04 | Added local PDF/document dark viewer, enhanced YouTube/SPA native dark detection, improved smart SVG logo inversion, tightened CSP, and automated test suite. | Draft |
| 1.4.2 | 2026-08-18 | Initial multi-engine release with Auto, CSS, and Invert engines. | Published |
