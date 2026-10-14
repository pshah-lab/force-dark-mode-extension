# ThemeSwitcher Subprocessor Register

**Last Reviewed:** October 14, 2026  

---

## 1. Third-Party Processor Register

Under Article 28 of the EU GDPR and applicable data protection regulations, organizations must maintain an accurate register of all data processors and subprocessors engaged to process personal data.

### Affirmative Certification
**ThemeSwitcher engages no third-party analytics providers or marketing subprocessors. The extension itself works fully offline. The optional, opt-in anonymous usage statistics (off by default) are received by a first-party endpoint operated by the developer, which runs on the infrastructure providers listed in section 2 (Vercel and Supabase) acting only as hosting and database infrastructure.**

---

## 2. Infrastructure & Operating Environment Providers

For technical accuracy, the underlying browser and hosting platforms operated by third parties are documented below:

| Entity | Role / Service | Processing Scope | Data Location | Legal Safeguards & Terms |
| ------ | -------------- | ---------------- | ------------- | ------------------------ |
| **Google LLC / Alphabet Inc.** | Browser Platform & Chrome Sync Infrastructure | If the user enables Google Chrome Sync, Google synchronizes `chrome.storage.sync` data across user's signed-in devices. ThemeSwitcher has no access to this infrastructure. | Google Global Data Centers | [Google Privacy Policy](https://policies.google.com/privacy) & Google Chrome Enterprise terms |
| **Vercel Inc.** | Hosting of the first-party usage-statistics endpoint (`https://pshah.fun/api/darkmode-telemetry*`) | Only if the user opts in: runs the developer's ingest and delete functions that receive the anonymous report (random ID, day, versions, OS family, UI language, yes/no usage flags). The server function does not store IP addresses (platform request logs may transiently contain them). | Region selected by the developer; not fixed in this document | [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy) |
| **Supabase, Inc.** | Managed Postgres database for the usage statistics | Only if the user opts in: stores the anonymous report rows. Rows are removed on the user's Delete my data request, otherwise purged automatically after 13 months. | Region selected by the developer; not fixed in this document | [Supabase Privacy Policy](https://supabase.com/privacy) |
| **GitHub, Inc. / Microsoft Corp.** | Static Content Hosting (GitHub Pages) | Serves static HTML, CSS, and client-side JavaScript for the companion website and documentation repository. | Global Edge CDN | [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement) |

---

## 3. Subprocessor Change Notification

ThemeSwitcher engages Vercel and Supabase only as infrastructure for the opt-in usage statistics. If this model changes, including any new subprocessor, users will receive notice via release notes and an updated Privacy Policy before any third-party processor is introduced.
