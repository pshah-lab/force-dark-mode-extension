# ThemeSwitcher Data Inventory

This inventory documents every data element processed, stored, or referenced by the ThemeSwitcher browser extension and companion website.

---

## Data Inventory Matrix

| ID | Data Element | Category | Source | Technical Purpose | Storage Mechanism | Retention Schedule | Third-Party Recipients | Legal Basis (GDPR / DPDP) | Can User Delete? |
| -- | ------------ | -------- | ------ | ----------------- | ----------------- | ------------------ | ---------------------- | -------------------------- | ---------------- |
| **DI-01** | Website Hostname (e.g. `github.com`, `local_files`) | Configuration Key | Extracted from active tab URL | Maps custom dark mode preference to specific domain | `chrome.storage.sync` | Stored locally until modified or cleared by user | None (synced via Google Chrome sync if enabled) | Legitimate Interest (GDPR Art. 6(1)(f)) / Service Fulfillment | Yes, via Options "Erase All Stored Data" or by clearing site toggle |
| **DI-02** | Per-Site Engine Selection (`auto`, `css`, `invert`) | Preference Value | User selection or Auto mode detection | Determines which dark mode transformation algorithm is executed | `chrome.storage.sync` | Stored locally until modified or cleared by user | None | Legitimate Interest / Performance of Contract | Yes, via Options or popup toggle |
| **DI-03** | Custom Background Color Hex (e.g. `#0f1115`) | Preference Value | User color picker selection | Customizes base dark canvas background tone | `chrome.storage.sync` | Stored locally until modified or cleared by user | None | Legitimate Interest / User Customization | Yes, via Options or popup color picker |
| **DI-04** | Global Defaults Config (`__global_defaults__`) | Configuration | Options page inputs | Fallback preferences for sites without custom rules | `chrome.storage.sync` | Persistent until edited or cleared | None | Legitimate Interest | Yes, via Options save or clear |
| **DI-05** | Viewer Display Configuration (`__force_dark_viewer__`) | Configuration | Viewer control inputs | Remembers user's zoom level, contrast, font size, and color mode in document reader | `chrome.storage.sync` | Persistent until edited or cleared | None | Legitimate Interest | Yes, via Options clear or viewer controls |
| **DI-06** | Local Feedback Form Submissions | User Provided Content | User submission on `website/support.html` | Pre-fills email draft and caches submission locally | Browser `localStorage` (`fdex_feedback_entries`) | Stored in local browser cache; user can wipe browser data | None (sent via user's email client if user clicks send) | Affirmative Consent (GDPR Art. 6(1)(a) / DPDP Sec. 6) | Yes, via browser storage clear |
| **DI-07** | In-Memory DOM Luminance Samples | Ephemeral Telemetry | Computed element styles in content script | Determines if website is already dark or requires inversion | RAM only (never persisted or written to disk) | Discarded immediately after analysis function returns (milliseconds) | None (Never leaves tab context) | Legitimate Interest (Engine Heuristic) | N/A (Ephemeral in RAM) |

---

## Data Elements Explicitly Excluded (Zero Processing)

ThemeSwitcher certifies that the following categories are **never collected, never stored, and never transmitted**:
1. Browsing history and complete URLs (paths, query parameters, anchors).
2. Web page DOM text, articles, or document bodies.
3. Form values, login credentials, passwords, or authentication cookies.
4. Financial information or payment details.
5. IP addresses or device hardware fingerprints by the extension.
6. Personal communications, emails, or chat logs.
