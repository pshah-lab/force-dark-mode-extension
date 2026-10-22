# ThemeSwitcher Comprehensive Compliance Matrix

This matrix maps ThemeSwitcher against international privacy statutes, security frameworks, and platform policies.

### Status Legend
- **GREEN (Implemented):** Technical controls and documentation fully implemented and verified in code.
- **YELLOW (Partially Implemented / Operational):** Technical controls in place; ongoing operational adherence or business registration required.
- **RED (Gap Requiring Action):** Outstanding gap requiring immediate remediation.
- **GRAY (Not Applicable):** Statutory provision evaluated and determined not applicable to product architecture.

---

## Compliance Requirements Matrix

| Requirement | Statutory / Policy Source | Applies? | Current Status | Code Change | Documentation | Qualified Legal Review Needed? |
| ----------- | ------------------------- | -------- | -------------- | ----------- | ------------- | ------------------------------ |
| **Data Minimization** | GDPR Art. 5(1)(c) / DPDP Sec. 4 | Yes | **GREEN** | Minimized runtime message passing to `host` only; reports limited to the exact fields in PRIVACY.md (broken-site report: domain, engine, theme, version; usage report: random ID, day, version, engine flags, site count) | Documented in Data Inventory & Flow Map | No |
| **Local-First Architecture** | Privacy by Design (GDPR Art. 25) | Yes | **GREEN** | 100% client-side theme execution; the only developer-run endpoint receives the user-confirmed broken-site report and the opt-in usage report, both off unless the user acts | Documented in Security Model | No |
| **User Notice & Transparency** | DPDP Sec. 5 / GDPR Art. 13-14 / CCPA 1798.100 | Yes | **GREEN** | Clear notices in Options page, Store Listing, and Website | Privacy Policy v2.1.0 published (covers 2.0.0 and 2.1.0) | Recommended for formal legal sign-off |
| **Right to Erasure / Deletion** | DPDP Sec. 12 / GDPR Art. 17 / CCPA 1798.105 | Yes | **GREEN** | "Erase All Stored Data" button in Options wipes local storage; turning off the 2.1.0 usage report (or Delete my data in 2.0.0) deletes the server records for the random ID; broken-site reports carry no ID and are purged after 13 months | User Rights Execution Guide | No |
| **Right to Data Portability** | GDPR Art. 20 / CCPA 1798.130 | Yes | **GREEN** | "Export Settings (JSON)" and "Import Settings (JSON)" implemented | User Rights Execution Guide | No |
| **Grievance Redressal Mechanism** | DPDP Sec. 8(10) / IT Rules 2021 | Yes | **GREEN** | Dedicated contact `pshah.lab@gmail.com` documented with 48h SLA | Privacy Policy & Security Policy | Recommended for formal entity appointment |
| **Reasonable Security Safeguards** | DPDP Sec. 8(5) / GDPR Art. 32 | Yes | **GREEN** | Strict CSP, XSS-free DOM rendering, prototype pollution protection | Security Model & STRIDE Threat Model | No |
| **Personal Data Breach Response** | DPDP Sec. 8(6) / GDPR Art. 33-34 | Yes | **GREEN** | Documented response procedure, escalation matrix, and regulatory timelines | Incident Response Playbook | Recommended for legal counsel alignment |
| **Children's Data Protection** | DPDP Sec. 9 / COPPA / GDPR Art. 8 | Yes | **GREEN** | Zero profiling and zero behavioral tracking; no personal data without opt-in (a broken-site report carries no ID; the usage report is off by default) | Privacy Policy & Jurisdiction Matrix | Recommended |
| **Cookie & Tracking Consent** | ePrivacy Directive / PECR / DPDP | Yes | **GREEN** | Zero tracking cookies on website; eliminated third-party count APIs | Cookie & Tracking Audit | No |
| **Cross-Border Data Transfers** | GDPR Chapter V / DPDP Sec. 16 | Limited (reports only) | **YELLOW** | Local data never leaves the device. Reports reach a first-party endpoint on Vercel and Supabase in regions selected by the developer and not fixed in this document | Subprocessor Register | No |
| **CWS Single Purpose Requirement** | Chrome Web Store Policy | Yes | **GREEN** | Sole dedicated focus: dark mode styling for websites and documents | CHROMEWEBSTORE.md | No |
| **CWS Minimum Necessary Permissions** | Chrome Web Store Policy | Yes | **GREEN** | Restricted to `storage`, `activeTab`, `sidePanel` (2.1.0), `<all_urls>` (content scripts); no host permissions | CHROMEWEBSTORE.md | No |
| **CWS Remote Code Prohibition** | Chrome Web Store Policy | Yes | **GREEN** | Zero remote scripts; bundled offline PDF.js; `script-src 'self'` | Security Model & CSP | No |
| **Data Protection Officer (DPO)** | GDPR Art. 37 / DPDP Sec. 10 | No | **GRAY** | Thresholds not met (no core large-scale monitoring or sensitive data processing) | PIA Evaluation | Recommended for confirmation |
| **Formal Record of Processing (RoPA)** | GDPR Art. 30 | Recommended | **GREEN** | Lightweight RoPA maintained via Data Inventory | Data Inventory | Recommended for formal corporate record |
| **Formal Privacy Impact Assessment** | GDPR Art. 35 | No | **GRAY** | High-risk thresholds not triggered; lightweight evaluation completed | Privacy Impact Assessment | Recommended |
| **Commercial Terms of Service** | Contract Law / Consumer Protection | Yes | **YELLOW** | Standard open-source MIT terms & draft TOS created | TERMS.md / website/terms.html | Yes (Legal counsel review required) |
