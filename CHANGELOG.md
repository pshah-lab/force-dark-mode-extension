# Changelog

All notable changes to the **Force Dark Mode - ThemeSwitcher** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
