# ThemeSwitcher Privacy Impact Assessment (PIA / DPIA)

**Evaluation Date:** September 23, 2026  
**Frameworks:** GDPR Article 35 (Data Protection Impact Assessment) & EDPB Guidelines on DPIAs (wp248rev.01)  

---

## 1. Executive Determination

Based on the criteria established by the European Data Protection Board (EDPB) and Article 35 of the EU GDPR, a **formal statutory DPIA is NOT legally required** for ThemeSwitcher.

However, in accordance with the principle of **Privacy by Design and by Default (GDPR Article 25)**, this documented evaluation details our architectural privacy assessment.

---

## 2. Threshold Evaluation Criteria (EDPB WP248 Checklist)

The EDPB provides nine criteria to determine whether processing is "likely to result in a high risk":

| Criterion | ThemeSwitcher Processing Status | Risk Triggered? |
| --------- | -------------------------------- | --------------- |
| **1. Evaluation or scoring (Profiling)** | ThemeSwitcher does not evaluate or score individuals. | :x: No |
| **2. Automated decision-making with legal effect** | Zero automated decisions affecting user legal status. | :x: No |
| **3. Systematic monitoring** | ThemeSwitcher does not monitor user browsing behavior or track users across sites. | :x: No |
| **4. Sensitive data or data of highly personal nature** | ThemeSwitcher never collects special categories of data (GDPR Art. 9/10), passwords, financial details, or biometric data. | :x: No |
| **5. Data processed on a large scale** | While the extension has thousands of users, processing is 100% decentralized and local on client machines. | :x: No |
| **6. Matching or combining datasets** | ThemeSwitcher does not match or combine datasets with any third party. | :x: No |
| **7. Data concerning vulnerable subjects (Children)** | The product is a general accessibility utility not targeting children. | :x: No |
| **8. Innovative use or applying new tech solutions** | Standard browser CSS custom property injection and HTML5 canvas rendering. | :x: No |
| **9. Preventing data subjects from exercising a right** | Fully user-controlled; rights exercised directly in the browser Options UI. | :x: No |

### Conclusion
Because **zero of the nine high-risk criteria** are met, formal regulatory submission or prior consultation with a supervisory authority under GDPR Article 36 is not required.

---

## 3. Privacy Safeguards Implemented

To maintain a low-risk posture throughout the application lifecycle:
1. **Decentralized Local Storage:** Preferences are stored exclusively in `chrome.storage.sync`.
2. **No Egress:** Content scripts do not send network requests; zero data leaves the client sandbox.
3. **One-Click Erasure:** Users can erase all stored preferences immediately via the Options page.
4. **Transparent Governance:** All source code and architectural models are openly auditable on GitHub.
