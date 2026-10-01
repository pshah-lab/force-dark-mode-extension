# Chameleon Convert — Roadmap

**Status:** Decomposition agreed. No sub-project has an approved detailed spec yet.
**Last updated:** 2026-10-01

## Context

The extension's document viewer (PDF/docx/pptx, read-only, zero-dependency
parsers) is being spun out of the Chrome extension into its own standalone
webapp — **Chameleon Convert**, the product already teased on the
homepage's "Coming Soon" section (`docs/index.html`). This is the app
referenced in the Chameleon Labs rebrand's nav "Products" dropdown.

The extension (Force Dark Mode / ThemeSwitcher) keeps only website dark
mode (Auto/CSS/Invert engines, scheduling, shortcuts) — its original,
narrow purpose. All file-related functionality — viewing, and the three
new features below — move to the new webapp, positioned like pdf0.dev /
ilovepdf.com / ihatepdf.cv: a general file-tools site, not just "dark mode
for files."

## Foundational decisions (already made)

- **Hosting:** `convert.pshah.fun` (subdomain of the user's existing
  personal domain, same pattern as `darkmode.pshah.fun`), deployed on
  Vercel. "Chameleon Convert" is the working product name, not
  necessarily the final brand name.
- **Stack:** React + Vite. A deliberate departure from the extension's
  zero-build vanilla-JS philosophy — justified because this app has real
  UI complexity ahead (file-type routing, an editing UI, a spreadsheet
  grid) that vanilla JS handles less gracefully than the extension's
  simpler settings panels did.
- **Reuse:** `src/viewer/parsers/docxParser.js`, `pptxParser.js`, and
  `src/shared/zipReader.js` have zero `chrome.*` dependency and port over
  as-is. Only `viewer.js` itself is tangled with `chrome.storage` and
  DOM-by-ID lookups and needs a real rewrite as React components.

## Sub-projects, in build order

Each of these gets its own full brainstorm → clarifying questions →
design → written spec → `writing-plans` → implementation cycle when its
turn comes. This roadmap is the decomposition, not the design for any one
of them.

### 0. Chameleon Convert — scaffold (foundation, do first)
New repo, React + Vite, deployed to `convert.pshah.fun`. Port the
existing read-only PDF/docx/pptx viewer over as the app's starting
baseline, plus a landing page. "Done" state: feature parity with what
the extension's viewer does today, running standalone. See the
[scaffold design spec](2026-10-01-chameleon-convert-scaffold-design.md)
for full detail.

### 1. Extension simplification (triggered by ~70% completion, not by #0)
The extension **keeps its document viewer fully intact** through
sub-projects 0–3 and partway into 4 — it is explicitly *not* removed
just because Chameleon Convert reaches parity. Only once Chameleon
Convert is roughly 70% through this whole roadmap (substantially more
capable than what it's replacing, not just equal to it) does the
extension's popup "Open file viewer" button get swapped for a link out
to Chameleon Convert and the in-extension viewer gets stripped.
Bounded-sized change to the existing extension repo when that threshold
is judged reached — no new spec needed, just the normal bounded-change
flow.

### 2. Font/style customization (smallest new feature)
Extends the ported viewer's existing settings (font size already exists
in `viewer.html`) with font family choice and whatever else "other
things" turns out to mean once scoped.

### 3. Excel (.xlsx) dark mode viewer (new file-format support)
Same pattern as docx/pptx (zero-dependency ZIP-based parser), but
rendering is harder — grid/table layout, per-cell styles, multiple
sheets, column widths — not flowing text like docx/pptx.

### 4. Editing + download (largest, do last)
Real editing UI plus a format-preserving writer — the `CompressionStream`
counterpart to the ZIP reader already built — that reassembles a valid
docx/pptx/xlsx with edits merged in, everything else byte-for-byte
untouched.

**Privacy:** stays 100% local. Editing happens in-memory in the browser;
export uses `<a download>` + `Blob` or the File System Access API — no
server round-trip either way. The "Zero Tracking. Zero Telemetry." claim
carries over unchanged.

**Real risk is correctness, not privacy:** OOXML is a genuinely complex
format. A self-built writer that doesn't perfectly round-trip content it
doesn't understand (complex tables, embedded charts, certain formatting)
could silently produce a corrupted file. Design for this sub-project must
address it explicitly — e.g. "only allow editing text/formatting we fully
understand; pass everything else through byte-for-byte unchanged" — not
treat it as an afterthought.

## Deliberately unresolved (don't block on these)

- Final brand name for the webapp (domain is settled: convert.pshah.fun).
- Monetization — free like the extension, or not.
- Exact scope of "other things" in the font/style customization feature.

## Next step

Pick a sub-project (0 is the natural start) and run it through
`superpowers:brainstorming` properly — clarifying questions, approaches,
sectioned design, written spec — before any implementation.
