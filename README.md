# Force Dark Mode - ThemeSwitcher

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.2.0-indigo.svg)](manifest.json)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install_Free-blue.svg?logo=googlechrome)](https://chromewebstore.google.com/detail/force-dark-mode/kmhhphbakbhohiohagkhhgdgfbplkfke)
[![Tests](https://img.shields.io/badge/tests-472%20passed-success.svg)](tests/)
[![Website](https://img.shields.io/badge/website-live-cyan.svg)](https://darkmode.pshah.fun/)

**Force Dark Mode - ThemeSwitcher** is a lightweight, privacy-first Chrome extension that transforms websites, local documents, and PDF files into eye-friendly, customizable dark themes.

Unlike crude global inverters that turn photos, videos, and layouts into neon negatives, ThemeSwitcher evaluates page luminance and structure to apply the optimal dark strategy automatically.

🌐 **Chrome Web Store**: [https://chromewebstore.google.com/detail/force-dark-mode/kmhhphbakbhohiohagkhhgdgfbplkfke](https://chromewebstore.google.com/detail/force-dark-mode/kmhhphbakbhohiohagkhhgdgfbplkfke)  
🌐 **Live Website & Guides**: [https://darkmode.pshah.fun/](https://darkmode.pshah.fun/)  
📊 **Live Trends & Analytics**: [Chrome-Stats Profile](https://chrome-stats.com/d/kmhhphbakbhohiohagkhhgdgfbplkfke)

---

## 🚀 Key Features

- **Intelligent Auto Engine (Default)**: Dynamically detects whether a page is text-heavy, media-heavy, or already dark.
- **Native Dark Site Detection**: Automatically detects native dark modes on sites like YouTube, GitHub, and Reddit—leaving them untouched to avoid double-inversion glitches.
- **Layout-Safe CSS Override Engine**: Recolors backgrounds, typography, forms, and borders with contrast-tested CSS custom properties while preserving media elements.
- **Smart Logo Inversion**: Selectively inverts dark/black logos on dark backgrounds for crystal-clear readability.
- **Built-in Offline Dark PDF & Document Reader**: Render online and local PDF files locally using bundled PDF.js with saturation-aware pixel conversion. Also supports Markdown (`.md`), Plain Text (`.txt`), and RTF.
- **Local Spreadsheet Viewer**: Open Excel (`.xlsx`) and CSV files as a read-only dark grid with sheet tabs, entirely on your device. Legacy `.xls` files must be converted to `.xlsx` first.
- **Themes**: Eight built-in color themes chosen from the popup, ready-made settings for 20 popular sites, and a theme editor in Options with a live preview, a contrast check and JSON import/export.
- **Per-Site Custom CSS**: Add your own CSS for a site in Options. It is validated before use and cannot introduce a URL.
- **Per-Site Background Customizer**: Choose between pitch-black (`#000000`) for OLED power savings or midnight slate (`#0f1115`) from the popup. Surfaces and borders adapt automatically.
- **Zero White Flashes**: Injected at `document_start` so pages render dark immediately without blinding white flashes.
- **Instant Toggle**: Toggle themes on the fly without refreshing the page.
- **Private by Default**: No tracking pixels or third-party analytics. Nothing is sent unless you opt in: the optional usage report is off until you turn it on, and a broken-site report is sent only after you press Report this site as broken and confirm it.

---

## 🛠️ How It Works

ThemeSwitcher uses a **storage-driven, batched execution architecture**:

```
User Click / Navigation
        ↓
Injected at document_start (CSS root variables bound before paint)
        ↓
Read Pass (Luminance & contrast evaluated without DOM mutation)
        ↓
Single-Frame Batch Write (requestAnimationFrame applies data attributes)
        ↓
chrome.storage.sync (Preferences synced securely per domain)
```

1. **Document Start Binding**: Core styling variables are declared on `:root` before the DOM renders, completely eliminating white flashes.
2. **Batched DOM Scanning**: Reads and writes are decoupled into coordinated animation frames to prevent layout thrashing and maintain 60 FPS scrolling.
3. **Targeted MutationObserver**: Observes dynamic single-page application (SPA) updates without polling.
4. **Offline Canvas PDF Rendering**: PDFs are converted pixel-by-pixel on an HTML5 canvas based on saturation, keeping diagrams vibrant while darkening white margins.

---

## 🎨 Theme Engines

| Engine | Ideal Use Case | How It Operates |
| :--- | :--- | :--- |
| **Auto Engine** *(Default)* | Everyday browsing across all sites | Analyzes DOM structure, relative luminance, and media density to select the best engine or leave native dark sites alone. |
| **CSS Override Engine** | Text-heavy sites, articles, wikis, and SPAs | Rewrites surface and text CSS variables with mathematical WCAG AA contrast. Preserves all images, videos, and canvas elements. |
| **Invert Engine** | Graphics-heavy or media-dense layouts | Applies smart color inversion with media re-inversion. |
| **PDF & Document Viewer** | Research papers, textbooks, and notes | Bundled PDF.js canvas renderer with saturation-aware dark pixel conversion. |

**Known limitation (Invert Engine):** on a small number of sites, the Invert Engine's blanket "re-invert images so they show their true colors" rule can collide with a site's own `prefers-color-scheme`-aware icon styling (icons the site already inverts for dark mode independently of its main theme). The result is a double-inversion that makes that specific icon disappear, rather than a broken layout. This is an inherent trade-off of CSS-filter-based invert dark modes generally, not unique to this extension. If you hit this, switch that site to the CSS Override Engine instead.

**Known limitation (canvas-rendered editors):** apps like Google Docs render their actual document content onto an HTML `<canvas>` element rather than styleable DOM text — the surrounding toolbar/sidebar UI goes dark correctly, but the document page itself can't be recolored by any CSS-based approach, in either engine. This is a well-known, industry-wide limitation shared by every CSS-based dark mode extension, not something specific to this one.

---

## 🔒 Privacy & Permissions

ThemeSwitcher is built with privacy by design:
- **Two optional reports, both opt-in**: nothing is sent on its own. The daily usage report is off until you turn it on (side panel card or Options): it sends a random install ID, the UTC day, the version, which engines you used and how many sites dark mode was applied on (a number only), and turning it off deletes it. The broken-site report: Pressing Report this site as broken in the side panel shows exactly what will be sent (the site's domain, the engine, a theme label and the version; no page address, content, ID or account) and sends it only after you confirm, every time. Our server function does not store IP addresses, and reports are purged after 13 months. No Google Analytics, no tracking beacons, no third-party scripts.
- **Local processing**: All theming and document rendering is executed 100% locally on your machine.
- **One pre-paint flag**: to avoid a white flash on load, the extension keeps one flag, `__fdm_pre` (`1` plus the time it was set, nothing else), in the `localStorage` of sites where it applied dark mode. The site's own scripts can see it; it holds no personal data, is never sent by the extension and is removed when dark mode is off for that site. No other web storage or cookies are used.
- **Minimal Manifest V3 Permissions**:
  - `storage`: Storing domain preferences locally in Chrome Sync.
  - `activeTab`: Inspecting luminance and applying styles when the user opens the popup.
  - No host permissions: the broken-site report reaches the developer's endpoint because it answers CORS only for this extension's own origin.
  - `<all_urls>` (content_scripts): Applying dark mode at `document_start` to prevent white flashes.

Read our complete [Privacy Policy](https://darkmode.pshah.fun/privacy.html) or [PRIVACY.md](PRIVACY.md).

---

## 💻 Local Development & Testing

### Installation (Unpacked)
1. Clone this repository:
   ```bash
   git clone https://github.com/pshah-lab/force-dark-mode-extension.git
   cd force-dark-mode-extension
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the repository root directory.

### Running Automated Tests
Run the full test suite (472 tests across 22 files):
```bash
npm test
```
Or run an individual suite:
```bash
node tests/run_tests.mjs             # File integrity, color math, and security checks (34 tests)
node tests/dom_engine_test.mjs       # DOM simulation, engine switching, and YouTube detection (75 tests)
node tests/privacy_security_test.mjs # Privacy, security, and versioning compliance (27 tests)
node tests/zip_reader_test.mjs       # Dependency-free ZIP reader for docx/pptx/xlsx (15 tests)
node tests/docx_parser_test.mjs      # .docx paragraph/heading/list parser (8 tests)
node tests/pptx_parser_test.mjs      # .pptx slide/run parser (6 tests)
node tests/seo_test.mjs              # SEO metadata and structured-data checks (6 tests)
node tests/csv_parser_test.mjs       # .csv parser (15 tests)
node tests/number_format_test.mjs    # Spreadsheet number-format engine (30 tests)
node tests/xlsx_styles_test.mjs      # .xlsx style/theme resolution (22 tests)
node tests/xlsx_parser_test.mjs      # .xlsx workbook parser (38 tests)
node tests/cell_colors_test.mjs      # Dark-mode cell colour mapping (28 tests)
node tests/spreadsheet_view_test.mjs # Spreadsheet view model (13 tests)
node tests/spreadsheet_renderer_test.mjs # Spreadsheet DOM renderer, fake DOM (21 tests)
node tests/spreadsheet_errors_test.mjs # Spreadsheet error classification (6 tests)
node tests/feedback_prompt_test.mjs   # Popup feedback prompt state machine (7 tests)
node tests/theme_core_test.mjs       # Theme model, validation, contrast and import/export (12 tests)
node tests/builtin_themes_test.mjs   # Built-in themes and their contrast ratios (6 tests)
node tests/site_packs_test.mjs       # Site packs for popular sites (9 tests)
node tests/storage_themes_test.mjs   # Theme and custom CSS storage, export format v2 (28 tests)
node tests/theme_ui_test.mjs         # Popup theme dropdown and theme editor UI (41 tests)
node tests/custom_css_test.mjs       # Custom CSS sanitiser and injection (25 tests)
```

### Packaging for Release
Create a clean, production-ready ZIP archive for the Chrome Web Store:
```bash
./package-extension.sh
```

---

## 📚 Educational Guides & Documentation

- [How to Force Dark Mode on Chrome Websites](https://darkmode.pshah.fun/blog/how-to-force-dark-mode-chrome.html)
- [How to View and Read PDFs in Dark Mode on Chrome](https://darkmode.pshah.fun/blog/dark-mode-pdf-guide.html)
- [Dark Mode vs Night Mode: What's the Difference?](https://darkmode.pshah.fun/blog/dark-mode-vs-night-mode.html)
- [Choosing the Best Dark Mode Extension for Chrome](https://darkmode.pshah.fun/blog/best-dark-mode-extension-guide.html)
- [ThemeSwitcher vs. Dark Reader: Which Wins in 2026?](https://darkmode.pshah.fun/blog/themeswitcher-vs-dark-reader.html)
- [Chrome Web Store Listing Strategy](CHROMEWEBSTORE.md)

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our testing workflow and code standards.

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.
