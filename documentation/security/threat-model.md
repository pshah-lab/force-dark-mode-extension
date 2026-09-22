# ThemeSwitcher Threat Model

This document specifies the Application Security Threat Model (STRIDE) and Privacy Threat Model for ThemeSwitcher.

---

## 1. Scope & Assets

| Asset ID | Asset Description | Sensitivity | Security Objective |
| -------- | ----------------- | ----------- | ------------------ |
| **A-1** | User Domain Configurations (`chrome.storage.sync`) | Low / Medium | Integrity & Confidentiality (Prevent unauthorized tampering or leakage) |
| **A-2** | Visited Web Page Content & DOM | High | Confidentiality (Must never be read, extracted, or transmitted) |
| **A-3** | Visited URLs & Query Parameters | High | Confidentiality (Prevent transmission across untrusted boundaries) |
| **A-4** | Local PDF & Document Files | High | Confidentiality & Integrity (Render strictly within local sandbox) |
| **A-5** | Extension Code & Execution Context | High | Integrity (Prevent arbitrary code execution or privilege escalation) |

---

## 2. STRIDE Application Threat Model

### S — Spoofing Identity
- **Threat:** Malicious web pages or rogue extensions attempt to impersonate ThemeSwitcher components via runtime messaging.
- **Likelihood:** Low | **Impact:** High
- **Mitigation:**
  - Content script and service worker listeners explicitly verify `sender.id === chrome.runtime.id`.
  - Disallow external messaging (`onMessageExternal` is not registered in `manifest.json`).
- **Residual Risk:** Negligible.

### T — Tampering with Data
- **Threat:** Malicious web pages or crafted JSON imports attempt Prototype Pollution to overwrite `Object.prototype` or manipulate extension execution flow.
- **Likelihood:** Low | **Impact:** High
- **Mitigation:**
  - Storage methods enforce `isSafeKey()`, rejecting `__proto__`, `constructor`, `prototype`.
  - JSON imports validate structure and enforce typed sanitization on every key-value pair before committing to storage.
- **Residual Risk:** Negligible.

### R — Repudiation
- **Threat:** Unauthorized modifications made to user settings without user awareness.
- **Likelihood:** Very Low | **Impact:** Low
- **Mitigation:**
  - Settings are stored strictly in the user's authenticated Chrome profile storage (`chrome.storage.sync`).
  - Options UI exposes live counts and explicit export mechanisms.
- **Residual Risk:** Negligible.

### I — Information Disclosure
- **Threat 1:** Visited URL query parameters (e.g. `?token=secret`) leaked to background scripts or storage.
- **Likelihood:** Low | **Impact:** Medium
- **Mitigation:**
  - Popup parses tab URL and transmits only `host: host` to the service worker. Full URLs are never persisted.
- **Threat 2:** Visited web page content, form fields, or passwords extracted by content scripts.
- **Likelihood:** Very Low | **Impact:** Critical
- **Mitigation:**
  - Content scripts inspect only computed style properties (`backgroundColor`, `color`, `fill`). They never read `input.value`, `textarea.value`, or serialized text.
  - Zero outbound network requests exist in the extension code.
- **Residual Risk:** Negligible.

### D — Denial of Service
- **Threat:** Hostile web pages trigger infinite DOM mutation loops, causing browser tab freezing or memory exhaustion.
- **Likelihood:** Medium | **Impact:** Low / Medium
- **Mitigation:**
  - `MutationObserver` ignores mutations triggered by ThemeSwitcher's own `data-force-dark` attributes.
  - Scan executions are batched and throttled using `requestAnimationFrame`.
  - Large DOMs are capped with sample limits (`ANALYSIS_SAMPLE_LIMIT = 300`).
- **Residual Risk:** Low.

### E — Elevation of Privilege
- **Threat:** Cross-Site Scripting (XSS) in Options or Viewer leading to extension context compromise.
- **Likelihood:** Very Low | **Impact:** Critical
- **Mitigation:**
  - Manifest V3 blocks remote code execution and inline scripts via CSP (`script-src 'self'`).
  - Markdown viewer constructs DOM nodes using `textContent` and `createElement`, completely eliminating `innerHTML`.
  - Fallback iframe in Viewer uses `sandbox="allow-scripts"` without `allow-same-origin`.
- **Residual Risk:** Negligible.

---

## 3. Privacy Threat Model

| Privacy Threat | Description | Likelihood | Impact | Implemented Mitigation | Residual Risk |
| -------------- | ----------- | ---------- | ------ | ---------------------- | ------------- |
| **Unnecessary Collection** | Storing extraneous user data not required for dark mode | Low | Medium | Strict data minimization: only store domain, engine enum, and hex color | Negligible |
| **Excessive Permissions** | Requesting broad browser permissions (e.g. `tabs`, `webRequest`, `cookies`) | Low | High | Permissions restricted to `storage` and `activeTab`. Zero cookie or history permissions requested | Negligible |
| **URL Leakage** | Transmitting URLs with sensitive query strings across boundaries | Low | Medium | Runtime messages transmit sanitized hostname only | Negligible |
| **Page-Content Leakage** | Exfiltrating document text or web form inputs | Very Low | Critical | Content scripts process styles in memory; zero outbound network calls in extension | Negligible |
| **Fingerprinting** | Generating persistent browser fingerprints | Very Low | High | Zero hardware, canvas, or audio fingerprinting scripts | Negligible |
| **Third-Party Tracking** | Embedding advertising SDKs or analytics trackers | Low | High | Zero third-party telemetry, tracking pixels, or external API calls | Negligible |
| **Excessive Retention** | Retaining data indefinitely on remote servers | Low | High | Zero server-side retention. Local data erasable with one click | Negligible |
