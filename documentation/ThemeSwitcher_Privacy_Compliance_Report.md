# ThemeSwitcher Privacy, Security & National/International Compliance Report

**Product:** Force Dark Mode - ThemeSwitcher  
**Version:** 1.6.0  
**Manifest Version:** 3  
**Audit Date:** September 23, 2026  
**Auditor / Roles:** Application Security Engineer, Privacy Engineer, Chrome Web Store Specialist  
**Status:** Technical Controls Implemented to Support Identified Requirements (Subject to Qualified Legal Review)  

---

## 1. Executive Summary

ThemeSwitcher (Force Dark Mode) is a client-side browser extension and companion website designed to provide intelligent dark themes and accessibility enhancements for web pages and documents (PDF, TXT, Markdown, RTF).

This comprehensive audit evaluated ThemeSwitcher against national and international data protection standards, including India’s **Digital Personal Data Protection Act, 2023 (DPDP Act)**, the European Union's **General Data Protection Regulation (EU GDPR)**, the **UK GDPR / PECR**, **US State Privacy Laws (CCPA/CPRA)**, and the **Chrome Web Store Developer Program Policies**.

### Key Findings & Implemented Controls:
- **100% Local-First Architecture:** The extension runs entirely inside the user's browser sandbox. ThemeSwitcher maintains zero developer servers, zero external databases, and zero proprietary APIs.
- **Zero Telemetry & Zero Cookies:** The extension contains zero tracking pixels, analytics SDKs, or remote error trackers. All third-party counter network requests on the companion website were eliminated.
- **Data Minimization:** Runtime message passing was hardened to transmit strictly sanitized domain hostnames (`host`), preventing URL path and query parameter leakage.
- **Self-Service User Rights:** A dedicated "Privacy & Data Management" center was introduced in the Options page, giving users autonomous control to export settings (GDPR Art. 20 Portability) and erase all stored preferences (DPDP Sec. 12 / GDPR Art. 17 Erasure) with one click.
- **Security Hardening:** Fallback iframe sandboxing was tightened to remove `allow-same-origin`, and the document viewer was refactored to eliminate all `innerHTML` usage in favor of safe DOM node creation.

---

## 2. Product Data Architecture

ThemeSwitcher operates across three distinct operational boundaries:
1. **Content Script Layer (Isolated World):** Injected into web pages at `document_start` to evaluate computed element luminance and inject dark CSS custom properties (`--force-dark-bg`, `--force-dark-surface`). It executes in an isolated JavaScript heap and cannot access host page variables or authentication cookies.
2. **Privileged Extension Context (Popup, Options, Service Worker):** Wakes up on user interaction, validates message senders (`sender.id === chrome.runtime.id`), sanitizes keys against prototype pollution, and persists configuration locally via `chrome.storage.sync`.
3. **Sandboxed Document Viewer:** Renders PDF, TXT, Markdown, and RTF documents locally using client-side HTML5 Canvas and bundled offline PDF.js libraries without network egress.

---

## 3. Data Inventory

| Item ID | Data Element | Source | Purpose | Storage Mechanism | Retention | Recipient | Legal Basis |
| ------- | ------------ | ------ | ------- | ----------------- | --------- | --------- | ----------- |
| **DI-1** | Domain Hostname (e.g. `example.com`) | Active tab URL | Maps theme rules to sites | `chrome.storage.sync` | User-managed | None | Legitimate Interest / User Request |
| **DI-2** | Engine Choice (`auto`, `css`, `invert`) | User selection | Executes selected algorithm | `chrome.storage.sync` | User-managed | None | Performance of Contract |
| **DI-3** | Custom Background Hex Color | User color input | Customizes dark surface tone | `chrome.storage.sync` | User-managed | None | User Customization |
| **DI-4** | Global Defaults Config | Options page | Fallback preferences | `chrome.storage.sync` | User-managed | None | Legitimate Interest |
| **DI-5** | Viewer Display Settings | Viewer inputs | Zoom, contrast, font size | `chrome.storage.sync` | User-managed | None | Legitimate Interest |
| **DI-6** | In-Memory Style Tokens | DOM styles | Contrast calculation | Ephemeral RAM | Discarded in ms | None | Technical Necessity |

---

## 4. Data Flow

```
[Web Page DOM] ──(Computed Styles Only)──> [Content Script] ──(CSS Overrides)──> [Page Display]
                                                    │
                                      (Zero Page Data Leaves Tab)
                                                    │
[User Click Popup] ──(Host Domain Only)──> [Service Worker] ──(Save)──> [chrome.storage.sync]
                                                                                │
                                                            (Encrypted User Google Sync)
```

1. **No Outbound Network Transmission:** No URLs, page contents, form fields, passwords, or cookies ever leave the client.
2. **Local Sync:** `chrome.storage.sync` synchronizes directly through the user's signed-in Google account without passing through any intermediate proxy.

---

## 5. Permissions Audit

