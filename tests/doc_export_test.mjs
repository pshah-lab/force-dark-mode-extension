// tests/doc_export_test.mjs — DOCX/PPTX/Markdown/TXT/RTF -> text, Markdown and standalone HTML.
import assert from "assert";
import {
  escapeHtml,
  escapeMarkdown,
  buildHtmlDocument,
  docxToText,
  docxToMarkdown,
  docxToHtml,
  pptxToText,
  pptxToMarkdown,
  pptxToHtml,
  markdownToHtml,
  plainTextToHtml,
  rtfToPlainText,
} from "../src/viewer/convert/docExport.js";
import { parseDocxDocument } from "../src/viewer/parsers/docxParser.js";

console.log("=========================================");
console.log("📝 Running Document Export Tests");
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

const XSS = `<script>alert(1)</script><img src=x onerror="alert(2)">`;

function assertSafeHtml(html) {
  assert.ok(html.startsWith("<!DOCTYPE html>"), "standalone document");
  assert.ok(/<meta http-equiv="Content-Security-Policy" content="default-src 'none';[^"]*">/.test(html), "restrictive CSP");
  assert.ok(!/<script/i.test(html), "no script tags");
  assert.ok(!/<img/i.test(html), "no injected img tags");
  assert.ok(!/<[^>]*\son\w+\s*=/i.test(html), "no event handler attributes");
  assert.ok(!/<[^>]*\s(src|href)\s*=/i.test(html), "no remote resources");
  assert.ok(!/https?:\/\//i.test(html), "no URLs");
}

const docx = {
  truncated: false,
  blocks: [
    { type: "heading", level: 1, text: "Title & <Intro>" },
    { type: "paragraph", runs: [{ text: "Plain " }, { text: "bold", bold: true }, { text: " and " }, { text: "it", italic: true }] },
    { type: "listItem", runs: [{ text: "first" }] },
    { type: "listItem", runs: [{ text: "second *star*" }] },
    { type: "paragraph", runs: [{ text: XSS }] },
  ],
};

const pptx = {
  truncated: false,
  slides: [
    { number: 1, blocks: [{ runs: [{ text: "Welcome", bold: true }] }, { runs: [{ text: "Sub <title>" }] }] },
    { number: 3, blocks: [{ runs: [{ text: XSS }] }] },
  ],
};

await test("escapeHtml escapes all five significant characters", () => {
  assert.strictEqual(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

await test("escapeMarkdown neutralises inline markup and block markers", () => {
  assert.strictEqual(escapeMarkdown("a*b_c`d"), "a\\*b\\_c\\`d");
  assert.strictEqual(escapeMarkdown("# not heading"), "\\# not heading");
  assert.strictEqual(escapeMarkdown("<b>"), "\\<b\\>");
  assert.strictEqual(escapeMarkdown("1. not list"), "1\\. not list");
});

await test("buildHtmlDocument escapes the title and adds CSP + no-referrer", () => {
  const html = buildHtmlDocument("</title><script>x</script>", "<p>ok</p>");
  assertSafeHtml(html);
  assert.ok(html.includes("<title>&lt;/title&gt;&lt;script&gt;x&lt;/script&gt;</title>"));
  assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
  assert.ok(html.includes('<meta charset="utf-8">'));
});

await test("docxToText flattens blocks with bullets for list items", () => {
  assert.strictEqual(docxToText(docx), `Title & <Intro>\n\nPlain bold and it\n\n- first\n- second *star*\n\n${XSS}\n`);
});

await test("docxToMarkdown maps headings, emphasis and lists", () => {
  const md = docxToMarkdown(docx);
  assert.ok(md.startsWith("# Title & \\<Intro\\>\n\n"));
  assert.ok(md.includes("Plain **bold** and *it*"));
  assert.ok(md.includes("- first\n- second \\*star\\*\n"));
  assert.ok(!md.includes("<script>"), "markup in text is escaped");
});

await test("docxToHtml produces escaped, script-free standalone HTML", () => {
  const html = docxToHtml(docx, "Report.docx");
  assertSafeHtml(html);
  assert.ok(html.includes("<h1>Title &amp; &lt;Intro&gt;</h1>"));
  assert.ok(html.includes("<p>Plain <strong>bold</strong> and <em>it</em></p>"));
  assert.ok(html.includes("<ul><li>first</li><li>second *star*</li></ul>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

await test("docx export works on real parser output", () => {
  const xml = `<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Hi</w:t></w:r></w:p><w:p><w:r><w:t>Body</w:t></w:r></w:p></w:body></w:document>`;
  const md = docxToMarkdown(parseDocxDocument(xml));
  assert.strictEqual(md, "## Hi\n\nBody\n");
});

await test("pptx exports label each slide", () => {
  assert.strictEqual(pptxToText(pptx), `Slide 1\n\nWelcome\nSub <title>\n\nSlide 3\n\n${XSS}\n`);
  const md = pptxToMarkdown(pptx);
  assert.ok(md.startsWith("## Slide 1\n\n**Welcome**\n\nSub \\<title\\>\n\n---\n\n## Slide 3\n\n"));
  const html = pptxToHtml(pptx, "Deck.pptx");
  assertSafeHtml(html);
  assert.ok(html.includes("<h2>Slide 1</h2>"));
  assert.ok(html.includes("<p><strong>Welcome</strong></p>"));
  assert.ok(html.includes("Sub &lt;title&gt;"));
});

await test("markdownToHtml renders the viewer's Markdown subset safely", () => {
  const html = markdownToHtml(`# Head *x*\n\n- one\n* **two**\n\nPara \`code\` and ${XSS}\n### Small`, "notes.md");
  assertSafeHtml(html);
  assert.ok(html.includes("<h1>Head <em>x</em></h1>"));
  assert.ok(html.includes("<ul><li>one</li><li><strong>two</strong></li></ul>"));
  assert.ok(html.includes("<p>Para <code>code</code> and &lt;script&gt;"));
  assert.ok(html.includes("<h3>Small</h3>"));
});

await test("markdownToHtml does not let link/image syntax create resources", () => {
  const html = markdownToHtml("![x](javascript:alert(1)) [y](data:text/html,hi)", "a.md");
  assertSafeHtml(html);
  assert.ok(!html.includes("<a"));
});

await test("plainTextToHtml preserves whitespace in an escaped <pre>", () => {
  const html = plainTextToHtml(`line 1\n  indented & ${XSS}`, "a.txt");
  assertSafeHtml(html);
  assert.ok(html.includes("<pre>line 1\n  indented &amp; &lt;script&gt;"));
});

await test("rtfToPlainText strips control words and groups", () => {
  assert.strictEqual(rtfToPlainText("{\\rtf1\\ansi{\\b Hello} world\\par\n}"), "Hello world");
});

await test("Unicode survives every converter", () => {
  const d = { truncated: false, blocks: [{ type: "paragraph", runs: [{ text: "日本語 🌙 café" }] }] };
  assert.ok(docxToText(d).includes("日本語 🌙 café"));
  assert.ok(docxToHtml(d, "x").includes("日本語 🌙 café"));
  assert.ok(markdownToHtml("日本語 🌙", "x").includes("日本語 🌙"));
});

console.log(`\n🎉 Document export tests complete. Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
