# Versioning Policy and Release Nomenclature

**Document Reference:** `documentation/compliance/versioning-policy.md`  
**Root Mirror:** `VERSIONING.md`  
**Governing Standard:** Semantic Versioning 2.0.0 (SemVer)  
**Distribution Target:** Google Chrome Web Store (Manifest V3)  
**Latest Published Version:** `1.6.0`  
**Active Compliance Release:** `1.6.1`  
**Effective Date:** 2026-09-23  

---

## 1. Compliance Mandate

Software release governance requires unambiguous traceability between source code commits, testing verification logs, distribution binaries, and regulatory privacy declarations.

Under the India Digital Personal Data Protection (DPDP) Act 2023, EU General Data Protection Regulation (GDPR), and Google Chrome Web Store Developer Program Policies, every published software version must:
1. Feature an immutable, monotonically increasing version identifier.
2. Maintain a full public changelog of data processing and security changes.
3. Guarantee that privacy policy and permission disclosures match the exact binary submitted under that version number.

---

## 2. Versioning Specification (SemVer 2.0.0)

Version strings strictly adhere to the tripartite structure:

$$\text{MAJOR}.\text{MINOR}.\text{PATCH}$$

- **MAJOR (X.0.0)**: Substantive architectural transformations, breaking schema migrations, or platform version changes (e.g. Manifest V2 to V3).
- **MINOR (1.X.0)**: Backward-compatible feature additions (e.g. `1.6.0` introducing local PDF/document dark reader and SPA native dark detection).
- **PATCH (1.6.X)**: Backward-compatible security updates, privacy compliance controls, bug fixes, refactoring, and documentation alignment (e.g. `1.6.1` implementing the Privacy & Data Management Center, zero `innerHTML` refactor, host-only messaging, and 47 compliance tests).

---

## 3. Chrome Web Store Versioning Rules

Chrome Web Store enforces platform-level version validation:
- **Format**: 1 to 4 dot-separated integers (`MAJOR.MINOR.PATCH` or `MAJOR.MINOR.PATCH.BUILD`).
- **Monotonicity**: Any new upload must be strictly higher than the currently published version (`1.6.1 > 1.6.0`).
- **Review Cycle**:
  1. *Draft*: Upload of `force-dark-mode-v1.6.1.zip` to Developer Console.
  2. *In Review*: Google automated static analysis and human policy inspection.
  3. *Published*: Instant or scheduled rollout to all users.

---

## 4. Git & Release Nomenclature

- **Git Tags**: Prefixed with `v`, e.g. `v1.6.0` (Latest Published) and `v1.6.1` (Current).
- **Package Archive**: Template `force-dark-mode-v${VERSION}.zip` (e.g. `force-dark-mode-v1.6.1.zip`).
- **Commit Messages**: Conventional Commits standard (`feat:`, `fix:`, `sec:`, `docs:`, `test:`, `refactor:`, `chore:`).
- **Changelog**: Maintained in `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## 5. Pre-Release Version Synchronization Matrix

| File | Target Value for v1.6.1 | Verification Method |
| :--- | :--- | :--- |
| `manifest.json` | `"version": "1.6.1"` | Automated test assertion |
| `package.json` | `"version": "1.6.1"` | Automated test assertion |
| `src/shared/storage.js` | `version: "1.6.1"` | Automated test assertion |
| `src/options/options.html` | `ThemeSwitcher v1.6.1` | Automated test assertion |
| `README.md` | `version-1.6.1-indigo.svg` | Regex match |
| `SECURITY.md` | Active: `1.6.x`, Deprecated: `< 1.6.1` | Static audit |
| `CHROMEWEBSTORE.md` | Table entry for `1.6.1` | Static audit |
| `CHANGELOG.md` | `## [1.6.1] - 2026-09-23` section | Static audit |
| `website/index.html` | `"softwareVersion": "1.6.1"` | Schema.org validation |
| `docs/index.html` | `"softwareVersion": "1.6.1"` | Schema.org validation |

---

## 6. Execution Command Sequence

```bash
# 1. Verify test suite (47+ tests)
npm test

# 2. Package release archive
./package-extension.sh

# 3. Tag historical published release (if not yet tagged)
git tag -a v1.6.0 93dd033 -m "Release v1.6.0: Local PDF/Document Dark Viewer, Native Dark Detection, Enhanced Inversion"

# 4. Commit and tag active release
git add .
git commit -m "feat(compliance): release v1.6.1 with privacy controls, security hardening, and compliance documentation"
git tag -a v1.6.1 -m "Release v1.6.1: Privacy controls, User Control Center, hardened DOM, and compliance audit"

# 5. Push code and tags to remote
git push origin main --tags
```
