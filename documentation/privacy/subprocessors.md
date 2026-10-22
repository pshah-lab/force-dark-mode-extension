# ThemeSwitcher Subprocessor Register

**Last Reviewed:** October 17, 2026 (Policy Version 2.1.0)  

---

## 1. Third-Party Processor Register

Under Article 28 of the EU GDPR and applicable data protection regulations, organizations must maintain an accurate register of all data processors and subprocessors engaged to process personal data.

### Affirmative Certification
**ThemeSwitcher engages no third-party analytics providers or marketing subprocessors. The extension itself works fully offline. The user-confirmed broken-site report (version 2.1.0 and later; no ID) and the optional, opt-in usage reports (off by default) are received by first-party endpoints operated by the developer, which runs on the infrastructure providers listed in section 2 (Vercel and Supabase) acting only as hosting and database infrastructure. They process the data on our behalf; reports are never sold, and only combined totals from the 2.0.0 usage statistics (never individual reports or random IDs) are published at darkmode.pshah.fun/stats.html, with groups of fewer than 10 installs never shown.**

---

## 2. Infrastructure & Operating Environment Providers

For technical accuracy, the underlying browser and hosting platforms operated by third parties are documented below:

| Entity | Role / Service | Processing Scope | Data Location | Legal Safeguards & Terms |
| ------ | -------------- | ---------------- | ------------- | ------------------------ |
| **Google LLC / Alphabet Inc.** | Browser Platform & Chrome Sync Infrastructure | If the user enables Google Chrome Sync, Google synchronizes `chrome.storage.sync` data across user's signed-in devices. ThemeSwitcher has no access to this infrastructure. | Google Global Data Centers | [Google Privacy Policy](https://policies.google.com/privacy) & Google Chrome Enterprise terms |
| **Vercel Inc.** | Hosting of the first-party endpoints (`https://pshah.fun/api/darkmode-report`, `https://pshah.fun/api/darkmode-telemetry` and `-delete`) | Only when the user sends a broken-site report (domain, engine, theme, version; no ID) or opts in to a usage report (2.1.0: random ID, day, version, engine flags, site count; 2.0.0: random ID, day, versions, OS family, UI language, yes/no usage flags): runs the developer's ingest and delete functions. The server function does not store IP addresses (platform request logs may transiently contain them, along with the browser's User-Agent and Accept-Language headers). | Region selected by the developer; not fixed in this document | [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy) |
| **Supabase, Inc.** | Managed Postgres database for the reports | Stores broken-site report rows and, for users who opted in, usage report rows. Usage rows are removed when the user turns the 2.1.0 report off (or uses Delete my data in 2.0.0); all rows are otherwise purged automatically after 13 months. | Region selected by the developer; not fixed in this document | [Supabase Privacy Policy](https://supabase.com/privacy) |
| **GitHub, Inc. / Microsoft Corp.** | Static Content Hosting (GitHub Pages) | Serves static HTML, CSS, and client-side JavaScript for the companion website and documentation repository. | Global Edge CDN | [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement) |

---

## 3. Subprocessor Change Notification

ThemeSwitcher engages Vercel and Supabase only as infrastructure for the broken-site report and the opt-in usage reports. If this model changes, including any new subprocessor, users will receive notice via release notes and an updated Privacy Policy before any third-party processor is introduced.
