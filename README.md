# Force Dark Mode - ThemeSwitcher

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.6.0-indigo.svg)](manifest.json)
[![Tests](https://img.shields.io/badge/tests-32%20passed-success.svg)](tests/)
[![Website](https://img.shields.io/badge/website-live-cyan.svg)](https://pshah-lab.github.io/force-dark-mode-extension/)

**Force Dark Mode - ThemeSwitcher** is a lightweight, privacy-first Chrome extension that transforms websites, local documents, and PDF files into eye-friendly, customizable dark themes.

Unlike crude global inverters that turn photos, videos, and layouts into neon negatives, ThemeSwitcher evaluates page luminance and structure to apply the optimal dark strategy automatically.

🌐 **Live Website & Guides**: [https://pshah-lab.github.io/force-dark-mode-extension/](https://pshah-lab.github.io/force-dark-mode-extension/)

---

## 🚀 Key Features

- **Intelligent Auto Engine (Default)**: Dynamically detects whether a page is text-heavy, media-heavy, or already dark.
- **Native Dark Site Detection**: Automatically detects native dark modes on sites like YouTube, GitHub, and Reddit—leaving them untouched to avoid double-inversion glitches.
- **Layout-Safe CSS Override Engine**: Recolors backgrounds, typography, forms, and borders with contrast-tested CSS custom properties while preserving media elements.
- **Smart Logo Inversion**: Selectively inverts dark/black logos on dark backgrounds for crystal-clear readability.
- **Built-in Offline Dark PDF & Document Reader**: Render online and local PDF files locally using bundled PDF.js with saturation-aware pixel conversion. Also supports Markdown (`.md`), Plain Text (`.txt`), and RTF.
- **Per-Site Background Customizer**: Choose between pitch-black (`#000000`) for OLED power savings or midnight slate (`#0f1115`) from the popup. Surfaces and borders adapt automatically.
- **Zero White Flashes**: Injected at `document_start` so pages render dark immediately without blinding white flashes.
- **Instant Toggle**: Toggle themes on the fly without refreshing the page.
- **100% Offline & Private**: Zero telemetry, zero external network requests, and no tracking pixels.

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

---

## 🔒 Privacy & Permissions

ThemeSwitcher is built with privacy by design:
- **No telemetry or analytics**: Zero tracking beacons, no Google Analytics, no third-party scripts.
- **Zero external servers**: All computation is executed 100% locally on your machine.
- **Minimal Manifest V3 Permissions**:
  - `storage`: Storing domain preferences locally in Chrome Sync.
  - `activeTab`: Inspecting luminance and applying styles when the user opens the popup.
  - `<all_urls>` (content_scripts): Applying dark mode at `document_start` to prevent white flashes.

Read our complete [Privacy Policy](https://pshah-lab.github.io/force-dark-mode-extension/privacy.html) or [PRIVACY.md](PRIVACY.md).

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
Run the comprehensive unit and DOM simulation test suites:
```bash
# File integrity, color math, and security checks (28 tests)
node tests/run_tests.mjs

# DOM simulation, engine switching, and YouTube detection (4 tests)
node tests/dom_engine_test.mjs
```

### Packaging for Release
Create a clean, production-ready ZIP archive for the Chrome Web Store:
```bash
./package-extension.sh
```

---

## 📚 Educational Guides & Documentation

- [How to Force Dark Mode on Chrome Websites](https://pshah-lab.github.io/force-dark-mode-extension/blog/how-to-force-dark-mode-chrome.html)
- [How to View and Read PDFs in Dark Mode on Chrome](https://pshah-lab.github.io/force-dark-mode-extension/blog/dark-mode-pdf-guide.html)
- [Dark Mode vs Night Mode: What's the Difference?](https://pshah-lab.github.io/force-dark-mode-extension/blog/dark-mode-vs-night-mode.html)
- [Choosing the Best Dark Mode Extension for Chrome](https://pshah-lab.github.io/force-dark-mode-extension/blog/best-dark-mode-extension-guide.html)
- [Chrome Web Store Listing Strategy](CHROMEWEBSTORE.md)

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our testing workflow and code standards.

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.
