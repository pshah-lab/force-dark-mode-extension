# ThemeSwitcher Multi-Jurisdictional Legal Assessment

This document provides a jurisdiction-by-jurisdiction analysis of privacy, data protection, and platform compliance for ThemeSwitcher.

---

## 1. India: Digital Personal Data Protection Act, 2023 (DPDP Act)

### Applicability Assessment
- **Subject Matter:** Under Section 3, the DPDP Act applies to the processing of digital personal data within India, or outside India if offering goods or services to Data Principals in India.
- **Classification:** The developer operates as a **Data Fiduciary** determining the purpose and means of processing display preferences.
- **Data Principals:** Individual users installing the extension in India.

### Statutory Obligations & Technical Controls
1. **Notice Requirement (Section 5):** The extension provides transparent notice in the Options UI, Chrome Web Store listing, and Privacy Policy detailing what data is stored (`host` domain preference) and why.
2. **Consent & Legitimate Uses (Section 6 & 7):** Processing occurs strictly as a necessary technical consequence of the user's voluntary request to render dark mode.
3. **Reasonable Security Safeguards (Section 8(5)):** Strict CSP, prototype pollution protection, safe DOM node creation, and local-first sandboxing satisfy technical security requirements.
4. **Data Principal Rights (Sections 11–14):**
   - *Right to Correction & Erasure (Section 12):* Implemented via the Options UI "Erase All Stored Data" action.
   - *Right of Grievance Redressal (Section 13):* Point of contact designated (`pshah.lab@gmail.com`) with published escalation timelines.
5. **Children’s Personal Data (Section 9):** ThemeSwitcher does not engage in behavioral monitoring, targeted advertising, or profiling of children.
6. **Cross-Border Transfers (Section 16):** Because ThemeSwitcher transfers zero personal data to remote servers, no cross-border data transfer restrictions are triggered.

---

## 2. European Union: General Data Protection Regulation (EU GDPR)

### Applicability Assessment
- **Territorial Scope (Article 3(2)):** Extension is available for download in the EEA via the Chrome Web Store.
- **Role (Article 4(7)):** The developer acts as **Data Controller** for the extension's configuration architecture.
- **Lawful Basis (Article 6):**
  - *Article 6(1)(b) (Performance of Contract / User Request):* Storing site rules to apply dark mode as requested by the user.
  - *Article 6(1)(f) (Legitimate Interests):* Ensuring high-contrast readability and preserving user display preferences.

### Data Protection Principles (Article 5)
- **Data Minimization (Art. 5(1)(c)):** Only the hostname string, theme engine enum, and background hex color are stored. No URLs, browsing histories, or page texts are collected.
- **Storage Limitation (Art. 5(1)(e)):** User maintains full autonomy to erase all stored data locally at any time.
- **Integrity & Confidentiality (Art. 5(1)(f)):** Storage resides in user's encrypted OS profile storage.

### Data Subject Rights (Articles 15–21)
- *Access (Art. 15):* Options UI displays stored domain rules.
- *Erasure (Art. 17):* "Erase All Stored Data" button clears storage immediately.
- *Data Portability (Art. 20):* "Export Settings (JSON)" provides structured, machine-readable export.

### Transfers & Governance (Chapter V, Articles 30, 35, 37)
- **International Transfers:** Zero personal data is transferred to developer servers outside the EEA.
- **DPO / DPIA:** Not legally required (no large-scale systematic monitoring, no sensitive data).

---

## 3. United Kingdom: UK GDPR & Data Protection Act 2018

- **Substantive Alignment:** Follows EU GDPR principles as incorporated into UK domestic law.
- **PECR (Privacy and Electronic Communications Regulations):** The companion website uses zero non-essential tracking cookies and zero analytics trackers; no cookie banner is legally required.

---

## 4. United States: Comprehensive State Privacy Laws

### Laws Evaluated
- California Consumer Privacy Act (CCPA) / California Privacy Rights Act (CPRA)
- Virginia Consumer Data Protection Act (VCDPA)
- Colorado Privacy Act (CPA)
- Connecticut Data Privacy Act (CTDPA)
- Utah Consumer Privacy Act (UCPA)

### Statutory Threshold Analysis
ThemeSwitcher is an open-source utility that:
- Has gross annual revenues below $25M.
- Does not buy, sell, or share personal information of 100,000+ consumers.
- Does not derive 50%+ of revenue from selling consumer personal information.

### Disclosures & Safe Practices
Even though commercial thresholds do not legally bind ThemeSwitcher, we uphold consumer rights as best practice:
- **No Sale or Sharing of Personal Information:** We do not sell or share personal information under California Civil Code § 1798.140.
- **Do Not Track / Global Privacy Control (GPC):** The companion website checks `navigator.doNotTrack` and operates with zero analytics regardless of browser signals.
- **Children's Privacy (COPPA):** The product does not collect online contact information or persistent identifiers from children under 13.

---

## 5. Other International Jurisdictions

| Jurisdiction | Statute | Applicability Analysis | Current Posture |
| ------------ | ------- | ---------------------- | --------------- |
| **Canada** | Personal Information Protection and Electronic Documents Act (PIPEDA) | Applies to commercial activities involving personal information. ThemeSwitcher operates locally and does not collect or monetize personal info. | Compliant with fair information principles |
| **Australia** | Privacy Act 1988 & Australian Privacy Principles (APPs) | Threshold for "APP entities" ($3M AUD turnover) not met. Product adheres to open and transparent management of personal information (APP 1). | Aligned with APPs |
| **Brazil** | Lei Geral de Proteção de Dados (LGPD) | Applies to data processing targeting individuals in Brazil. Local storage basis aligns with legal basis of legitimate interest and contract execution (Art. 7, V and IX). | Technical controls support requirements |