| Permission | Scope | Justification & Need | Risk Assessment | Mitigation |
| ---------- | ----- | -------------------- | --------------- | ---------- |
| `storage` | Extension permissions | Persists per-site rules across sessions. Essential for core utility. | Low | Key sanitization (`isSafeKey`) prevents prototype pollution. |
| `activeTab` | Extension permissions | Inspects active tab on popup click to calculate luminance and toggle theme. | Low | Only granted upon explicit user click; terminates on navigation. |
| `<all_urls>` | `content_scripts.matches` | Injects CSS rules at `document_start` to eliminate blinding white screen flashes. | Medium | Script runs in isolated world; zero network calls; zero text reading. |

---

## 6. Security Audit

- **Content Security Policy (CSP):** `script-src 'self'; object-src 'none';` disallows dynamic strings as code (`eval`), remote scripts, and insecure object embeds.
- **XSS Defense:** Markdown viewer refactored from `innerHTML` to safe DOM construction (`createElement`, `textContent`, `replaceChildren`).
- **Iframe Sandboxing:** Fallback iframe hardened to `sandbox="allow-scripts"` with `allow-same-origin` strictly omitted.
- **Message Validation:** Every listener asserts `sender.id === chrome.runtime.id`.
- **Supply-Chain Security:** Only trusted, offline vendor files (PDF.js v4.5.136) bundled. Clean `package.json` created with 47 automated security and regression tests passing.

---

## 7. Privacy Audit

- **Tracking & Telemetry:** Verified 0 analytics SDKs, 0 tracking pixels, and 0 crash reporters.
- **Zero Tracking Cookies:** Both extension and companion website operate with 0 cookies.
- **Website Network Cleanliness:** Removed all external API calls (`abacus`, `countapi`) from `website/js/main.js`. Companion site is 100% static and private.
- **Do Not Track:** Respects `navigator.doNotTrack` and Global Privacy Control.

---

## 8. India Compliance Assessment (DPDP Act, 2023)

- **Data Fiduciary Role:** Developer determines means/purpose of preference storage.
- **Notice (Section 5):** Clear notices published in Privacy Policy, Store Listing, and Options UI.
- **Reasonable Security Safeguards (Section 8(5)):** State-of-the-art client isolation and CSP implemented.
- **Data Principal Rights (Sections 11–14):** Autonomous right to erasure and correction implemented in the Options UI.
- **Grievance Redressal (Section 8(10) / Sec. 13):** Published grievance contact (`pshah.lab@gmail.com`) with 48h acknowledgment and 30-day resolution SLA.
- **Children's Data (Section 9):** No tracking, monitoring, or profiling of minors.

---

## 9. EU/EEA Compliance Assessment (GDPR)

- **Territorial Scope (Art. 3):** Applicable via availability on CWS in the EEA.
- **Lawful Basis (Art. 6):** Art. 6(1)(b) (Performance of contract/request) and Art. 6(1)(f) (Legitimate interest).
- **Data Minimization (Art. 5(1)(c)):** Strictly minimized to site hostname keys.
- **Data Subject Rights (Arts. 15–21):** Access (Options view), Erasure (Options wipe button), Portability (JSON export button).
- **International Transfers (Chapter V):** Zero developer transfers to third countries.

---

## 10. UK Compliance Assessment (UK GDPR & PECR)

- Adheres to UK Data Protection Act 2018 and UK GDPR.
- Fully compliant with PECR: Zero non-essential cookies; zero cookie banner required.

---

## 11. US Compliance Assessment (CCPA/CPRA & State Laws)

- **Commercial Thresholds:** Below revenue ($25M) and consumer volume thresholds.
- **Consumer Disclosures:** Explicit certification that personal information is **NOT sold and NOT shared**.
- **COPPA Compliance:** No personal data collected from children under 13.

---

## 12. Other Jurisdictions (Canada, Australia, Brazil)

- **Canada (PIPEDA):** Aligned with fair information principles; open and transparent governance.
- **Australia (Privacy Act 1988):** Aligned with Australian Privacy Principles (APPs).
- **Brazil (LGPD):** Aligned with legitimate interest and contract performance legal bases.

---

## 13. Chrome Web Store Compliance

- **Single Purpose Policy:** Solely dedicated to web and document dark theming.
- **Limited Use Policy:** Certified that data is never used for advertising, lending, or sold to data brokers.
- **Remote Code Ban:** Zero remote scripts; verified by automated tests.

---

## 14. Third-Party Vendor Assessment

- **Zero Processors:** ThemeSwitcher engages 0 third-party data processors or sub-processors.
- Platform providers: Google LLC (Chrome Sync) and GitHub Inc. (Static hosting).

---

## 15. Data Retention

- **Server-Side Retention:** 0 days (no server exists).
- **Client-Side Retention:** Retained locally until user erases data or uninstalls the extension.

---

## 16. User Rights & Data Subject Request Workflow

Users exercise rights directly in the extension without submitting identification documents:
- **Export Settings:** Options -> Export Settings (JSON).
- **Erase All Data:** Options -> Erase All Stored Data.
- **Grievances:** Email to `pshah.lab@gmail.com`.

