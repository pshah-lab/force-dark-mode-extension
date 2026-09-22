# Security Policy

ThemeSwitcher (Force Dark Mode) is committed to providing a secure, transparent, and private browsing experience. This security policy outlines our vulnerability disclosure process, supported versions, and operational safeguards.

---

## Supported Versions

Security updates and patches are actively maintained for the latest stable release:

| Version | Supported          | Security Maintenance Status |
| ------- | ------------------ | --------------------------- |
| 1.6.x   | :white_check_mark: | Active support & patches    |
| < 1.6.0 | :x:                | Deprecated. Please update   |

---

## Security Model Overview

ThemeSwitcher is built on a **100% client-side, local-first architecture**:
- **Zero Developer Servers:** ThemeSwitcher does not operate backend servers, user databases, or API gateways. There are no remote credentials or server-side databases that could be breached.
- **Strict Content Security Policy (CSP):** The extension disallows inline scripts, dynamic code evaluation (`eval`), and remote script loading in extension pages.
- **Isolated Execution:** Content scripts run in an isolated world and modify CSS/DOM styles without accessing or transmitting page content, form inputs, or cookies.
- **Sandboxed Rendering:** Local document rendering is executed inside dedicated browser sandboxes without `allow-same-origin` on fallback frames.

---

## Reporting a Vulnerability

We deeply appreciate the efforts of security researchers and community members who practice responsible disclosure.

If you believe you have found a security vulnerability in ThemeSwitcher:

1. **Do NOT open a public GitHub issue.**
2. Email your report directly to our security maintainer:
   - **Email:** `pshah.lab@gmail.com`
   - **Subject Line:** `[SECURITY] Vulnerability Report - ThemeSwitcher`

### What to Include in Your Report
To help us triage and resolve the issue quickly, please include:
- A clear description of the vulnerability and potential security impact.
- Affected component(s) (e.g. Content Script, Service Worker, Popup, Viewer, Options).
- Step-by-step instructions or a minimal Proof of Concept (PoC) demonstrating reproduction.
- Any suggested mitigations or patches (if available).

### Response Commitments & SLA
- **Initial Acknowledgment:** Within **48 hours** of receiving your report.
- **Triage & Validation:** Within **5 business days**, confirming severity and affected versions.
- **Remediation & Patch Target:** Critical and High severity issues are targeted for resolution within **14 calendar days**.
- **Coordinated Disclosure:** We will work with you to coordinate a public release timeline once an update has been approved and published to the Chrome Web Store.

---

## Safe Harbor

We consider activities conducted in accordance with this policy to be authorized. We will not pursue legal action against researchers who:
- Engage in good-faith testing without exploiting vulnerabilities beyond proving existence.
- Refrain from accessing, modifying, or destroying user data.
- Do not degrade the performance or reliability of browser extensions or companion sites.
- Give us reasonable time to remediate the vulnerability before public disclosure.

Thank you for helping keep ThemeSwitcher and the broader web ecosystem safe and private.
