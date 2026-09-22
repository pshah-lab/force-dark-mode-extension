# Chrome Web Store Developer Program Policy Compliance Audit

**Audit Date:** September 23, 2026  
**Extension Name:** Force Dark Mode - ThemeSwitcher  
**Manifest Version:** 3  
**Status:** Certified Compliant with Chrome Web Store Developer Program Policies  

---

## 1. Single-Purpose Policy Audit

> **CWS Policy Requirement:** An extension must have a single purpose that is narrow and easy to understand. Do not create an extension that requires all permissions or combines multiple unrelated features.

### Compliance Evaluation
- **Declared Purpose:** Applying intelligent dark mode and high-contrast color themes to websites and documents.
- **Evaluation:** ThemeSwitcher solely performs theme recoloring and document contrast adjustments. It does not bundle ad blockers, VPNs, crypto wallets, or unrelated tools.
- **Conclusion:** **Fully Compliant.**

---

## 2. Minimum Necessary Permissions Audit

> **CWS Policy Requirement:** Request only the permissions that are necessary to implement the extension's core features. Do not attempt to "future-proof" by requesting permissions not actively needed.

### Audit of Declared Permissions

| Declared Permission | Where Declared | Primary Functional Justification | Alternative Evaluated | Why Alternative is Inadequate |
| ------------------- | -------------- | -------------------------------- | --------------------- | ----------------------------- |
| `storage` | `manifest.json:permissions` | Required to save user's dark mode preferences (enabled state, engine, background color) per website and global defaults across browser sessions. | In-memory variables only | In-memory storage loses user preferences upon tab or browser close, breaking core functionality. |
| `activeTab` | `manifest.json:permissions` | Grants temporary active tab inspection when the user clicks the extension popup, allowing immediate page recoloring and luminance checks. | `<all_urls>` host permission | `activeTab` is significantly more privacy-preserving than broad host permissions because it only activates on user click. |
| `<all_urls>` | `manifest.json:content_scripts.matches` | Required to inject CSS override rules at `document_start` across arbitrary user-visited websites before initial DOM rendering. | Injection on user click via `activeTab` | Without `document_start` injection via content script matching `<all_urls>`, websites render as bright white before turning dark, causing severe white flash ("flashbang effect") that defeats dark mode utility. |

---

## 3. Remote Code Prohibition Audit

> **CWS Policy Requirement:** Manifest V3 extensions must not download or execute code hosted outside of the extension package. This includes scripts hosted on CDNs or dynamically generated strings passed to `eval()`.

### Compliance Evaluation
1. **CSP Declaration:**
   ```json
   "content_security_policy": {
     "extension_pages": "script-src 'self'; object-src 'none';"
   }
   ```
2. **Dynamic Execution Verification:** Codebase audit confirms zero occurrences of `eval()` or `new Function()` in extension code.
3. **Bundled Dependencies:** All third-party libraries (PDF.js: `pdf.min.mjs`, `pdf.worker.min.mjs`) are bundled locally inside `src/viewer/vendor/` and signed within the `.zip` archive.
4. **Conclusion:** **Fully Compliant.**

---

## 4. User Data & Limited Use Disclosures

In the Chrome Web Store Developer Dashboard, the developer certifies:
- **No Sale of User Data:** ThemeSwitcher does not sell user data to third parties.
- **No Use for Unrelated Purposes:** Preferences are used solely for theme rendering.
- **No Creditworthiness / Lending Use:** Not applicable.
- **No Third-Party Advertising:** ThemeSwitcher contains zero advertisements.
