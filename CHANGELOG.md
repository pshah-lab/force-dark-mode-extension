# Changelog

All notable changes to the **Force Dark Mode - ThemeSwitcher** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-10-12

2.0.0 supersedes 1.8.0, which was never separately submitted to the Chrome Web Store; the 1.8.0 section below is kept as history and its changes ship in 2.0.0.

### Added
- **Built-in themes**: eight ready-made colour themes, chosen from a new theme dropdown in the popup and applied per site.
- **Site packs**: ready-made settings for 20 popular sites, with fixes for 3 of them (hindustantimes.com, npr.org and theguardian.com).
- **Theme editor** in Options: create and edit your own themes with a live preview and a contrast guard. Text and link colours at or above 4.5:1 save cleanly, below 4.5:1 shows a warning, and below 3:1 cannot be saved.
- **Theme import and export** as JSON files, with size and field validation on import.
- **Per-site custom CSS** in Options, checked by a sanitiser before it is stored or injected. Custom CSS cannot introduce a URL.

### Changed
- Images, pictures and video are dimmed through one adjustable setting, and SVG icons and keep-light elements are handled more carefully by the CSS engine.
- Settings export is now format v2 and adds `themes` and `customCss`. Exports from earlier versions still import.

### Privacy
- No new permissions, host permissions or network requests. Themes and custom CSS are stored with the rest of your settings in `chrome.storage`, and the extension never makes network requests.

---

## [1.8.0] - 2026-10-12

### Added
- **Dark Document Viewer: .xlsx / .csv support**:
  - Excel workbooks and CSV files open as a read-only dark grid with sheet tabs, entirely offline and with no new permissions.
  - Number, percent, currency and date formats are shown as the author formatted them; merged cells, column widths, bold/italic, alignment and cell fills are preserved.
  - Cell colours are re-mapped for the active viewer mode and always keep at least 4.5:1 text contrast (except in the "original" colour mode).
  - Large files are capped (5,000 rows, 50 columns, 100,000 cells, 50 sheets; CSV read limit 64 MB) with a visible notice when truncated.
  - Clear messages for password-protected, corrupt, and legacy `.xls` files (convert to `.xlsx` first).
  - Added `test-fixtures/sample.xlsx` and `sample.csv`.
- **Tests**: 9 new suites covering the CSV parser, number formats, styles, workbook parser, colour mapping, view model, DOM renderer and error classification (see README for current totals).
- **Optional feedback prompt**: after 15 popup opens, a one-time dismissible card offers links to leave a review or report a broken site. The open counter is stored locally only and nothing is sent; "Not now" asks once more, "Don't ask again" ends it. Options also gets a feedback link.
- **Rate link**: the popup footer now always shows a "Rate ★" link to the store reviews page next to the feedback link.

### Fixed
- **CSS engine on sites that load styles late** (e.g. Wikipedia, GitHub): light panels stayed white while text was lightened, making pages unreadable. The page is now rescanned (debounced) when stylesheets load.
- **Auto engine skipping pages that support both colour schemes** (e.g. MDN): `color-scheme: light dark` was mistaken for "already dark". Only a dark-only declaration or a dark system preference now counts.

- **Page colours flipping back to light on rescan**: the CSS engine now keeps its surface, text and border markers across rescans, so already-darkened panels (e.g. on Forbes) no longer revert to white.
- **Dark text left on dark backgrounds on news sites** (e.g. BBC): sites using CSS-in-JS add colour rules after hydration without any DOM event, so headlines kept their dark text. The CSS engine now runs a few bounded rescans after the page loads.
- **Auto skipping light pages as "already dark"** (e.g. NYT with the OS in dark mode): declaring support for a dark scheme, plus transparent elements, was enough to skip a page that actually paints a white canvas. The painted page background now decides.
- **Invert engine double-inverting already dark pages**: the Invert engine is now skipped on pages detected as natively dark (e.g. Medium or YouTube in dark mode), as Auto already did, instead of turning them light again.

### Changed
- The ZIP reader (`src/shared/zipReader.js`) now enforces a per-entry size limit and can report oversized entries without failing the whole file. Existing `.docx` and `.pptx` behaviour is unchanged.

