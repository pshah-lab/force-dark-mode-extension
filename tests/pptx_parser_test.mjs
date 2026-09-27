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

test("parsePptxSlideXml does not treat a hypothetical <a:tXY> tag as a <a:t> opening tag", () => {
  const xml = `<a:p><a:r><a:tXY/><a:t>Hello</a:t></a:r></a:p>`;
  const blocks = parsePptxSlideXml(xml);
  assert.strictEqual(blocks[0].runs[0].text, "Hello");
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
