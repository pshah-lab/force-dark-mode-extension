# ThemeSwitcher Incident Response & Breach Management Plan

**Classification:** Operational Security & Regulatory Procedure  
**Effective Date:** September 23, 2026  
**Incident Coordinator:** `pshah.lab@gmail.com`  

---

## 1. Incident Response Lifecycle

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  1. Detection &   │ ──> │  2. Triage &     │ ──> │  3. Containment  │
│     Reporting    │     │     Severity     │     │     & Isolation  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                            │
┌──────────────────┐     ┌──────────────────┐               │
│  6. Post-Incident │ <── │  5. Regulatory   │ <── ┌────────▼─────────┐
│     Post-Mortem  │     │     Notification │     │  4. Patch & CWS  │
└──────────────────┘     └──────────────────┘     │     Deployment   │
                                                  └──────────────────┘
```

---

## 2. Phase-by-Phase Procedures

### Phase 1: Detection & Reporting
- Security findings arrive via responsible disclosure to `pshah.lab@gmail.com` or automated dependency alerts.
- Maintainer acknowledges receipt within **48 hours**.

### Phase 2: Triage & Severity Classification
Incidents are categorized based on CVSS 3.1 criteria:
- **P0 - Critical (CVSS 9.0 - 10.0):** Remote Code Execution, arbitrary script injection into host pages, or unauthorized data exfiltration.
- **P1 - High (CVSS 7.0 - 8.9):** DOM-based XSS, sandbox escape, or privilege escalation.
- **P2 - Medium (CVSS 4.0 - 6.9):** Denial-of-Service via DOM mutation loop, unintended preference overwrites.
- **P3 - Low (CVSS 0.1 - 3.9):** Cosmetic style override flaws or minor documentation inaccuracies.

### Phase 3: Containment & Remediation
- Create a dedicated private patch branch.
- Identify the commit and version introducing the vulnerability.
- Develop and validate the remediation in an isolated local environment.
- Execute automated regression, DOM simulation, and privacy tests:
  ```bash
  npm test
  ```

### Phase 4: Chrome Web Store Emergency Deployment
- Increment the patch version in `manifest.json` (e.g. `1.6.1`).
- Package the extension cleanly:
  ```bash
  ./package-extension.sh
  ```
- Submit the signed package to the Google Chrome Web Store Developer Dashboard marked for accelerated review.
- Publish a corresponding security advisory on GitHub.

### Phase 5: Regulatory Assessment & Breach Notification

Because ThemeSwitcher does not operate backend databases or collect personal credentials, the risk of a centralized mass data breach is minimal. However, in the event of an identified vulnerability affecting client-side data:

| Jurisdiction | Regulatory Body | Statutory Threshold | Notification Timeline |
| ------------ | --------------- | ------------------- | --------------------- |
| **India** | Data Protection Board of India / CERT-In | Personal data breach under DPDP Sec. 8(6) / Cybersecurity incident under CERT-In Directions | As prescribed by applicable DPDP rules; CERT-In within 6 hours of noticing for specified cybersecurity incidents |
| **European Union** | Lead Supervisory Authority | Breach likely to result in a risk to rights and freedoms (GDPR Art. 33) | Within **72 hours** of becoming aware |
| **United Kingdom** | Information Commissioner's Office (ICO) | Breach presenting risk to individuals (UK GDPR Art. 33) | Within **72 hours** |
| **United States** | State Attorneys General / Affected Users | Unauthorized acquisition of unencrypted personal information | Varies by state statute (typically 30–45 days) |

### Phase 6: Post-Mortem & Preventive Action
- Conduct a blameless post-mortem within 7 days of resolution.
- Identify root causes (code oversight, regression, supply chain).
- Introduce new automated tests in `tests/privacy_security_test.mjs` to prevent recurrence.
- Publish transparent summary in project release notes.
