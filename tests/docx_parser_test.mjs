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

test("does not treat <w:tab/> as a <w:t> opening tag", () => {
  const xml = `<w:p><w:r><w:tab/><w:t>Hello</w:t></w:r></w:p>`;
  const { blocks } = parseDocxDocument(xml);
  assert.strictEqual(blocks[0].runs[0].text, "Hello");
});

test("caps output at 2000 paragraphs and marks it truncated", () => {
  const paragraph = `<w:p><w:r><w:t>line</w:t></w:r></w:p>`;
  const xml = paragraph.repeat(2005);
  const { blocks, truncated } = parseDocxDocument(xml);
  assert.strictEqual(blocks.length, 2000);
  assert.strictEqual(truncated, true);
});

// Hostile-XML timing regressions: each input is a few hundred KB of repeated
// unterminated markup that made the old lazy regexes quadratic.
const budget = 1000;
const timed = (xml) => {
  const t0 = performance.now();
  parseDocxDocument(xml);
  return performance.now() - t0;
};
const wrapRun = (inner) => `<w:p><w:r>${inner}</w:r></w:p>`;

test("hostile XML stays linear: unterminated <w:p>", () => {
  assert.ok(timed("<w:p>".repeat(40000)) < budget);
});

test("hostile XML stays linear: unterminated <w:r> inside a paragraph", () => {
  assert.ok(timed("<w:p>" + "<w:r>".repeat(40000) + "</w:p>") < budget);
});

test("hostile XML stays linear: unterminated <w:pPr> inside a paragraph", () => {
  assert.ok(timed("<w:p>" + "<w:pPr>".repeat(60000) + "<w:r><w:t>x</w:t></w:r></w:p>") < budget);
});

test("hostile XML stays linear: unterminated <w:rPr> inside a run", () => {
  assert.ok(timed(wrapRun("<w:rPr>".repeat(60000) + "<w:t>x</w:t>")) < budget);
});

test("hostile XML stays linear: unterminated <w:t> inside a run", () => {
  assert.ok(timed(wrapRun("<w:t>".repeat(60000))) < budget);
});

test("hostile XML stays linear: <w:t with no closing '>'", () => {
  assert.ok(timed(wrapRun("<w:t ".repeat(60000))) < budget);
});

test("hostile XML stays linear: <w:pStyle with no closing '>'", () => {
  assert.ok(timed("<w:p><w:pPr>" + "<w:pStyle ".repeat(30000) + "</w:pPr><w:r><w:t>x</w:t></w:r></w:p>") < budget);
});

test("hostile XML stays linear: repeated <w:b / <w:i with no closing '>'", () => {
  for (const tag of ["w:b", "w:i"]) {
    const rPr = "<w:rPr>" + `<${tag} `.repeat(60000) + 'w:val="0"' + "</w:rPr>";
    assert.ok(timed(wrapRun(rPr + "<w:t>x</w:t>")) < budget, tag);
  }
});

test("hostile XML: content before an unterminated tail is still parsed", () => {
  const xml = `<w:p><w:r><w:t>kept</w:t></w:r></w:p><w:p><w:r><w:t>cut off`;
  const { blocks } = parseDocxDocument(xml);
  assert.deepStrictEqual(blocks, [{ type: "paragraph", runs: [{ text: "kept", bold: false, italic: false }] }]);
});

test("hostile XML: valid runs around an unterminated <w:t> keep their text", () => {
  const xml = `<w:p><w:r><w:t>one</w:t></w:r><w:r><w:t>two</w:t></w:r></w:p>`;
  const { blocks } = parseDocxDocument(xml);
  assert.deepStrictEqual(blocks[0].runs.map((run) => run.text), ["one", "two"]);
});

test("honours italic, bold-off and several <w:t> elements in one run", () => {
  const xml = `<w:p>
    <w:r><w:rPr><w:b w:val="false"/><w:i/></w:rPr><w:t>a</w:t><w:t xml:space="preserve">b</w:t></w:r>
    <w:r><w:rPr><w:bCs/><w:b w:val="0"/><w:b/></w:rPr><w:t>c</w:t></w:r>
  </w:p>`;
  const { blocks } = parseDocxDocument(xml);
  assert.deepStrictEqual(blocks[0].runs, [
    { text: "ab", bold: false, italic: true },
    { text: "c", bold: true, italic: false },
  ]);
});

test("out-of-range numeric entities decode to U+FFFD instead of throwing", () => {
  const xml = `<w:p><w:r><w:t>a&#99999999;b&#55296;c&#65;</w:t></w:r></w:p>`;
  const { blocks } = parseDocxDocument(xml);
  assert.strictEqual(blocks[0].runs.map((r) => r.text).join(""), "a\uFFFDb\uFFFDcA");
});

console.log("\n=========================================");
console.log(`🎉 Docx Parser Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
