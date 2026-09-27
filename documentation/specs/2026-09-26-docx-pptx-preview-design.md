# Design: Read-only .docx / .pptx preview in the Dark Document Viewer

**Date:** 2026-09-26
**Status:** Approved, pending implementation plan

## Goal

Extend the existing Dark Document Viewer (`src/viewer/`) — which already renders
PDF, TXT, Markdown, and RTF in dark mode — to also open Microsoft Word
(`.docx`) and PowerPoint (`.pptx`) files, as a **read-only content preview**:
text, basic structure (headings, paragraphs, bullet lists, bold/italic runs,
slide boundaries), and the viewer's existing dark color modes. Not a
faithful-layout renderer: no tables, images, headers/footers, footnotes,
speaker notes, or precise ordered-vs-unordered list distinction.

Legacy binary formats (`.doc`, `.ppt`, pre-2007, not ZIP-based) are out of
scope and get an explicit "legacy format not supported" message rather than
a silent or confusing failure.

## Why this scope

The user wants competitive parity features for Force Dark Mode without
turning the extension into a document-editing suite. A content-only preview
matches how the viewer already treats Markdown/TXT/RTF: read, structure,
color — not pixel-perfect reproduction. Full layout fidelity (docx-preview,
a real pptx renderer) would mean megabytes of new dependency code and a much
larger surface area, for a feature whose job is "read this file with my eyes
adjusted for dark mode," not "replace Word."

## Architecture

Both formats are ZIP archives containing XML parts:
- `.docx` → `word/document.xml` (paragraphs, runs, styles)
- `.pptx` → `ppt/slides/slide1.xml`, `slide2.xml`, ... (one XML part per slide)

### 1. `src/shared/zipReader.js` (new)

Pure, dependency-free ZIP reading using the browser's native
`DecompressionStream('deflate-raw')` (also available natively in Node 18+,
so this file is fully unit-testable without mocks or a browser).

```js
export async function listZipEntryNames(bytes: Uint8Array): Promise<string[]>
export async function readZipEntryText(bytes: Uint8Array, entryName: string): Promise<string | null>
```

Implementation outline:
- `listZipEntryNames`: locate the End Of Central Directory record (scan
  backwards from the end of the buffer for signature `PK\x05\x06`, within
  the last 65557 bytes to account for the maximum zip comment length), read
  the central directory offset/count, walk central directory entries
  (signature `PK\x01\x02`) collecting filenames only — no decompression.
- `readZipEntryText`: find the named entry's central directory record to get
  its local-header offset, compression method, and compressed size; read the
  Local File Header (signature `PK\x03\x04`) at that offset to compute the
  actual data start (header is 30 bytes + filename length + extra field
  length, both of which can differ slightly from the central directory
  record); if compression method is `8` (deflate), decompress via
  `DecompressionStream('deflate-raw')`; if `0` (stored), use the bytes as-is;
  any other method (including the general-purpose-flag encryption bit being
  set) returns `null` rather than attempting to process it.
- Safety guards: reject an entry if its claimed uncompressed size exceeds a
  fixed ceiling (50 MB) before attempting decompression, and abort the
  decompression stream if actual output exceeds that ceiling (basic
  zip-bomb protection, consistent with this project's existing defensive
  posture around URL allowlists and prototype-pollution guards).

### 2. `src/viewer/parsers/docxParser.js` (new)

Input: the UTF-8 text of `word/document.xml`.
Output: an array of block objects, one of:
- `{ type: "heading", level: 1|2|3, text }`
- `{ type: "paragraph", runs: [{ text, bold, italic }] }`
- `{ type: "listItem", runs: [...] }`

Implementation: regex-based extraction, not a full XML parser (Node has no
`DOMParser`, and this keeps one implementation identical in tests and the
browser — the same reasoning that led the existing `normalizeDocumentText`
RTF stripper to use regex rather than a parser library).

- Split into paragraphs by matching `<w:p[ >].*?<\/w:p>` (dotall).
- Per paragraph: check for `<w:pStyle w:val="Heading([1-3])"` or
  `w:val="Title"` (mapped to level 1) inside `<w:pPr>` for heading level;
  check for `<w:numPr` inside `<w:pPr>` for list-item status.
- Within each paragraph, split into runs by `<w:r[ >].*?<\/w:r>`; within each
  run, `<w:t[^>]*>(.*?)<\/w:t>` for text (decoding `&amp; &lt; &gt; &quot;
  &apos;` and numeric entities), and presence of `<w:b` / `<w:i` (excluding
  an explicit `w:val="0"` or `w:val="false"`) for bold/italic.
- A document with no recognizable `<w:p>` content (corrupt or unexpected
  schema) yields an empty array; the caller shows a clear fallback message
  rather than a blank page.
- Cap total extracted paragraphs (e.g. 2000) with a truncation marker block
  appended, so a pathologically large document can't hang the tab.

