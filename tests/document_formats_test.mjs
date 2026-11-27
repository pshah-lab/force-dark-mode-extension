// tests/document_formats_test.mjs — the viewer's document-kind detection and on-screen RTF stripping.
// Assertions carried over unchanged from the removed export tests, which covered these kept helpers.
import assert from "assert";
import { detectDocumentKind, rtfToPlainText } from "../src/viewer/documentFormats.js";

console.log("=========================================");
console.log("📄 Running Document Formats Tests");
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

await test("detectDocumentKind maps names and MIME types", () => {
  assert.strictEqual(detectDocumentKind("a.PDF"), "pdf");
  assert.strictEqual(detectDocumentKind("blob", "application/pdf"), "pdf");
  assert.strictEqual(detectDocumentKind("a.docx"), "docx");
  assert.strictEqual(detectDocumentKind("a.pptx"), "pptx");
  assert.strictEqual(detectDocumentKind("a.xlsx"), "xlsx");
  assert.strictEqual(detectDocumentKind("a.csv"), "csv");
  assert.strictEqual(detectDocumentKind("a.markdown"), "markdown");
  assert.strictEqual(detectDocumentKind("a.md"), "markdown");
  assert.strictEqual(detectDocumentKind("a.rtf"), "rtf");
  assert.strictEqual(detectDocumentKind("a.txt"), "text");
  assert.strictEqual(detectDocumentKind("notes", "text/plain"), "text");
  assert.strictEqual(detectDocumentKind("a.doc"), null);
});

await test("rtfToPlainText strips control words and groups", () => {
  assert.strictEqual(rtfToPlainText("{\\rtf1\\ansi{\\b Hello} world\\par\n}"), "Hello world");
});

await test("rtfToPlainText skips the font table and other destination groups", () => {
  const rtf = "{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Helvetica;}}{\\colortbl;\\red255\\green0\\blue0;}{\\stylesheet{\\s0 Normal;}}{\\info{\\title Secret}}{\\*\\generator Word;} \\f0\\fs24 Title\\par\\par Body text.\\par}";
  assert.strictEqual(rtfToPlainText(rtf), "Title\n\nBody text.");
});

await test("rtfToPlainText turns paragraph, line and tab controls into whitespace", () => {
  assert.strictEqual(rtfToPlainText("{\\rtf1 a\\par b\\line c\\tab d}"), "a\nb\nc\td");
});

await test("rtfToPlainText keeps escaped braces and backslashes", () => {
  assert.strictEqual(rtfToPlainText("{\\rtf1 x \\{y\\} \\\\z}"), "x {y} \\z");
});

await test("rtfToPlainText decodes hex and unicode characters", () => {
  assert.strictEqual(rtfToPlainText("{\\rtf1 caf\\'e9 \\u8364? 5}"), "caf\u00e9 \u20ac 5");
});

await test("rtfToPlainText handles a huge flat file in linear time", () => {
  const big = "{\\rtf1 " + "word \\b bold\\b0 ".repeat(200000) + "}";
  const start = Date.now();
  rtfToPlainText(big);
  assert.ok(Date.now() - start < 2000);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