---

## [1.7.0] - 2026-09-29

### Added
- **Dark Document Viewer: .docx / .pptx support**:
  - Added a dependency-free ZIP reader (`src/viewer/parsers/zipReader.js`) using native `DecompressionStream`/`CompressionStream`, with encrypted-archive detection.
  - Added a `.docx` paragraph/heading/list/run parser and a `.pptx` slide/run parser (`src/viewer/parsers/`).
  - Wired both into the document viewer UI, rendering Word and PowerPoint files dark and read-only, entirely offline.
  - Added a distinct "page card" surface for text-based documents (Markdown, plain text, RTF, docx, pptx) matching the PDF viewer's visual treatment.
- **Viewer keyboard shortcuts & context menu**:
  - Added `Alt+Shift+O` to open the file viewer directly, and `Alt+Shift+V` to open the current tab's document in the dark viewer, plus matching right-click context menu items.
- **Popup filter controls**:
  - Added brightness, contrast, and sepia sliders (`src/popup/popup.js`) with per-site persistence and clamped valid ranges.
- **Automatic scheduling**:
  - Added a scheduling mode (fixed time range or system dark-mode-linked) in Options, stored separately in `chrome.storage.local` to keep it independent of per-site export/import/erasure flows.
- **Toggle shortcut & right-click**:
  - Added `Alt+Shift+D` keyboard shortcut and a right-click context menu entry to toggle dark mode on the current tab.
- **Permanent test fixtures**:
  - Added `test-fixtures/` at the repo root with one sample file per supported viewer format (pdf, docx, pptx, txt, md, rtf), for manual testing via the viewer's "Open file" button.

### Fixed
- **PDF rendering**:
  - Fixed Smart Dark mode double-processing the page background; PDFs now always render against a true white base before dark conversion is applied.
  - Fixed PDF render scale to use the actual device pixel ratio instead of a forced high minimum, improving performance on high-DPI displays.

### Changed
- **Website**: added a real-screenshot gallery, a "ThemeSwitcher vs. Dark Reader" comparison guide, and a homepage visual refresh; removed fabricated "active users"/"visit count" figures that contradicted the site's zero-telemetry claims.

---

## [1.6.1] - 2026-09-23

### Added
- **User Control Center (Privacy & Rights Management)**:
  - Added "Privacy & Data Management" panel in Options page (`src/options/options.html`, `options.js`, `options.css`).
  - Implemented live stored domain count display.
  - Implemented one-click **Export Settings (JSON)** fulfilling the Right to Data Portability (GDPR Art. 20, CCPA/CPRA).
  - Implemented **Import Settings (JSON)** with defensive schema validation, rejecting corrupted or malicious payloads.
  - Implemented **Erase All Stored Data** with user confirmation dialog, fulfilling the Right to Erasure / Deletion (India DPDP Sec. 12, GDPR Art. 17).
- **Automated Privacy & Security Test Suite**:
  - Added `tests/privacy_security_test.mjs` containing 9 comprehensive automated compliance test suites (47 total assertions across the test runner).
  - Validates zero runtime URL query parameter leakage, safe prototype pollution defenses (`isSafeKey`), secure DOM construction (0 instances of `innerHTML`), sandbox configuration, CSP validation, and JSON export/import data integrity.
- **Compliance & Security Documentation**:
  - Published comprehensive 24-chapter compliance report: `documentation/ThemeSwitcher_Privacy_Compliance_Report.md`.
  - Added dedicated documentation hierarchy in `documentation/`:
    - Privacy: `privacy-policy.md` (v2.0.0), `data-inventory.md`, `data-flow.md`, `retention-policy.md`, `user-rights.md`, `subprocessors.md`.
    - Security: `SECURITY.md` (v1.1.0), `security-model.md`, `threat-model.md`, `incident-response.md`.
    - Compliance: `compliance-matrix.md`, `jurisdiction-matrix.md` (India DPDP, GDPR, UK GDPR, CCPA/CPRA, CA, AU, BR), `chrome-web-store-compliance.md`, `privacy-impact-assessment.md`.
    - Release & Versioning: `VERSIONING.md`.