---

## 17. Breach Response Playbook

- Documented 6-phase lifecycle: Detection -> Triage -> Containment -> Patch -> Notification -> Post-Mortem.
- Assessment criteria mapped for DPDP Board / CERT-In, EU Supervisory Authorities (72h), and ICO.

---

## 18. Threat Model

Comprehensive STRIDE and Privacy threat model completed in `docs/security/threat-model.md`. All major vectors mitigated to negligible residual risk.

---

## 19. Compliance Matrix

18 major compliance requirements evaluated:
- **16 GREEN (Implemented & Verified)**
- **1 YELLOW (Draft Terms of Service requiring qualified counsel review)**
- **1 GRAY (Formal DPO not applicable)**
- **0 RED Gaps**

---

## 20. Remaining Risks & Residual Risk Register

| Risk | Impact | Likelihood | Residual Status | Planned Action |
| ---- | ------ | ---------- | --------------- | -------------- |
| Hostile website script mutation flood | Medium | Low | Low (Throttled by RAF) | Continual monitoring of MutationObserver performance |
| User confusion regarding Google Sync vs ThemeSwitcher | Low | Medium | Negligible | Clarified in Privacy Policy and Options UI |

---

## 21. Required Manual Actions

1. Review and publish Chrome Web Store listing updates in Developer Dashboard.
2. Confirm active ownership of security and grievance email `pshah.lab@gmail.com`.

---

## 22. Legal Review Items (Checklist for Qualified Legal Counsel)

> [!WARNING]
> While technical controls are fully implemented, the following items should be formally reviewed by qualified legal counsel prior to high-volume commercial scaling:
- [ ] Review and formalize draft `TERMS.md` and `website/terms.html`.
- [ ] Confirm governing law and dispute jurisdiction clauses.
- [ ] Validate formal Data Fiduciary registration status under evolving DPDP rules.
- [ ] Review commercial liability limitation disclaimers.

---

## 23. Files Changed & Added

### Codebase Changes:
- `src/popup/popup.js`: Minimized runtime messaging to pass `host` instead of `url: tab.url`.
- `src/background/serviceWorker.js`: Added `msg.host` support and key sanitization.
- `src/shared/storage.js`: Added `getAllConfigs`, `clearAllConfigs`, `exportSettingsJson`, `importSettingsJson`.
- `src/options/options.html`, `options.css`, `options.js`: Added Privacy & Data Management User Control Center.
- `src/viewer/viewer.html`: Hardened iframe sandbox (removed `allow-same-origin`).
- `src/viewer/viewer.js`: Safe DOM rendering without `innerHTML`.
- `website/js/main.js`: Eliminated third-party counter network requests.
- `package.json`: Created with module type and test scripts.
- `SECURITY.md`: Created security policy and responsible disclosure protocol.
- `PRIVACY.md` & `TERMS.md`: Updated root legal documents.
- `website/privacy.html`, `website/terms.html`, `docs/terms.html`, `docs/privacy.html`: Synchronized website pages.

### Structured Documentation (`docs/`):
- `docs/privacy/privacy-policy.md`
- `docs/privacy/data-inventory.md`
- `docs/privacy/data-flow.md`
- `docs/privacy/retention-policy.md`
- `docs/privacy/user-rights.md`
- `docs/privacy/subprocessors.md`
- `docs/security/SECURITY.md`
- `docs/security/security-model.md`
- `docs/security/threat-model.md`
- `docs/security/incident-response.md`
- `docs/compliance/compliance-matrix.md`
- `docs/compliance/jurisdiction-matrix.md`
- `docs/compliance/chrome-web-store-compliance.md`
- `docs/compliance/privacy-impact-assessment.md`

### Test Suites:
- `tests/privacy_security_test.mjs`: Automated privacy & security test suite (9 test groups).
- `tests/run_tests.mjs`: Updated and passing (34 tests).
- `tests/dom_engine_test.mjs`: Passing (4 tests).

---

## 24. Release Checklist

- [x] No unnecessary permissions requested (`storage`, `activeTab`, `<all_urls>`).
- [x] No server secrets or API keys in client code.
- [x] Zero outbound network requests in extension code.
- [x] Zero third-party telemetry or trackers on companion website.
- [x] Strict Content Security Policy implemented (`script-src 'self'; object-src 'none'`).
- [x] Safe DOM node creation; zero `innerHTML` in extension.
- [x] Fallback iframe strictly sandboxed without `allow-same-origin`.
- [x] Prototype pollution protection on storage keys.
- [x] Automated test suite passing (47/47 tests).
- [x] Privacy Policy matches code implementation exactly.
- [x] User data portability (JSON export) and erasure (one-click wipe) functional.
- [x] Security contact and grievance redressal established (`pshah.lab@gmail.com`).
- [x] All documentation structured in `/docs/privacy`, `/docs/security`, `/docs/compliance`.
