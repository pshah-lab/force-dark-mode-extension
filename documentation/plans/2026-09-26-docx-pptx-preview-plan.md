# Docx/Pptx Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Dark Document Viewer open `.docx` and `.pptx` files as a read-only content preview (text, headings, lists, bold/italic, slide boundaries) rendered in the viewer's existing dark color modes.

**Architecture:** A dependency-free ZIP reader (`src/shared/zipReader.js`, using the native `DecompressionStream('deflate-raw')` API) extracts the relevant XML parts from the `.docx`/`.pptx` archive. Two regex-based parsers (`src/viewer/parsers/docxParser.js`, `src/viewer/parsers/pptxParser.js`) — not a full XML parser, since Node has no `DOMParser` and regex keeps one implementation identical in tests and the browser — turn that XML into simple block/slide structures. `viewer.js` renders those structures into the existing `document-panel`, reusing all the dark-mode CSS Markdown/TXT/RTF already use.

**Tech Stack:** Vanilla JS (ES modules), native browser `DecompressionStream`/`CompressionStream` (also available in Node 18+, confirmed on this project's Node 24 test runner), no new npm/vendor dependencies.

**Spec:** `documentation/specs/2026-09-26-docx-pptx-preview-design.md`

## Global Constraints

- Zero new dependencies — no vendored libraries, only native browser/Node APIs.
- No manifest changes — no new permissions, no CSP changes.
- No `innerHTML` anywhere (matches this project's existing security test: "popup.js does not use innerHTML" / "viewer.js completely avoids innerHTML" in `tests/run_tests.mjs` and `tests/privacy_security_test.mjs`) — all rendering via `createElement`/`textContent`/`append`.
- Entry decompression capped at 50 MB (`MAX_ENTRY_SIZE`); encrypted ZIP entries (general-purpose flag bit 0 set) must throw a distinct error identifying them as password-protected, never attempt decompression or get silently treated as "not found."
- Legacy `.doc`/`.ppt` (binary, pre-2007, not ZIP-based) must show an explicit "legacy format not supported" message, never be silently treated as corrupt or unsupported-generic.
- Tests must run via the existing `npm test` command (`node tests/run_tests.mjs && ...`), following the existing `test:name` script + concatenation pattern in `package.json`.

## Review Focus

- A `.docx`/`.pptx` file that is actually a renamed non-ZIP file (or truncated download) must show a clear "could not read / may be corrupted" message, not a blank panel or an uncaught exception in the console.
- A `.docx` missing `word/document.xml` (malformed/unexpected internal structure) must fall back gracefully, not throw past `openOfficeFile` into an unhandled rejection.
- A `.pptx` with zero `ppt/slides/slideN.xml` entries must show a clear message, not an empty viewer with no feedback.
- A password-protected `.docx`/`.pptx` must show the specific "password-protected" message, not the generic corruption message (they're different situations a user should be told apart).
- Re-opening a second file after one is already displayed must fully reset the previous render (no leftover slides/paragraphs from the first file mixed into the second) — the existing PDF path already resets via `renderGeneration`; the office-file path needs its own equivalent guard against a stale/slow load overwriting a newer one.

---

## Task 1: ZIP reader

**Files:**
- Create: `src/shared/zipReader.js`
- Test: `tests/zip_reader_test.mjs`
- Modify: `package.json:7` (test script)

**Interfaces:**
- Produces: `listZipEntryNames(bytes: Uint8Array): Promise<string[]>`, `readZipEntryText(bytes: Uint8Array, entryName: string): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

Create `tests/zip_reader_test.mjs`:

```js
// tests/zip_reader_test.mjs
import assert from "assert";
import { listZipEntryNames, readZipEntryText } from "../src/shared/zipReader.js";

console.log("=========================================");
console.log("📦 Running ZIP Reader Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

function writeUint32(arr, offset, value) {
  new DataView(arr.buffer).setUint32(offset, value, true);
}
function writeUint16(arr, offset, value) {
  new DataView(arr.buffer).setUint16(offset, value, true);
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/**
 * Builds a real, minimal ZIP archive in memory for test fixtures.
 * entries: [{ name: string, data: Uint8Array, method: 0 | 8, generalPurposeFlag?: number }]
 */
async function buildZip(entries) {
  const parts = [];
  const centralParts = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const rawData = entry.data;
    const flag = entry.generalPurposeFlag ?? 0;
    const compressedData = entry.method === 8 ? await deflateRaw(rawData) : rawData;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, flag);
    writeUint16(localHeader, 8, entry.method);
    writeUint16(localHeader, 10, 0);
    writeUint16(localHeader, 12, 0);
    writeUint32(localHeader, 14, 0);
    writeUint32(localHeader, 18, compressedData.length);
    writeUint32(localHeader, 22, rawData.length);
    writeUint16(localHeader, 26, nameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    const localHeaderOffset = offset;
    parts.push(localHeader, compressedData);
    offset += localHeader.length + compressedData.length;

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, flag);
    writeUint16(centralHeader, 10, entry.method);
    writeUint16(centralHeader, 12, 0);
    writeUint16(centralHeader, 14, 0);
    writeUint32(centralHeader, 16, 0);
    writeUint32(centralHeader, 20, compressedData.length);
    writeUint32(centralHeader, 24, rawData.length);
    writeUint16(centralHeader, 28, nameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, localHeaderOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const c of centralParts) {
    parts.push(c);
    centralDirSize += c.length;
    offset += c.length;
  }

  const eocd = new Uint8Array(22);
  writeUint32(eocd, 0, 0x06054b50);
  writeUint16(eocd, 4, 0);
  writeUint16(eocd, 6, 0);
  writeUint16(eocd, 8, entries.length);
  writeUint16(eocd, 10, entries.length);
  writeUint32(eocd, 12, centralDirSize);
  writeUint32(eocd, 16, centralDirOffset);
  writeUint16(eocd, 20, 0);
  parts.push(eocd);

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const p of parts) {
    result.set(p, pos);
    pos += p.length;
  }
  return result;
}

const enc = new TextEncoder();

await test("listZipEntryNames returns all entry names", async () => {
  const zip = await buildZip([
    { name: "word/document.xml", data: enc.encode("<w:document/>"), method: 8 },
    { name: "mimetype", data: enc.encode("stored"), method: 0 },
  ]);
  const names = await listZipEntryNames(zip);
  assert.deepStrictEqual(names, ["word/document.xml", "mimetype"]);
});

await test("readZipEntryText decompresses a deflate-raw entry", async () => {
  const zip = await buildZip([
    { name: "word/document.xml", data: enc.encode("<w:document>hello deflate</w:document>"), method: 8 },
  ]);
  const text = await readZipEntryText(zip, "word/document.xml");
  assert.strictEqual(text, "<w:document>hello deflate</w:document>");
});

await test("readZipEntryText reads a stored (uncompressed) entry", async () => {
  const zip = await buildZip([{ name: "mimetype", data: enc.encode("stored-no-compression"), method: 0 }]);
  const text = await readZipEntryText(zip, "mimetype");
  assert.strictEqual(text, "stored-no-compression");
});

await test("readZipEntryText returns null for a missing entry", async () => {
  const zip = await buildZip([{ name: "word/document.xml", data: enc.encode("x"), method: 0 }]);
  const text = await readZipEntryText(zip, "nope.xml");
  assert.strictEqual(text, null);
});

await test("readZipEntryText throws a distinct error for an encrypted entry", async () => {
  const zip = await buildZip([
    { name: "word/document.xml", data: enc.encode("secret"), method: 0, generalPurposeFlag: 0x1 },
  ]);
  await assert.rejects(async () => {
    await readZipEntryText(zip, "word/document.xml");
  }, /password-protected/);
});

await test("listZipEntryNames throws a clear error for a non-ZIP buffer", async () => {
  const notAZip = enc.encode("this is definitely not a zip file, no EOCD signature anywhere in here");
  await assert.rejects(async () => {
    await listZipEntryNames(notAZip);
  }, /Not a valid ZIP archive/);
});

console.log("\n=========================================");
console.log(`🎉 ZIP Reader Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/zip_reader_test.mjs`
Expected: `Cannot find module '../src/shared/zipReader.js'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/shared/zipReader.js`:

```js
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_EOCD_COMMENT_SEARCH = 65557; // 22-byte EOCD + max 65535-byte comment
const MAX_ENTRY_SIZE = 50 * 1024 * 1024; // 50MB decompression ceiling

function findEndOfCentralDirectory(view) {
  const searchStart = Math.max(0, view.byteLength - MAX_EOCD_COMMENT_SEARCH);
  for (let offset = view.byteLength - 22; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

function readCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset === -1) {
    throw new Error("Not a valid ZIP archive (End Of Central Directory not found)");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const entries = [];
  let offset = centralDirOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_DIR_SIGNATURE) break;

    const generalPurposeFlag = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + filenameLength);
    const name = new TextDecoder("utf-8").decode(nameBytes);

    entries.push({
      name,
      generalPurposeFlag,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + filenameLength + extraFieldLength + commentLength;
  }

  return entries;
}

async function inflate(compressedBytes) {
  const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalLength += value.length;
    if (totalLength > MAX_ENTRY_SIZE) return null;
    chunks.push(value);
  }

  const result = new Uint8Array(totalLength);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }

  return result;
}

export async function listZipEntryNames(bytes) {
  return readCentralDirectory(bytes).map((entry) => entry.name);
}

export async function readZipEntryText(bytes, entryName) {
  const entries = readCentralDirectory(bytes);
  const entry = entries.find((candidate) => candidate.name === entryName);
  if (!entry) return null;

  const isEncrypted = (entry.generalPurposeFlag & 0x1) !== 0;
  if (isEncrypted) {
    throw new Error("This entry is password-protected and cannot be decompressed.");
  }
  if (entry.uncompressedSize > MAX_ENTRY_SIZE) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localOffset = entry.localHeaderOffset;
  if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) return null;

  const localFilenameLength = view.getUint16(localOffset + 26, true);
  const localExtraFieldLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + localFilenameLength + localExtraFieldLength;
  const compressedBytes = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  let resultBytes;
  if (entry.compressionMethod === 0) {
    resultBytes = compressedBytes;
  } else if (entry.compressionMethod === 8) {
    resultBytes = await inflate(compressedBytes);
    if (resultBytes === null) return null;
  } else {
    return null;
  }

  return new TextDecoder("utf-8").decode(resultBytes);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/zip_reader_test.mjs`
Expected: `🎉 ZIP Reader Results: 6 passed, 0 failed`

- [ ] **Step 5: Wire into the npm test script**

In `package.json`, update the `scripts` block (currently `"test": "node tests/run_tests.mjs && node tests/dom_engine_test.mjs && node tests/privacy_security_test.mjs"`) to also run the new test, and add its own named script matching the existing `test:core`/`test:dom`/`test:privacy` pattern:

```json
"test": "node tests/run_tests.mjs && node tests/dom_engine_test.mjs && node tests/privacy_security_test.mjs && node tests/zip_reader_test.mjs",
"test:core": "node tests/run_tests.mjs",
"test:dom": "node tests/dom_engine_test.mjs",
"test:privacy": "node tests/privacy_security_test.mjs",
"test:zip": "node tests/zip_reader_test.mjs",
```

- [ ] **Step 6: Run the full suite to verify nothing else broke**

Run: `npm test`
Expected: all existing suites still pass, plus the new `🎉 ZIP Reader Results: 6 passed, 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add src/shared/zipReader.js tests/zip_reader_test.mjs package.json
git commit -m "feat(viewer): add dependency-free ZIP reader for docx/pptx support"
```

---

## Task 2: docx parser

**Files:**
- Create: `src/viewer/parsers/docxParser.js`
- Test: `tests/docx_parser_test.mjs`
- Modify: `package.json:7` (test script)

**Interfaces:**
- Consumes: nothing from Task 1 directly (takes plain XML text, decoupled from the ZIP layer per the spec's testing approach).
- Produces: `parseDocxDocument(xmlText: string): { blocks: Array<Block>, truncated: boolean }` where `Block` is one of `{ type: "heading", level: 1|2|3, text: string }`, `{ type: "paragraph", runs: Run[] }`, `{ type: "listItem", runs: Run[] }`, and `Run` is `{ text: string, bold: boolean, italic: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `tests/docx_parser_test.mjs`:

```js
// tests/docx_parser_test.mjs
import assert from "assert";
import { parseDocxDocument } from "../src/viewer/parsers/docxParser.js";

console.log("=========================================");
console.log("📄 Running Docx Parser Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

test("extracts a heading with its level", () => {
  const xml = `<w:document><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
  </w:body></w:document>`;
  const { blocks } = parseDocxDocument(xml);
  assert.deepStrictEqual(blocks, [{ type: "heading", level: 1, text: "Chapter One" }]);
});

test("maps the Title style to heading level 1", () => {
  const xml = `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Doc Title</w:t></w:r></w:p>`;
  const { blocks } = parseDocxDocument(xml);
  assert.strictEqual(blocks[0].type, "heading");
  assert.strictEqual(blocks[0].level, 1);
});

test("extracts bold and italic runs within a paragraph", () => {
  const xml = `<w:p>
    <w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r>
    <w:r><w:t xml:space="preserve"> and normal text &amp; more</w:t></w:r>
  </w:p>`;
  const { blocks } = parseDocxDocument(xml);
  assert.strictEqual(blocks[0].type, "paragraph");
  assert.deepStrictEqual(blocks[0].runs, [
    { text: "Bold text", bold: true, italic: false },
    { text: " and normal text & more", bold: false, italic: false },
  ]);
});

test("treats a w:val=0 bold flag as not bold", () => {
  const xml = `<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>Explicitly not bold</w:t></w:r></w:p>`;
  const { blocks } = parseDocxDocument(xml);
  assert.strictEqual(blocks[0].runs[0].bold, false);
});

test("detects a list item via numPr", () => {
  const xml = `<w:p>
    <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
    <w:r><w:t>First bullet</w:t></w:r>
  </w:p>`;
  const { blocks } = parseDocxDocument(xml);
  assert.strictEqual(blocks[0].type, "listItem");
});

test("returns an empty, non-truncated result for XML with no paragraphs", () => {
  const result = parseDocxDocument("<w:document><w:body></w:body></w:document>");
  assert.deepStrictEqual(result, { blocks: [], truncated: false });
});

test("caps output at 2000 paragraphs and marks it truncated", () => {
  const paragraph = `<w:p><w:r><w:t>line</w:t></w:r></w:p>`;
  const xml = paragraph.repeat(2005);
  const { blocks, truncated } = parseDocxDocument(xml);
  assert.strictEqual(blocks.length, 2000);
  assert.strictEqual(truncated, true);
});

console.log("\n=========================================");
console.log(`🎉 Docx Parser Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/docx_parser_test.mjs`
Expected: `Cannot find module '../src/viewer/parsers/docxParser.js'`

- [ ] **Step 3: Write the implementation**

Create `src/viewer/parsers/docxParser.js`:

```js
const MAX_DOCX_PARAGRAPHS = 2000;
const XML_NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlEntities(text) {
  return text.replace(/&(#(\d+)|amp|lt|gt|quot|apos);/g, (match, _entity, numeric) => {
    if (numeric) return String.fromCodePoint(Number(numeric));
    return XML_NAMED_ENTITIES[match.slice(1, -1)] ?? match;
  });
}

function extractRuns(paragraphXml) {
  const runs = [];
  const runRegex = /<w:r[ >][\s\S]*?<\/w:r>/g;
  let runMatch;

  while ((runMatch = runRegex.exec(paragraphXml)) !== null) {
    const runXml = runMatch[0];
    const rPrMatch = runXml.match(/<w:rPr[ >][\s\S]*?<\/w:rPr>/);
    const rPrXml = rPrMatch ? rPrMatch[0] : "";

    const bold = /<w:b\b(?![^>]*w:val="(0|false)")[^>]*\/?>/.test(rPrXml);
    const italic = /<w:i\b(?![^>]*w:val="(0|false)")[^>]*\/?>/.test(rPrXml);

    let text = "";
    const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let textMatch;
    while ((textMatch = textRegex.exec(runXml)) !== null) {
      text += decodeXmlEntities(textMatch[1]);
    }

    if (text) runs.push({ text, bold, italic });
  }

  return runs;
}

export function parseDocxDocument(xmlText) {
  const blocks = [];
  const paragraphRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let match;
  let truncated = false;

  while ((match = paragraphRegex.exec(xmlText)) !== null) {
    if (blocks.length >= MAX_DOCX_PARAGRAPHS) {
      truncated = true;
      break;
    }

    const paragraphXml = match[0];
    const pPrMatch = paragraphXml.match(/<w:pPr[ >][\s\S]*?<\/w:pPr>/);
    const pPrXml = pPrMatch ? pPrMatch[0] : "";

    const headingMatch = pPrXml.match(/<w:pStyle[^>]*w:val="(Heading[1-3]|Title)"/);
    const isListItem = /<w:numPr[ >]/.test(pPrXml);
    const runs = extractRuns(paragraphXml);

    if (runs.length === 0) continue;

    if (headingMatch) {
      const level = headingMatch[1] === "Title" ? 1 : Number(headingMatch[1].slice(-1));
      blocks.push({ type: "heading", level, text: runs.map((run) => run.text).join("") });
    } else if (isListItem) {
      blocks.push({ type: "listItem", runs });
    } else {
      blocks.push({ type: "paragraph", runs });
    }
  }

  return { blocks, truncated };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/docx_parser_test.mjs`
Expected: `🎉 Docx Parser Results: 7 passed, 0 failed`

- [ ] **Step 5: Wire into the npm test script**

In `package.json`, extend the `test` script and add `test:docx`:

```json
"test": "node tests/run_tests.mjs && node tests/dom_engine_test.mjs && node tests/privacy_security_test.mjs && node tests/zip_reader_test.mjs && node tests/docx_parser_test.mjs",
"test:docx": "node tests/docx_parser_test.mjs",
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all suites pass, including the new docx parser results.

- [ ] **Step 7: Commit**

```bash
git add src/viewer/parsers/docxParser.js tests/docx_parser_test.mjs package.json
git commit -m "feat(viewer): add docx paragraph/heading/list/run parser"
```

---

## Task 3: pptx parser

**Files:**
- Create: `src/viewer/parsers/pptxParser.js`
- Test: `tests/pptx_parser_test.mjs`
- Modify: `package.json:7` (test script)

**Interfaces:**
- Consumes: nothing from Task 1 or 2 directly for the slide-XML-parsing half; the presentation-level orchestration function takes a `fetchEntryText` callback with the same shape as Task 1's `readZipEntryText` (`(entryName: string) => Promise<string | null>`), but is not coupled to `zipReader.js` at the type level — the viewer wires them together in Task 4.
- Produces: `parsePptxSlideXml(xmlText: string): Array<{ runs: Run[] }>` and `parsePptxPresentation(entryNames: string[], fetchEntryText: (name: string) => Promise<string | null>): Promise<{ slides: Array<{ number: number, blocks: Array<{ runs: Run[] }> }>, truncated: boolean }>` where `Run` is `{ text: string, bold: boolean, italic: boolean }` (same shape as Task 2's `Run`).

- [ ] **Step 1: Write the failing test**

Create `tests/pptx_parser_test.mjs`:

```js
// tests/pptx_parser_test.mjs
import assert from "assert";
import { parsePptxSlideXml, parsePptxPresentation } from "../src/viewer/parsers/pptxParser.js";

console.log("=========================================");
console.log("🖼️  Running Pptx Parser Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

const slideXmlFixture = `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>
  <a:p><a:r><a:rPr b="1" lang="en-US" dirty="0"/><a:t>Slide Title</a:t></a:r></a:p>
  <a:p><a:r><a:rPr i="1" lang="en-US" dirty="0"/><a:t>A subtitle &amp; more</a:t></a:r></a:p>
</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

test("parsePptxSlideXml extracts bold and italic runs per paragraph", () => {
  const blocks = parsePptxSlideXml(slideXmlFixture);
  assert.deepStrictEqual(blocks, [
    { runs: [{ text: "Slide Title", bold: true, italic: false }] },
    { runs: [{ text: "A subtitle & more", bold: false, italic: true }] },
  ]);
});

test("parsePptxSlideXml returns an empty array for a slide with no text", () => {
  const blocks = parsePptxSlideXml("<p:sld><p:cSld><p:spTree></p:spTree></p:cSld></p:sld>");
  assert.deepStrictEqual(blocks, []);
});

await test("parsePptxPresentation orders slides numerically, not lexicographically", async () => {
  const entryNames = ["ppt/slides/slide10.xml", "ppt/slides/slide2.xml", "ppt/slides/slide1.xml", "ppt/presentation.xml"];
  const fetchEntryText = async (name) => {
    if (name === "ppt/slides/slide1.xml") return `<p:sld><a:p><a:r><a:t>one</a:t></a:r></a:p></p:sld>`;
    if (name === "ppt/slides/slide2.xml") return `<p:sld><a:p><a:r><a:t>two</a:t></a:r></a:p></p:sld>`;
    if (name === "ppt/slides/slide10.xml") return `<p:sld><a:p><a:r><a:t>ten</a:t></a:r></a:p></p:sld>`;
    return null;
  };
  const { slides, truncated } = await parsePptxPresentation(entryNames, fetchEntryText);
  assert.deepStrictEqual(
    slides.map((slide) => slide.number),
    [1, 2, 10]
  );
  assert.strictEqual(slides[0].blocks[0].runs[0].text, "one");
  assert.strictEqual(truncated, false);
});

await test("parsePptxPresentation returns an empty, non-truncated result when there are no slide entries", async () => {
  const result = await parsePptxPresentation(["ppt/presentation.xml"], async () => null);
  assert.deepStrictEqual(result, { slides: [], truncated: false });
});

await test("parsePptxPresentation caps slide count at 500 and marks it truncated", async () => {
  const entryNames = Array.from({ length: 505 }, (_, i) => `ppt/slides/slide${i + 1}.xml`);
  const fetchEntryText = async () => `<p:sld><a:p><a:r><a:t>x</a:t></a:r></a:p></p:sld>`;
  const { slides, truncated } = await parsePptxPresentation(entryNames, fetchEntryText);
  assert.strictEqual(slides.length, 500);
  assert.strictEqual(truncated, true);
});

console.log("\n=========================================");
console.log(`🎉 Pptx Parser Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/pptx_parser_test.mjs`
Expected: `Cannot find module '../src/viewer/parsers/pptxParser.js'`

- [ ] **Step 3: Write the implementation**

Create `src/viewer/parsers/pptxParser.js`:

```js
const MAX_PPTX_SLIDES = 500;
const SLIDE_ENTRY_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;
const XML_NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlEntities(text) {
  return text.replace(/&(#(\d+)|amp|lt|gt|quot|apos);/g, (match, _entity, numeric) => {
    if (numeric) return String.fromCodePoint(Number(numeric));
    return XML_NAMED_ENTITIES[match.slice(1, -1)] ?? match;
  });
}

export function parsePptxSlideXml(xmlText) {
  const blocks = [];
  const paragraphRegex = /<a:p[ >][\s\S]*?<\/a:p>/g;
  let match;

  while ((match = paragraphRegex.exec(xmlText)) !== null) {
    const paragraphXml = match[0];
    const runs = [];
    const runRegex = /<a:r[ >][\s\S]*?<\/a:r>/g;
    let runMatch;

    while ((runMatch = runRegex.exec(paragraphXml)) !== null) {
      const runXml = runMatch[0];
      const rPrMatch = runXml.match(/<a:rPr[^>]*\/?>/);
      const rPrTag = rPrMatch ? rPrMatch[0] : "";
      const bold = /\bb="1"/.test(rPrTag);
      const italic = /\bi="1"/.test(rPrTag);

      let text = "";
      const textRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
      let textMatch;
      while ((textMatch = textRegex.exec(runXml)) !== null) {
        text += decodeXmlEntities(textMatch[1]);
      }

      if (text) runs.push({ text, bold, italic });
    }

    if (runs.length > 0) blocks.push({ runs });
  }

  return blocks;
}

export async function parsePptxPresentation(entryNames, fetchEntryText) {
  const slideEntries = entryNames
    .map((name) => {
      const match = name.match(SLIDE_ENTRY_PATTERN);
      return match ? { name, number: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);

  const slides = [];
  let truncated = false;

  for (const entry of slideEntries) {
    if (slides.length >= MAX_PPTX_SLIDES) {
      truncated = true;
      break;
    }

    const xmlText = await fetchEntryText(entry.name);
    if (xmlText === null) continue;

    slides.push({ number: entry.number, blocks: parsePptxSlideXml(xmlText) });
  }

  return { slides, truncated };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/pptx_parser_test.mjs`
Expected: `🎉 Pptx Parser Results: 5 passed, 0 failed`

- [ ] **Step 5: Wire into the npm test script**

In `package.json`, extend the `test` script and add `test:pptx`:

```json
"test": "node tests/run_tests.mjs && node tests/dom_engine_test.mjs && node tests/privacy_security_test.mjs && node tests/zip_reader_test.mjs && node tests/docx_parser_test.mjs && node tests/pptx_parser_test.mjs",
"test:pptx": "node tests/pptx_parser_test.mjs",
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all suites pass, including the new pptx parser results.

- [ ] **Step 7: Commit**

```bash
git add src/viewer/parsers/pptxParser.js tests/pptx_parser_test.mjs package.json
git commit -m "feat(viewer): add pptx slide/run parser with numeric slide ordering"
```

---

## Task 4: Wire docx/pptx into the viewer UI

**Files:**
- Modify: `src/viewer/viewer.js`
- Modify: `src/viewer/viewer.html:50-53` (file input `accept`), `src/viewer/viewer.html:58-63` (empty-state copy)
- Modify: `src/viewer/viewer.css` (slide label styling, reusing the existing page-label pattern)

**Interfaces:**
- Consumes: `listZipEntryNames`, `readZipEntryText` from `../shared/zipReader.js` (Task 1); `parseDocxDocument` from `./parsers/docxParser.js` (Task 2); `parsePptxPresentation` from `./parsers/pptxParser.js` (Task 3).
- Produces: nothing consumed by later tasks — this is the final integration task.

- [ ] **Step 1: Add file-type detection functions**

In `src/viewer/viewer.js`, near the existing `isPdfFile`/`isReadableDocument` functions (around line 426), add:

```js
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function isOfficeDocument(file) {
  const name = file.name.toLowerCase();
  return (
    file.type === DOCX_MIME ||
    file.type === PPTX_MIME ||
    name.endsWith(".docx") ||
    name.endsWith(".pptx")
  );
}

function isLegacyOfficeDocument(file) {
  const name = file.name.toLowerCase();
  return (
    file.type === "application/msword" ||
    file.type === "application/vnd.ms-powerpoint" ||
    name.endsWith(".doc") ||
    name.endsWith(".ppt")
  );
}

function isDocxFile(file) {
  return file.type === DOCX_MIME || file.name.toLowerCase().endsWith(".docx");
}
```

- [ ] **Step 2: Add the import statements**

At the top of `src/viewer/viewer.js`, alongside the existing `import * as pdfjsLib from "./vendor/pdf.min.mjs";`, add:

```js
import { listZipEntryNames, readZipEntryText } from "../shared/zipReader.js";
import { parseDocxDocument } from "./parsers/docxParser.js";
import { parsePptxPresentation } from "./parsers/pptxParser.js";
```

- [ ] **Step 3: Add the safe-DOM render functions**

In `src/viewer/viewer.js`, near the existing `renderMarkdownSafely`/`appendInlineMarkdown` functions, add:

```js
function renderRunsInto(parent, runs) {
  runs.forEach((run) => {
    let node = document.createTextNode(run.text);
    if (run.bold) {
      const strong = document.createElement("strong");
      strong.appendChild(node);
      node = strong;
    }
    if (run.italic) {
      const em = document.createElement("em");
      em.appendChild(node);
      node = em;
    }
    parent.appendChild(node);
  });
}

function appendTruncationNotice(container, message) {
  const notice = document.createElement("p");
  notice.className = "truncation-notice";
  notice.textContent = message;
  container.appendChild(notice);
}

function renderDocxBlocksSafely(result, container) {
  container.replaceChildren();
  let currentList = null;

  result.blocks.forEach((block) => {
    if (block.type === "heading") {
      currentList = null;
      const heading = document.createElement(`h${block.level}`);
      heading.textContent = block.text;
      container.appendChild(heading);
      return;
    }

    if (block.type === "listItem") {
      if (!currentList) {
        currentList = document.createElement("ul");
        container.appendChild(currentList);
      }
      const li = document.createElement("li");
      renderRunsInto(li, block.runs);
      currentList.appendChild(li);
      return;
    }

    currentList = null;
    const p = document.createElement("p");
    renderRunsInto(p, block.runs);
    container.appendChild(p);
  });

  if (result.truncated) {
    appendTruncationNotice(container, "This document is very long — only the first 2000 paragraphs are shown.");
  }
}

function renderPptxSlidesSafely(result, container) {
  container.replaceChildren();

  result.slides.forEach((slide) => {
    const wrapper = document.createElement("section");
    wrapper.className = "pptx-slide";

    const label = document.createElement("div");
    label.className = "pptx-slide-label";
    label.textContent = `Slide ${slide.number}`;
    wrapper.appendChild(label);

    slide.blocks.forEach((block) => {
      const p = document.createElement("p");
      renderRunsInto(p, block.runs);
      wrapper.appendChild(p);
    });

    container.appendChild(wrapper);
  });

  if (result.truncated) {
    appendTruncationNotice(container, "This presentation has a lot of slides — only the first 500 are shown.");
  }
}
```

- [ ] **Step 4: Add the `openOfficeFile` orchestration function**

In `src/viewer/viewer.js`, near the existing `openTextDocument` function, add:

```js
let officeRenderGeneration = 0;

async function openOfficeFile(file) {
  officeRenderGeneration += 1;
  const generation = officeRenderGeneration;

  showPanel("document");
  documentName.textContent = file.name;
  documentPanel.replaceChildren();

  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    if (generation !== officeRenderGeneration) return;
    showEmptyState(`Could not read ${file.name} — the file may be corrupted.`);
    return;
  }

  if (isDocxFile(file)) {
    let xmlText;
    try {
      xmlText = await readZipEntryText(bytes, "word/document.xml");
    } catch {
      if (generation !== officeRenderGeneration) return;
      showEmptyState(`${file.name} is password-protected and can't be previewed.`);
      return;
    }

    if (generation !== officeRenderGeneration) return;

    if (xmlText === null) {
      showEmptyState(`Could not read ${file.name} — the file may be corrupted.`);
      return;
    }

    showPanel("document");
    renderDocxBlocksSafely(parseDocxDocument(xmlText), documentPanel);
    return;
  }

  let entryNames;
  try {
    entryNames = await listZipEntryNames(bytes);
  } catch {
    if (generation !== officeRenderGeneration) return;
    showEmptyState(`Could not read ${file.name} — the file may be corrupted.`);
    return;
  }

  let result;
  try {
    result = await parsePptxPresentation(entryNames, (entryName) => readZipEntryText(bytes, entryName));
  } catch {
    if (generation !== officeRenderGeneration) return;
    showEmptyState(`${file.name} is password-protected and can't be previewed.`);
    return;
  }

  if (generation !== officeRenderGeneration) return;

  if (result.slides.length === 0) {
    showEmptyState(`Could not find any slides in ${file.name} — the file may be corrupted.`);
    return;
  }

  showPanel("document");
  renderPptxSlidesSafely(result, documentPanel);
}
```

- [ ] **Step 5: Wire detection into `openLocalFile`**

In `src/viewer/viewer.js`, find the existing `openLocalFile` function:

```js
async function openLocalFile(file) {
  revokeCurrentObjectUrl();

  if (isPdfFile(file)) {
    const data = new Uint8Array(await file.arrayBuffer());
    currentObjectUrl = URL.createObjectURL(file);
    openPdf(data, file.name, currentObjectUrl);
    return;
  }

  if (isReadableDocument(file)) {
    const text = await file.text();
    openTextDocument(text, file.name);
    return;
  }

  showEmptyState(`${file.name} is not supported yet`);
}
```

Replace it with:

```js
async function openLocalFile(file) {
  revokeCurrentObjectUrl();

  if (isPdfFile(file)) {
    const data = new Uint8Array(await file.arrayBuffer());
    currentObjectUrl = URL.createObjectURL(file);
    openPdf(data, file.name, currentObjectUrl);
    return;
  }

  if (isReadableDocument(file)) {
    const text = await file.text();
    openTextDocument(text, file.name);
    return;
  }

  if (isLegacyOfficeDocument(file)) {
    showEmptyState(`${file.name} is a legacy Office format — only .docx and .pptx are supported.`);
    return;
  }

  if (isOfficeDocument(file)) {
    await openOfficeFile(file);
    return;
  }

  showEmptyState(`${file.name} is not supported yet`);
}
```

- [ ] **Step 6: Update the file input and empty-state copy**

In `src/viewer/viewer.html`, find:

```html
        <input
          id="file-input"
          type="file"
          accept=".pdf,.txt,.md,.markdown,.rtf,application/pdf,text/plain,text/markdown,application/rtf,text/rtf"
          hidden
        />
```

Replace it with:

```html
        <input
          id="file-input"
          type="file"
          accept=".pdf,.txt,.md,.markdown,.rtf,.docx,.pptx,application/pdf,text/plain,text/markdown,application/rtf,text/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          hidden
        />
```

Find:

```html
      <section id="empty-state" class="empty-state">
        <h2>Open a PDF, TXT, Markdown, or RTF file</h2>
        <p>
          PDF files render locally with smart dark conversion. Text documents
          render in a clean dark reader with your selected colors.
        </p>
      </section>
```

Replace it with:

```html
      <section id="empty-state" class="empty-state">
        <h2>Open a PDF, Word, PowerPoint, TXT, Markdown, or RTF file</h2>
        <p>
          PDF files render locally with smart dark conversion. Word and
          PowerPoint files show a read-only content preview (text, headings,
          lists, slides) in a clean dark reader with your selected colors.
        </p>
      </section>
```

- [ ] **Step 7: Add slide/truncation-notice styling**

In `src/viewer/viewer.css`, find the rule block for `.pdf-page-label` (the existing per-page label style used by the PDF viewer) and add matching rules directly after it:

```css
.pptx-slide {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--viewer-border, #343b46);
}

.pptx-slide-label {
  margin-bottom: 8px;
  color: var(--viewer-muted, #9aa0a6);
  font-size: 13px;
  font-weight: 600;
}

.truncation-notice {
  margin-top: 16px;
  padding: 10px 14px;
  border: 1px solid var(--viewer-border, #343b46);
  border-radius: 8px;
  color: var(--viewer-muted, #9aa0a6);
  font-size: 13px;
}
```

If `--viewer-border` or `--viewer-muted` are not already defined as CSS custom properties elsewhere in `viewer.css`, use the literal fallback colors shown above (already matching this file's existing dark palette) instead of introducing new custom properties.

- [ ] **Step 8: Manually verify in Chrome**

Reload the unpacked extension, open the viewer, and use "Open file" to load a real `.docx` and a real `.pptx`:
- Confirm headings, paragraphs, bold/italic text, and bullet lists render for the docx.
- Confirm each slide's text renders under its own "Slide N" label, in the correct order, for the pptx.
- Switch through all four modes (Smart Dark, Invert, Sepia, Original) and confirm the text stays legible in each.
- Try opening a `.doc` or `.ppt` file and confirm the "legacy Office format" message appears.
- Try opening a plain renamed `.txt` file with a `.docx` extension and confirm the "may be corrupted" message appears rather than a crash or blank panel.

- [ ] **Step 9: Run the full test suite one more time**

Run: `npm test`
Expected: every suite passes — this task didn't touch any parser/reader logic, only wiring, so no test file changes are needed here, but a full run confirms nothing regressed.

- [ ] **Step 10: Commit**

```bash
git add src/viewer/viewer.js src/viewer/viewer.html src/viewer/viewer.css
git commit -m "feat(viewer): wire docx/pptx preview into the document viewer UI"
```