- **Vulnerability Disclosure Policy**:
  - Published root `SECURITY.md` defining 48-hour response SLA to `pshah.lab@gmail.com`, supported release branches (1.6.x), and responsible disclosure terms.
- **Terms of Service**:
  - Drafted `TERMS.md` and added companion web pages (`website/terms.html`, `docs/terms.html`).

### Changed
- **Data Minimization in Runtime Messaging**:
  - Refactored `src/popup/popup.js` to send only sanitized domain names (`host`) to the background worker (`serviceWorker.js`), completely preventing visited URLs, query parameters, or authentication tokens from crossing runtime message channels.
- **Defensive Storage Key Validation**:
  - Added `isSafeKey()` check in `src/shared/storage.js` and `serviceWorker.js` to prevent prototype pollution attacks against `__proto__`, `constructor`, and `prototype`.
- **Safe Document Viewer DOM Rendering**:
  - Refactored `src/viewer/viewer.js` markdown parser from `innerHTML` to safe DOM construction using `replaceChildren()`, `createElement()`, and `textContent`.
  - Audited and verified **zero (0) instances of `innerHTML`** across the entire extension codebase.
- **Companion Website Network Hardening**:
  - Removed third-party hit counter API calls (`abacus.jasoncameron.dev`, `countapi.mileshilliard.com`) in `website/js/main.js` and `docs/js/main.js`.
  - Companion website now operates with **zero external network requests**, adhering strictly to the "Zero Telemetry / Zero Tracking" policy.

### Security
- **Hardened Iframe Sandboxing**:
  - Updated fallback PDF/document iframe in `src/viewer/viewer.html` to `sandbox="allow-scripts"`, removing `allow-same-origin` to preserve sandbox boundary isolation.
- **Content Security Policy (CSP)**:
  - Validated strict CSP in `manifest.json` (`script-src 'self'; object-src 'self'`) to block inline script injection and unauthorized remote code execution.

---

## [1.6.0] - 2026-09-22

### Added
- **Local PDF & Document Dark Reader**:
  - Bundled local PDF.js runtime in `assets/pdfjs/` for rendering PDFs in high-contrast dark mode directly inside the browser.
  - Saturation-aware canvas pixel processing preserving diagram lines and text readability.
  - Added support for opening local Markdown (`.md`), plain text (`.txt`), and rich text (`.rtf`) files with soothing dark themes.
  - Implemented dynamic zoom controls (50% to 200%) with debounced canvas re-rendering.
- **Native Dark Theme Detection**:
  - Added automatic detection for SPAs with built-in dark modes (e.g., YouTube night mode, GitHub dark theme) to eliminate accidental double inversion.
- **Smart SVG and Logo Inversion**:
  - Enhanced CSS engine with brightness-adaptive logo inversion, ensuring dark brand logos remain legible on dark backgrounds.
- **Custom Domain & Companion Website**:
  - Launched official companion website at `https://darkmode.pshah.fun/` with user guides, privacy policy, and offline support documentation.

### Changed
- Unified extension branding to **Force Dark Mode - ThemeSwitcher**.
- Updated `manifest.json` with strict CSP and optimized icon assets.
- Refactored popup UI with modern dark palette selector and OLED black (#000000) preset.

---

## [1.4.2] - 2026-08-18

### Added
- Multi-engine architecture featuring:
  - **Auto Engine**: Intelligent surface luminance sampling.
  - **CSS Override Engine**: Contrast-calculated background and text recoloring.
  - **Smart Invert Engine**: Protected media inversion for graphics-heavy sites.
- Per-domain persistence using `chrome.storage.sync`.
- Instant toggle without page reloads.

---

## [1.0.0] - 2026-05-10

### Added
- Initial stable release under Manifest V3.
- Global and per-site dark mode toggle.
- Fast `document_start` injection preventing blinding white page flashes.
- Basic popup interface with on/off switch.

---

## [0.1.0] - 2026-03-15

### Added
- Prototype proof-of-concept for Chrome Manifest V3 dark theme injection.
