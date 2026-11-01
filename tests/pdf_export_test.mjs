// tests/pdf_export_test.mjs — pure PDF text-layer -> TXT/Markdown heuristics and PNG export helpers.
import assert from "assert";
import {
  groupTextItemsIntoLines,
  hasExtractableText,
  pdfPagesToText,
  pdfPagesToMarkdown,
  parsePageRange,
  pngRenderScale,
  MAX_PNG_PAGES,
} from "../src/viewer/convert/pdfExport.js";

console.log("=========================================");
console.log("📄 Running PDF Export Tests");
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

// Fake PDF.js text item: font size `size` at baseline (x, y); width ~ 0.5em per char.
const item = (str, x, y, size = 10) => ({ str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.5, height: size, hasEOL: false });

const page = (items) => ({ items });

await test("groups items on the same baseline into one line, left to right", () => {
  const lines = groupTextItemsIntoLines([item("world", 40, 700), item("Hello", 10, 700.4), item("Next", 10, 686)]);
  assert.deepStrictEqual(lines.map((l) => l.text), ["Hello world", "Next"]);
  assert.strictEqual(lines[0].size, 10);
});

await test("does not insert a space between touching fragments", () => {
  const lines = groupTextItemsIntoLines([item("Hel", 10, 700), item("lo", 25, 700)]);
  assert.strictEqual(lines[0].text, "Hello");
});

await test("ignores marked-content entries and whitespace-only items", () => {
  const lines = groupTextItemsIntoLines([{ type: "beginMarkedContent" }, item("   ", 10, 700), item("A", 10, 680)]);
  assert.deepStrictEqual(lines.map((l) => l.text), ["A"]);
});

await test("hasExtractableText is false for scanned (text-less) PDFs", () => {
  assert.strictEqual(hasExtractableText([page([]), page([item("  ", 1, 1)])]), false);
  assert.strictEqual(hasExtractableText([page([item("x", 1, 1)])]), true);
});

const doc = [
  page([
    item("Big Title", 10, 760, 24),
    item("Section heading", 10, 720, 14),
    item("This is the first line of a", 10, 700),
    item("paragraph that wraps.", 10, 688),
    item("A second paragraph after a gap.", 10, 650),
    item("•", 10, 620),
    item("bullet one", 20, 620),
    item("- bullet two", 10, 608),
    item("1. numbered", 10, 596),
    item("2) numbered two", 10, 584),
    item("hyphen-", 10, 550),
    item("ated word", 10, 538),
  ]),
  page([item("Page two body text", 10, 700)]),
];

await test("pdfPagesToMarkdown derives headings from font size relative to body", () => {
  const md = pdfPagesToMarkdown(doc);
  assert.ok(md.startsWith("# Big Title\n\n"), md);
  assert.ok(md.includes("\n\n### Section heading\n\n") || md.includes("\n\n## Section heading\n\n"), md);
});

await test("pdfPagesToMarkdown joins wrapped lines and splits paragraphs on gaps", () => {
  const md = pdfPagesToMarkdown(doc);
  assert.ok(md.includes("This is the first line of a paragraph that wraps.\n\nA second paragraph after a gap."), md);
  assert.ok(md.includes("hyphenated word"), md);
});

await test("pdfPagesToMarkdown converts bullets and numbered lists", () => {
  const md = pdfPagesToMarkdown(doc);
  assert.ok(md.includes("- bullet one\n- bullet two\n1. numbered\n2. numbered two"), md);
  assert.ok(md.trimEnd().endsWith("Page two body text"), md);
});

await test("pdfPagesToMarkdown escapes markup found in the text", () => {
  const md = pdfPagesToMarkdown([page([item("<script>*x*</script>", 10, 700)])]);
  assert.ok(md.includes("\\<script\\>\\*x\\*\\</script\\>"), md);
});

await test("pdfPagesToText keeps lines, separates paragraphs and pages", () => {
  const txt = pdfPagesToText(doc);
  assert.ok(txt.startsWith("Big Title\n\nSection heading\n\nThis is the first line of a\nparagraph that wraps.\n\n"), txt);
  assert.ok(txt.includes("• bullet one"), txt);
  assert.ok(txt.includes("\n\nPage two body text\n"), txt);
});

await test("parsePageRange accepts lists and ranges, clamps and de-duplicates", () => {
  assert.deepStrictEqual(parsePageRange("", 3), { pages: [1, 2, 3] });
  assert.deepStrictEqual(parsePageRange("all", 3), { pages: [1, 2, 3] });
  assert.deepStrictEqual(parsePageRange("3, 1-2, 2", 5), { pages: [1, 2, 3] });
  assert.deepStrictEqual(parsePageRange("4-", 6), { pages: [4, 5, 6] });
  assert.ok(parsePageRange("0", 3).error);
  assert.ok(parsePageRange("9", 3).error);
  assert.ok(parsePageRange("a-b", 3).error);
  assert.ok(parsePageRange("3-1", 3).error);
});

await test("parsePageRange enforces the PNG page cap", () => {
  const r = parsePageRange("", MAX_PNG_PAGES + 10);
  assert.ok(r.error && r.error.includes(String(MAX_PNG_PAGES)), r.error);
  assert.strictEqual(parsePageRange(`1-${MAX_PNG_PAGES}`, MAX_PNG_PAGES + 10).pages.length, MAX_PNG_PAGES);
});

await test("pngRenderScale defaults to 2x but caps canvas size", () => {
  assert.strictEqual(pngRenderScale(612, 792), 2);
  const s = pngRenderScale(10000, 10000);
  assert.ok(s < 2 && 10000 * s <= 8192 && 10000 * s * 10000 * s <= 40e6, String(s));
  assert.ok(pngRenderScale(0, 0) > 0);
});

console.log(`\n🎉 PDF export tests complete. Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