### 3. `src/viewer/parsers/pptxParser.js` (new)

Input: the entry list (to find and numerically sort `ppt/slides/slideN.xml`
parts) and a lookup function to fetch each slide's XML text.
Output: an array of slides, each `{ number, blocks: [{ runs: [{text, bold,
italic}] }] }`, where each block is one `<a:p>` paragraph inside the slide.

- Slide order = numeric sort of the `N` in `slideN.xml`. This is a documented
  simplification: true presentation order is technically defined by
  `ppt/presentation.xml`'s relationship list, but filenames match creation
  order in effectively all real-world files, and resolving the relationship
  chain for a read-only preview isn't worth the added complexity.
- Per slide XML: paragraphs via `<a:p[ >].*?<\/a:p>` (dotall); runs via
  `<a:r[ >].*?<\/a:r>`; text via `<a:t[^>]*>(.*?)<\/a:t>`; bold/italic via
  attributes directly on `<a:rPr ... b="1" ... i="1">` (pptx uses attributes
  here, unlike docx's child elements).
- Same entity decoding and truncation-guard approach as the docx parser
  (cap total slides processed, e.g. 500).

### 4. `viewer.js` / `viewer.html` integration

- `viewer.html`: extend the `file-input` `accept` attribute with
  `.docx,.pptx` and their MIME types
  (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/vnd.openxmlformats-officedocument.presentationml.presentation`);
  update the empty-state copy to mention the new formats.
- `viewer.js`:
  - `isOfficeDocument(file)` — extension/MIME check for docx/pptx.
  - `isLegacyOfficeDocument(file)` — extension/MIME check for `.doc`/`.ppt`,
    used only to show the explicit "legacy format not supported" message.
  - `openOfficeFile(file)` — reads `file.arrayBuffer()`, calls the
    appropriate parser via `zipReader.js`, and renders into the existing
    `document-panel` (the same panel Markdown/TXT/RTF already use — no new
    CSS panel needed, and the existing dark-mode CSS variables apply
    automatically).
  - `renderDocxBlocksSafely(blocks, container)` /
    `renderPptxSlidesSafely(slides, container)` — safe DOM construction
    (`createElement`/`textContent`/`append`, zero `innerHTML`) mirroring the
    existing `renderMarkdownSafely` pattern; slides get a "Slide N" label
    matching the PDF viewer's existing "Page N" per-page label styling.
  - `openLocalFile()` gets one more branch: `isOfficeDocument(file)` before
    the final "not supported" fallback, and `isLegacyOfficeDocument(file)`
    for the explicit legacy-format message.
- No manifest changes: no new permissions, no CSP changes (regex + native
  `DecompressionStream` need nothing extra).

## Error handling

- Not a valid ZIP (EOCD signature not found): caught in `openOfficeFile`,
  shown as "Could not read `<name>` — the file may be corrupted."
- Missing expected XML part (`word/document.xml` absent from a `.docx`, or
  no `ppt/slides/slideN.xml` parts in a `.pptx`): same fallback message.
- Encrypted/password-protected file (encryption bit set in the local file
  header, or an unsupported compression method): `readZipEntryText` returns
  `null`; caller shows "This file is password-protected and can't be
  previewed."
- Legacy `.doc`/`.ppt`: explicit "legacy Office format not supported, only
  .docx/.pptx" message, detected before attempting to parse as ZIP.

## Testing

- `tests/zip_reader_test.mjs` (new): builds real synthetic ZIP fixtures at
  test time using `CompressionStream('deflate-raw')` (available natively in
  the Node version this project's test suite already runs on) plus
  hand-assembled local/central-directory headers, then round-trips them
  through `listZipEntryNames`/`readZipEntryText`. Also covers: stored
  (uncompressed) entries, a missing entry name, and a deliberately
  oversized claimed-size entry being rejected.
- `tests/docx_pptx_parser_test.mjs` (new): feeds small hand-written XML
  fixture strings directly into `docxParser`/`pptxParser` (decoupled from
  the zip layer, same pattern as the existing `analyzePageForEngine` tests
  that don't need a real page). Covers headings, list items, bold/italic
  runs, multi-slide ordering, and the empty/malformed-input fallback case.
- Live verification in Chrome (as with every feature this session): open a
  real `.docx` and `.pptx` through the viewer's "Open file" button and
  confirm rendering across all four color modes.

## Out of scope / explicit non-goals

- Tables, images, headers/footers, footnotes, speaker notes.
- Precise ordered-vs-unordered list rendering (all list items render as a
  plain bulleted list).
- True presentation-order resolution via `presentation.xml` relationships
  (filename-numeric-sort is used instead).
- Legacy binary `.doc`/`.ppt`.
- Editing of any kind — this is a viewer, matching the rest of the extension.
