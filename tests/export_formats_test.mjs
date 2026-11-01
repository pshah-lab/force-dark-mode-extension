// tests/export_formats_test.mjs — format availability, filenames, and the viewer's Export wiring.
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { detectDocumentKind, getExportFormats, exportFileName, EXPORT_MIME_TYPES } from "../src/viewer/convert/exportFormats.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("=========================================");
console.log("⬇️  Running Export Formats & Wiring Tests");
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

const ids = (kind) => getExportFormats(kind).map((f) => f.id);

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

await test("each kind offers only valid output formats, never PDF", () => {
  assert.deepStrictEqual(ids("pdf"), ["txt", "md", "png"]);
  assert.deepStrictEqual(ids("docx"), ["txt", "md", "html"]);
  assert.deepStrictEqual(ids("pptx"), ["txt", "md", "html"]);
  assert.deepStrictEqual(ids("xlsx"), ["csv", "json"]);
  assert.deepStrictEqual(ids("csv"), ["xlsx"]);
  assert.deepStrictEqual(ids("markdown"), ["html"]);
  assert.deepStrictEqual(ids("text"), ["html"]);
  assert.deepStrictEqual(ids("rtf"), ["html"]);
  assert.deepStrictEqual(ids(null), []);
  assert.deepStrictEqual(ids("bogus"), []);
  for (const kind of ["pdf", "docx", "pptx", "xlsx", "csv", "markdown", "text", "rtf"]) {
    for (const f of getExportFormats(kind)) {
      assert.ok(f.label && f.ext, `${kind}/${f.id} has label and ext`);
      assert.notStrictEqual(f.ext, "pdf");
    }
  }
});

await test("getExportFormats returns copies callers cannot mutate", () => {
  getExportFormats("pdf")[0].ext = "exe";
  assert.strictEqual(getExportFormats("pdf")[0].ext, "txt");
});

await test("exportFileName swaps the extension and sanitises the base", () => {
  assert.strictEqual(exportFileName("Report.final.docx", "md"), "Report.final.md");
  assert.strictEqual(exportFileName("data", "csv"), "data.csv");
  assert.strictEqual(exportFileName("../../etc/pass:wd?.pdf", "txt"), "pass_wd_.txt");
  assert.strictEqual(exportFileName("", "html"), "document.html");
  assert.strictEqual(exportFileName(".pdf", "png"), "document.png");
  assert.strictEqual(exportFileName("日本語.pptx", "html"), "日本語.html");
  assert.strictEqual(exportFileName("a\u0000b‮.pdf", "txt"), "a_b_.txt");
  assert.ok(exportFileName("x".repeat(500) + ".pdf", "txt").length <= 150);
});

await test("every format ext has a MIME type", () => {
  for (const ext of ["txt", "md", "html", "png", "zip", "csv", "json", "xlsx"]) {
    assert.ok(EXPORT_MIME_TYPES[ext], ext);
  }
  assert.ok(EXPORT_MIME_TYPES.txt.includes("charset=utf-8"));
});

const html = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.html"), "utf8");
const js = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.js"), "utf8");
const css = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.css"), "utf8");

await test("viewer.html declares the Export control, disabled until a file is open", () => {
  assert.ok(/<select id="export-format"[^>]*disabled/.test(html), "export select");
  assert.ok(/<button id="export-button" type="button"[^>]*disabled/.test(html), "download button");
  assert.ok(/<input\s+id="export-pages"[^>]*hidden/.test(html), "page-range input hidden by default");
  assert.ok(/id="export-status"[^>]*aria-live="polite"/.test(html), "status announces results");
});

await test("viewer.js wires the export helpers and downloads via a revoked object URL", () => {
  assert.ok(js.includes('from "./convert/exportFormats.js"'));
  assert.ok(js.includes('from "./convert/docExport.js"'));
  assert.ok(js.includes('from "./convert/pdfExport.js"'));
  assert.ok(js.includes('from "./convert/csvWriter.js"'));
  assert.ok(js.includes('from "./convert/xlsxWriter.js"'));
  assert.ok(js.includes('from "./convert/zipWriter.js"'));
  assert.ok(js.includes("getElementById(\"export-format\")"));
  assert.ok(/\.download\s*=/.test(js), "uses <a download>");
  assert.ok(/URL\.revokeObjectURL\(/.test(js), "revokes the download URL");
  assert.ok(js.includes("No selectable text found; scanned PDFs are not supported"));
  assert.ok(!js.includes(".innerHTML"));
});

await test("viewer.css styles the export controls", () => {
  assert.ok(css.includes(".export-group"));
  assert.ok(css.includes("#export-pages"));
});

await test("convert modules stay local-only and DOM-free", () => {
  const dir = path.join(rootDir, "src/viewer/convert");
  const files = fs.readdirSync(dir).filter((n) => n.endsWith(".js"));
  assert.deepStrictEqual(files.sort(), ["csvWriter.js", "docExport.js", "exportFormats.js", "pdfExport.js", "xlsxWriter.js", "zipWriter.js"]);
  for (const name of files) {
    const code = fs.readFileSync(path.join(dir, name), "utf8");
    for (const [re, label] of [
      [/\bfetch\s*\(/, "fetch"],
      [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
      [/\bWebSocket\b/, "WebSocket"],
      [/\bsendBeacon\b/, "sendBeacon"],
      [/\beval\s*\(/, "eval"],
      [/\bnew\s+Function\b/, "new Function"],
      [/\bdocument\./, "document"],
      [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|chrome\.storage/, "storage"],
      [/\.innerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b/, "HTML-string DOM"],
    ]) {
      assert.ok(!re.test(code), `${label} found in convert/${name}`);
    }
  }
});

await test("manifest is untouched by the export feature", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  assert.deepStrictEqual(manifest.permissions, ["storage", "activeTab", "contextMenus", "sidePanel"]);
  assert.ok(!("downloads" in manifest));
});

console.log(`\n🎉 Export formats & wiring tests complete. Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
