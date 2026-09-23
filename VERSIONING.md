# Versioning Methods and Release Nomenclature

**Project:** Force Dark Mode - ThemeSwitcher  
**Standard:** [Semantic Versioning 2.0.0 (SemVer)](https://semver.org/spec/v2.0.0.html)  
**Target Platform:** Google Chrome Web Store (Manifest V3)  
**Latest Published Version:** `1.6.0`  
**Current Active Release:** `1.6.1`  
**Last Updated:** 2026-09-23  

---

## 1. Overview & Purpose

This document formalizes the versioning scheme, release nomenclature, branching strategy, and artifact generation protocols for the **Force Dark Mode - ThemeSwitcher** browser extension and its companion ecosystem. Strict adherence guarantees deterministic releases, transparent change management for users and auditors, and seamless compliance with Google Chrome Web Store Developer Policies.

---

## 2. Semantic Versioning Specification (SemVer 2.0.0)

Extension version identifiers follow the format:

$$\text{MAJOR}.\text{MINOR}.\text{PATCH}$$

Example: `1.6.1`

### 2.1 Component Definitions

| Component | Trigger / Scope | Example Scenarios |
| :--- | :--- | :--- |
| **MAJOR** (`X.0.0`) | Breaking changes, architectural shifts, incompatible storage schema rewrites, or browser platform migrations. | Transitioning from Chrome Manifest V2 to V3; rewriting storage keys with breaking schema incompatibilities; total engine architectural overhaul. |
| **MINOR** (`1.X.0`) | Backward-compatible feature additions, new engines, or major capability upgrades. | Adding the offline local PDF/document dark reader (`1.6.0`); introducing native SPA dark mode detection; adding new color presets. |
| **PATCH** (`1.6.X`) | Backward-compatible security hardening, privacy compliance controls, bug fixes, performance optimizations, or UI polish. | Adding User Control Center for GDPR/DPDP export & erase (`1.6.1`); refactoring to 0 `innerHTML`; sanitizing runtime messaging; updating security policies. |

---

## 3. Chrome Web Store Requirements & Constraints

Google Chrome Web Store imposes platform-specific technical constraints on version strings:

1. **Format**: Must consist of one to four dot-separated integers (e.g., `1.6.1` or `1.6.1.0`). No alphabetic suffixes (e.g., `-alpha`, `-rc1`) are allowed in `manifest.json`.
2. **Monotonic Progression**: Each submitted version must be strictly greater than the previously published version (`1.6.1 > 1.6.0`). You cannot republish, overwrite, or downgrade an existing version number in the Chrome Web Store.
3. **Immutability**: Once an archive is uploaded to the Chrome Web Store Developer Console, that exact version string is burned into the store's history.
4. **Review Lifecycle**:
   - `Draft`: Archive uploaded; listing details and privacy declarations configured.
   - `In Review`: Submitted to Google automated and human policy review (typically 24–72 hours).
   - `Published`: Live on the Chrome Web Store and distributed automatically via background auto-update.

---

## 4. Release Nomenclature & Conventions

### 4.1 Git Tag Nomenclature
Git release tags must strictly adhere to the prefix format:

$$\text{v}\text{MAJOR}.\text{MINOR}.\text{PATCH}$$

- **Published Baseline:** `v1.6.0` (Latest release published on the Chrome Web Store)
- **Current Release:** `v1.6.1` (Privacy & Security Compliance Release)
- **Command to Tag:**
  ```bash
  git tag -a v1.6.1 -m "Release v1.6.1: Privacy & Security compliance controls, User Control Center, and hardened DOM rendering"
  ```

### 4.2 Release Archive Nomenclature
Distribution ZIP archives submitted to the Chrome Web Store Developer Console follow the exact naming template:

$$\text{force-dark-mode-v}\{\text{VERSION}\}\text{.zip}$$

- **v1.6.0 Package:** `force-dark-mode-v1.6.0.zip` (Historical)
- **v1.6.1 Package:** `force-dark-mode-v1.6.1.zip` (Current)
- **Generated via:** `./package-extension.sh`

### 4.3 Git Commit Nomenclature (Conventional Commits)
All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat:` New features or capabilities (triggers MINOR or PATCH depending on scope).
- `fix:` Bug fixes or behavioral corrections (triggers PATCH).
- `sec:` Security hardening, sandbox isolation, or vulnerability patches (triggers PATCH).
- `docs:` Documentation, compliance manuals, or privacy policy updates.
- `chore:` Dependency management, build tooling, or packaging scripts.
- `test:` Test suites, automated verification assertions, or mock updates.
- `refactor:` Code restructuring that does not change external behavior.

---

## 5. Document & Policy Versioning Nomenclature

Legal and compliance documentation adheres to dedicated lifecycle versioning independent of the extension binary, but documented together:

| Document | Current Version | Effective Date | Rationale |
| :--- | :--- | :--- | :--- |
| **Privacy Policy** (`PRIVACY.md`) | `v2.0.0` | 2026-09-23 | Major overhaul expanding multi-jurisdictional compliance (DPDP, GDPR, CCPA). |
| **Security Policy** (`SECURITY.md`) | `v1.1.0` | 2026-09-23 | Added 48h SLA, supported versions table, and vulnerability disclosure protocols. |
| **Terms of Service** (`TERMS.md`) | `v1.0.0` | 2026-09-23 | Initial formal release of open-source software terms. |
| **Compliance Report** | `v1.6.1` | 2026-09-23 | Master report matching extension release v1.6.1. |

---

## 6. Pre-Release Version Synchronization Checklist

Before tagging or submitting a release, all of the following files must be synchronized:

- [ ] **`manifest.json`**: `"version": "1.6.1"`
- [ ] **`package.json`**: `"version": "1.6.1"`
- [ ] **`src/shared/storage.js`**: Exported JSON backup metadata contains `version: "1.6.1"`
- [ ] **`src/options/options.html`**: Footer contains `ThemeSwitcher v1.6.1`
- [ ] **`README.md`**: Version badge points to `version-1.6.1-indigo.svg`
- [ ] **`SECURITY.md`**: Supported versions table lists `1.6.x` as active and `< 1.6.1` as deprecated
- [ ] **`CHROMEWEBSTORE.md`**: Version history table documents `1.6.1` with release notes
- [ ] **`CHANGELOG.md`**: Section `## [1.6.1] - 2026-09-23` contains all additions and changes
- [ ] **`website/index.html` & `docs/index.html`**: Schema.org `softwareVersion` set to `"1.6.1"`
- [ ] **Automated Tests**: Run `npm test` to verify that all unit, DOM, and privacy tests pass cleanly (47+ tests)

---

## 7. Packaging & Release Workflow

1. **Verify Version Alignment & Run Test Suite**:
   ```bash
   npm test
   ```
2. **Build Distribution Archive**:
   ```bash
   ./package-extension.sh
   ```
   *Output: `force-dark-mode-v1.6.1.zip`*
3. **Inspect Package Contents**:
   Ensure the ZIP archive contains only production files:
   - `manifest.json`
   - `assets/` (icons, pdfjs)
   - `src/` (background, content, options, popup, shared, viewer)
   - *Strictly excludes:* `documentation/`, `docs/`, `tests/`, `website/`, `.git/`, `.DS_Store`, markdown files.
4. **Git Commit & Tag**:
   ```bash
   git add .
   git commit -m "feat(compliance): release v1.6.1 with privacy controls, security hardening, and compliance documentation"
   git tag -a v1.6.1 -m "Release v1.6.1"
   git push origin main --tags
   ```
5. **Chrome Web Store Submission**:
   - Log in to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
   - Select **Force Dark Mode - ThemeSwitcher**.
   - Upload `force-dark-mode-v1.6.1.zip` via the "Package" tab.
   - Confirm Privacy declarations match `CHROMEWEBSTORE.md`.
   - Submit for review.
