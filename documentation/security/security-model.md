# ThemeSwitcher Security Model & Architecture

**Classification:** Technical Architecture & Defense-in-Depth Specification  
**Version:** 1.6.0  

---

## 1. Executive Architectural Principles

ThemeSwitcher is built on three core security pillars:
1. **Local-First Isolation:** Zero reliance on remote servers, APIs, or dynamic code compilation.
2. **Strict Least Privilege:** Minimal Manifest V3 permissions (`storage`, `activeTab`, and scoped content scripts).
3. **Defense-in-Depth Execution:** Comprehensive boundary defense, strict CSP, prototype pollution filtering, and safe DOM node rendering.

---

## 2. Manifest V3 Execution Boundaries

ThemeSwitcher leverages the Manifest V3 security paradigm to ensure that untrusted web content cannot compromise the extension or access privileged browser APIs.

```
┌─────────────────────────────────────────────────────────────┐
│                       Web Page Context                      │
│  - Hostile or Untrusted Web DOM & Scripts                   │
│  - Can execute arbitrary client JavaScript                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Isolated World Boundary
                               │ (DOM shared, JS heap isolated)
┌──────────────────────────────▼──────────────────────────────┐
│                Content Script (Isolated World)               │
│  - Runs src/content/index.js, cssOverrideEngine, invertEngine│
│  - Reads computed styles (colors/backgrounds)               │
│  - Injects CSS custom properties & data-* attributes        │
│  - NO access to page JS variables or window objects         │
│  - Validates sender.id === chrome.runtime.id for messages   │
└──────────────────────────────┬──────────────────────────────┘
                               │ chrome.runtime.sendMessage
                               │ (Structured serialization)
┌──────────────────────────────▼──────────────────────────────┐
│           Background Service Worker (Privileged)            │
│  - Handles theme toggles and persistence                    │
│  - Validates host key against DISALLOWED_KEYS prototype list│
│  - Never evaluates dynamic strings as code                  │
│  - Communicates exclusively with chrome.storage.sync        │
└──────────────────────────────┬──────────────────────────────┘
                               │ Local Chrome Profile
┌──────────────────────────────▼──────────────────────────────┐
│                     chrome.storage.sync                     │
│  - Sandboxed local key-value store in user Chrome profile   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Component Security Controls

### A. Background Service Worker (`src/background/serviceWorker.js`)
- **Event-Driven Lifecycle:** Wakes up only when messages are received and terminates when idle, preventing persistent memory residency.
- **Strict Sender Verification:** Every incoming message is verified:
  ```javascript
  if (sender.id !== chrome.runtime.id) return;
  if (!msg || typeof msg !== "object" || msg.type !== "TOGGLE") return;
  ```
- **Host Key Sanitization:** Host keys are validated against prototype pollution attacks before being stored in `chrome.storage.sync`.
- **Data Minimization:** Accepts minimized `host` string directly from popup, preventing propagation of full URLs with sensitive query parameters.

### B. Content Script & Theme Engines (`src/content/`)
- **Isolated World Protection:** Scripts run in the Chrome isolated world. Hostile scripts on the page cannot access or modify extension functions, variables, or listeners.
- **Passive Style Reading:** The auto-detection engine inspects computed styles (`getComputedStyle`) and bounding rects. It never reads or serializes page text, form values, input tokens, or cookies.
- **MutationObserver Batching:** DOM mutations are debounced via `requestAnimationFrame` to prevent denial-of-service or performance exhaustion from rapid DOM mutations.

### C. Storage Layer (`src/shared/storage.js`)
- **Prototype Pollution Prevention:** Rejects dangerous object keys (`__proto__`, `constructor`, `prototype`):
  ```javascript
  const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  function isSafeKey(key) {
    return typeof key === "string" && key.length > 0 && !DISALLOWED_KEYS.has(key.trim().toLowerCase());
  }
  ```
- **Typed Normalization:** Ensures all incoming configuration objects have explicit boolean and string fallbacks, preventing type-confusion attacks.

### D. Dark Document Viewer (`src/viewer/`)
- **No Remote Code Evaluation:** Bundled offline PDF.js engine (`pdf.min.mjs`, `pdf.worker.min.mjs`).
- **Safe DOM Rendering:** Markdown and document text rendering is built exclusively via `document.createElement`, `textContent`, and safe tokenizers. Zero use of `innerHTML`.
- **Hardened Iframe Sandbox:** The fallback preview iframe is configured with `sandbox="allow-scripts"` and `referrerpolicy="no-referrer"`. The insecure `allow-same-origin` token is strictly omitted.

---

## 4. Content Security Policy (CSP)

ThemeSwitcher declares an uncompromising CSP in `manifest.json`:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none';"
}
```

- **`script-src 'self'`:** Disallows loading any external, remote, or CDN scripts. Every script executed in extension pages must originate from within the signed extension package.
- **`object-src 'none'`:** Disallows Flash, Java, or arbitrary plugin embeds.
- **No `unsafe-eval`:** Dynamic string evaluation via `eval()` or `new Function()` is disallowed and blocked by the browser engine.
