# Chameleon Convert — Scaffold & Viewer Port (Sub-project 0) — Design

**Status:** Approved design, ready for implementation planning.
**Parent:** [2026-09-30-chameleon-convert-roadmap.md](2026-09-30-chameleon-convert-roadmap.md)
**Last updated:** 2026-10-01

## Goal

Stand up a new standalone webapp — **Chameleon Convert** — that ports the
extension's read-only PDF/docx/pptx dark document viewer to run outside
the extension, plus a landing page. This is the foundation every other
roadmap sub-project (font/style customization, Excel viewer,
editing+download) builds on top of.

**Done state:** a deployed app, at feature parity with the extension's
current viewer, reachable at a public URL, with a landing page
introducing Chameleon Convert and linking to the live viewer.

## Non-goals (explicitly out of scope for this sub-project)

- Font/style customization beyond what the extension viewer already has
  (font size slider, background/text color pickers) — that's sub-project 2.
- Excel support — sub-project 3.
- Any editing or file export/download — sub-project 4.
- Removing the document viewer from the extension itself — sub-project 1,
  sequenced right after this one reaches parity, not part of this spec.
- A custom domain — ships on a `.vercel.app` URL; domain is on the
  roadmap's deliberately-unresolved list.
- User accounts, cross-device settings sync, or any backend/database —
  this stays a 100% client-side static app, same as the extension.

## Repo & stack

- New GitHub repo: `pshah-lab/chameleon-convert` (separate from
  `force-dark-mode-extension`).
- React + Vite, plain JavaScript (not TypeScript — consistent with the
  rest of the codebase; revisit TS when sub-project 4's format-preserving
  writer lands, where type safety earns more of its keep).
- Plain CSS with custom properties, ported from `docs/css/style.css`'s
  color tokens/fonts — not Tailwind — so the app is visually consistent
  with the Chameleon Labs brand already live on darkmode.pshah.fun.
- React Router for the two routes (`/`, `/viewer`).
- `pdfjs-dist` installed from npm (not hand-vendored like the extension
  had to do under Manifest V3's CSP) — Vite handles worker bundling
  natively via `new URL('pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url)`.
- MIT license, matching the extension's existing open-source commitment.

## Project structure

```
chameleon-convert/
  src/
    main.jsx                 — entry, React Router setup
    routes/
      Landing.jsx             — home page: hero + tool cards
      Viewer.jsx               — the ported dark document viewer
    components/
      FileDropzone.jsx         — drag-and-drop + "Browse" fallback
      ModeSelect.jsx            — Smart Dark / Invert / Sepia / Original
      ColorPicker.jsx            — background + text color inputs
      FontSizeSlider.jsx          — carried over from extension viewer
      PdfPageCanvas.jsx            — per-page canvas render (PDF)
      DocumentPanel.jsx             — docx/pptx "page card" render
      EmptyState.jsx                  — "open a file" placeholder
    lib/
      parsers/
        docxParser.js            — ported near-verbatim from extension
        pptxParser.js             — ported near-verbatim from extension
        zipReader.js                — ported near-verbatim from extension
      pdfRender.js                   — Smart Dark/Invert/Sepia pixel
                                        conversion logic, ported from
                                        viewer.js
      settings.js                      — localStorage read/write wrapper
    styles/
      tokens.css                        — ported color/font custom
                                           properties from the extension
                                           site's style.css
      ...component-scoped CSS files
  index.html
  vite.config.js
  package.json
```

## State management

Plain `useState`/`useReducer` inside `Viewer.jsx` — mode, background
color, text color, font size, contrast, loaded-file state. No Redux/
Zustand/Context: the extension's equivalent state was a handful of
variables in `viewer.js`, and nothing about porting it to React changes
that scope. Adding a state library here would be solving a problem that
doesn't exist yet.

## Settings persistence

`localStorage`, via a small `lib/settings.js` wrapper mirroring the shape
of the extension's `chrome.storage.sync` calls (same keys/defaults where
sensible, so the mental model carries over even though the storage
mechanism differs). Per-device only — no account system, no sync across
browsers/devices in this sub-project.

## File handling & privacy

- Drag-and-drop zone (`FileDropzone`) plus a "Browse" button fallback —
  upgrade over the extension's button-only picker, since a standalone
  webapp has room for a proper dropzone UX.
- Reads happen via the standard `File`/`FileReader` APIs, 100%
  client-side. No network request ever contains file content — same
  zero-upload privacy guarantee the extension already makes.
- Accepted types: `.pdf`, `.docx`, `.pptx`, `.doc`, `.ppt`, `.txt`, `.md`,
  `.markdown`, `.rtf` — the same list `viewer.html`'s file input accepts
  today.

## PDF rendering

Ports `viewer.js`'s saturation-aware canvas pixel-conversion logic
(Smart Dark / Invert / Sepia / Original modes) into `lib/pdfRender.js`,
called from `PdfPageCanvas.jsx`. `pdfjs-dist` from npm replaces the
hand-vendored `pdf.min.mjs`/`pdf.worker.min.mjs` files — meaningful
simplification, since Manifest V3's CSP restrictions (the reason they
were vendored in the first place) don't apply to a normal webapp.

## Landing page

Hero introducing Chameleon Convert, followed by a tool-card grid:

| Card | Status |
| --- | --- |
| Dark Document Viewer (PDF, Word, PowerPoint) | Live — links to `/viewer` |
| Excel Dark Mode | Coming Soon badge |
| Edit & Export | Coming Soon badge |

Visually consistent with the "Coming Soon" card pattern already shipped
on the extension's homepage (`docs/index.html`'s Chameleon Convert
teaser section) — same badge style, same restraint (no fake metrics,
learned from the extension site's earlier fabricated-counter issue).

## Testing

Vitest + React Testing Library. `docx_parser_test.mjs`,
`pptx_parser_test.mjs`, and `zip_reader_test.mjs` from the extension repo
have zero `chrome.*` dependency and port over with only import-path
changes — not rewrites. New tests needed for the React components
themselves (file drop handling, mode switching, settings persistence)
and for `pdfRender.js`'s pixel-conversion logic (can mostly reuse the
extension's existing DOM-engine-style test patterns).

## Deployment

- New Vercel project connected to the `chameleon-convert` GitHub repo.
- Auto-deploy on push to `main`; preview deployments per PR (standard
  Vercel behavior, no custom CI config needed for a static Vite app).
- Ships on the Vercel-assigned `.vercel.app` URL. Custom domain is
  deliberately deferred (see roadmap doc).

## Relationship to sub-project 1 (extension simplification)

Not part of this spec, but the trigger condition: once this app reaches
verified feature parity with the extension's current viewer (manually
tested against the same `test-fixtures/` sample files used for the
extension), sub-project 1 strips the document viewer out of the
extension and points its popup's "Open file viewer" button here instead.
That work gets its own short bounded-change design when it starts — it
doesn't need a spec of its own given its size.

## Open questions deliberately deferred

- Final custom domain / brand name.
- Monetization.
- Whether `doc`/`ppt` (legacy binary Office formats, currently detected
  but explicitly rejected with a "convert to .docx/.pptx first" message
  in the extension) get real support here or keep the same rejection
  behavior. Default: port the existing rejection behavior as-is; revisit
  only if it becomes a real user complaint.
