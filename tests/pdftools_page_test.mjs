// tests/pdftools_page_test.mjs - Tools page: registry (pure) + source-level wiring checks
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts } from "../src/viewer/vendor/pdf-lib.min.mjs";
import { TOOLS, getTool, toolFromHash, readValues, runTool, zipEntryNames } from "../src/tools/toolRegistry.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

async function makePdf(pages = 3, info = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([200, 300]).drawText(`p${i + 1}`, { x: 20, y: 20, font, size: 12 });
  if (info.author) doc.setAuthor(info.author);
  return doc.save();
}
const pageCount = async (bytes) => (await PDFDocument.load(bytes)).getPageCount();
// 1x1 JPEG fixture (same as pdftools_raster_test)
const JPG1 = new Uint8Array(Buffer.from("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z", "base64"));

const SPEC_IDS = ["merge", "split", "extract", "remove", "reorder", "rotate", "images-to-pdf", "page-numbers", "watermark", "strip-metadata", "color-copy"];
const OPTION_TYPES = ["text", "number", "select", "checkbox"];

// ---------------------------------------------------------------- registry shape
test("registry has every spec tool with unique ids and the documented shape", () => {
  assert.ok(Array.isArray(TOOLS));
  const ids = TOOLS.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, "ids are unique");
  assert.deepStrictEqual([...ids].sort(), [...SPEC_IDS].sort());
  for (const t of TOOLS) {
    assert.strictEqual(typeof t.title, "string", t.id);
    assert.ok(t.title.length > 0, t.id);
    assert.ok(t.accepts === "pdf" || t.accepts === "images", `${t.id} accepts`);
    assert.strictEqual(typeof t.multiple, "boolean", `${t.id} multiple`);
    assert.ok(Array.isArray(t.options), `${t.id} options`);
    assert.strictEqual(typeof t.run, "function", `${t.id} run`);
    assert.strictEqual(typeof t.description, "string", `${t.id} description`);
    const optIds = t.options.map((o) => o.id);
    assert.strictEqual(new Set(optIds).size, optIds.length, `${t.id} option ids unique`);
    for (const o of t.options) {
      assert.ok(OPTION_TYPES.includes(o.type), `${t.id}.${o.id} type`);
      assert.strictEqual(typeof o.label, "string");
      if (o.type === "select") {
        assert.ok(Array.isArray(o.choices) && o.choices.length > 0, `${t.id}.${o.id} choices`);
        assert.ok(o.choices.some((c) => c.value === o.default), `${t.id}.${o.id} default is a choice`);
      }
    }
  }
  assert.strictEqual(getTool("merge").multiple, true);
  assert.strictEqual(getTool("images-to-pdf").multiple, true);
  assert.strictEqual(getTool("images-to-pdf").accepts, "images");
  assert.strictEqual(getTool("extract").multiple, false);
  assert.strictEqual(getTool("nope"), null);
});

test("registry is frozen so the UI cannot mutate it", () => {
  assert.ok(Object.isFrozen(TOOLS));
  assert.ok(Object.isFrozen(TOOLS[0]));
});

test("location.hash preselects a tool; unknown or empty hash gives null", () => {
  assert.strictEqual(toolFromHash("#merge").id, "merge");
  assert.strictEqual(toolFromHash("#watermark").id, "watermark");
  assert.strictEqual(toolFromHash("merge").id, "merge");
  assert.strictEqual(toolFromHash("#MERGE").id, "merge");
  assert.strictEqual(toolFromHash(""), null);
  assert.strictEqual(toolFromHash("#__proto__"), null);
  assert.strictEqual(toolFromHash("#constructor"), null);
  assert.strictEqual(toolFromHash(undefined), null);
});

test("color copy labels are honest: image copy, image-only, differs from viewer", () => {
  const t = getTool("color-copy");
  assert.strictEqual(t.render, true, "UI must pre-render pages for this tool");
  const mode = t.options.find((o) => o.id === "mode");
  assert.deepStrictEqual(mode.choices.map((c) => [c.value, c.label]), [
    ["dark", "Dark (image copy)"],
    ["sepia", "Sepia (image copy)"],
    ["gray", "Grayscale (image copy)"],
  ]);
  assert.match(t.description, /image-only/i);
  assert.match(t.description, /not selectable/i);
  assert.match(t.description, /re-rendered as images/i);
  assert.match(t.description, /differ slightly/i);
  assert.ok(!/matches Smart Dark/i.test(t.description));
});

test("strip metadata copy says Info fields and XMP only, never all personal data", () => {
  const t = getTool("strip-metadata");
  assert.match(t.description, /Info fields and XMP metadata only/);
  assert.match(t.description, /annotation/i);
  assert.match(t.description, /attachment/i);
  assert.match(t.description, /form/i);
  assert.ok(!/all (personal|private|hidden) (data|information)/i.test(t.description));
  assert.ok(!/removes all/i.test(t.description));
  assert.strictEqual(typeof t.inspect, "function", "strip tool exposes inspectMetadata for the preview");
});

test("readValues coerces raw form values by option type and applies defaults", () => {
  const t = getTool("page-numbers");
  const v = readValues(t, { size: "12", startAt: "3", position: "top-right" });
  assert.strictEqual(v.size, 12);
  assert.strictEqual(v.startAt, 3);
  assert.strictEqual(v.position, "top-right");
  assert.strictEqual(v.format, "n");
  const w = readValues(getTool("watermark"), { text: "DRAFT", diagonal: false });
  assert.strictEqual(w.diagonal, false);
  assert.strictEqual(w.opacity, 0.3);
  // Bad select values fall back to the default, never pass through.
  assert.strictEqual(readValues(t, { position: "middle" }).position, "bottom-center");
  // Blank number is the default; junk is NaN so the engine reports it.
  assert.strictEqual(readValues(t, { size: "" }).size, 10);
  assert.ok(Number.isNaN(readValues(t, { size: "abc" }).size));
});

// ---------------------------------------------------------------- running
test("merge combines all files into one PDF; fewer than two files is a readable error", async () => {
  const a = { name: "a.pdf", bytes: await makePdf(2) };
  const b = { name: "b.pdf", bytes: await makePdf(3) };
  const out = await runTool(getTool("merge"), [a, b], {});
  assert.deepStrictEqual(out.errors, []);
  assert.strictEqual(out.outputs.length, 1);
  assert.strictEqual(await pageCount(out.outputs[0].files[0].bytes), 5);
  const one = await runTool(getTool("merge"), [a], {});
  assert.strictEqual(one.outputs.length, 0);
  assert.match(one.errors[0].message, /at least 2/i);
});

test("single-file tools run per file: a corrupt file errors by name, the others still finish", async () => {
  const good = { name: "good.pdf", bytes: await makePdf(4) };
  const bad = { name: "broken.pdf", bytes: new Uint8Array([1, 2, 3, 4]) };
  const good2 = { name: "good2.pdf", bytes: await makePdf(3) };
  const progress = [];
  const out = await runTool(getTool("extract"), [good, bad, good2], { pages: "1-2" }, (m) => progress.push(m));
  assert.strictEqual(out.outputs.length, 2);
  assert.deepStrictEqual(out.outputs.map((o) => o.source), ["good.pdf", "good2.pdf"]);
  assert.strictEqual(await pageCount(out.outputs[0].files[0].bytes), 2);
  assert.strictEqual(out.errors.length, 1);
  assert.strictEqual(out.errors[0].name, "broken.pdf");
  assert.match(out.errors[0].message, /broken\.pdf could not be read/);
  assert.ok(progress.length >= 3, "progress reported per file");
});

test("a bad page range is reported as the engine's message, no output", async () => {
  const f = { name: "x.pdf", bytes: await makePdf(4) };
  const out = await runTool(getTool("remove"), [f], { pages: "1-4" });
  assert.strictEqual(out.outputs.length, 0);
  assert.match(out.errors[0].message, /remove every page/);
  const out2 = await runTool(getTool("extract"), [f], { pages: "10-" });
  assert.match(out2.errors[0].message, /not a valid page/);
});

test("rotate with blank pages rotates every page", async () => {
  const f = { name: "r.pdf", bytes: await makePdf(3) };
  const out = await runTool(getTool("rotate"), [f], readValues(getTool("rotate"), { pages: "", angle: "90" }));
  assert.deepStrictEqual(out.errors, []);
  const doc = await PDFDocument.load(out.outputs[0].files[0].bytes);
  assert.deepStrictEqual(doc.getPages().map((p) => p.getRotation().angle), [90, 90, 90]);
});

test("split produces several files; reorder and page numbers run", async () => {
  const f = { name: "s.pdf", bytes: await makePdf(3) };
  const s = await runTool(getTool("split"), [f], { groups: "1, 2-3" });
  assert.strictEqual(s.outputs[0].files.length, 2);
  const r = await runTool(getTool("reorder"), [f], { order: "3,2,1" });
  assert.strictEqual(await pageCount(r.outputs[0].files[0].bytes), 3);
  const n = await runTool(getTool("page-numbers"), [f], readValues(getTool("page-numbers"), {}));
  assert.deepStrictEqual(n.errors, []);
  assert.match(n.outputs[0].files[0].name, /-numbered\.pdf$/);
});

test("watermark with characters the font cannot draw surfaces the engine warning", async () => {
  const f = { name: "w.pdf", bytes: await makePdf(1) };
  const out = await runTool(getTool("watermark"), [f], readValues(getTool("watermark"), { text: "機密 DRAFT" }));
  assert.deepStrictEqual(out.errors, []);
  assert.strictEqual(out.outputs[0].warnings.length, 1);
  assert.match(out.outputs[0].warnings[0], /can't be drawn/);
});

test("strip metadata: inspect shows fields, run strips them", async () => {
  const f = { name: "m.pdf", bytes: await makePdf(1, { author: "Jane" }) };
  const t = getTool("strip-metadata");
  const found = await t.inspect(f.bytes);
  assert.ok(found.some((e) => e.field === "Author" && e.value === "Jane"));
  const out = await runTool(t, [f], {});
  assert.deepStrictEqual(out.errors, []);
  assert.ok(!Buffer.from(out.outputs[0].files[0].bytes).includes("Jane"));
});

test("images to PDF takes all images at once and keeps skip warnings", async () => {
  const out = await runTool(getTool("images-to-pdf"), [
    { name: "a.jpg", bytes: JPG1 },
    { name: "notes.txt", bytes: new Uint8Array([65, 66, 67]) },
  ], readValues(getTool("images-to-pdf"), {}));
  assert.deepStrictEqual(out.errors, []);
  assert.strictEqual(out.outputs.length, 1);
  assert.strictEqual(await pageCount(out.outputs[0].files[0].bytes), 1);
  assert.ok(out.outputs[0].warnings.some((w) => /notes\.txt/.test(w)));
});

test("color copy run takes pre-rendered pages, names the file after the source, warns when capped", async () => {
  const t = getTool("color-copy");
  const pages = [{ width: 200, height: 300, jpegBytes: JPG1 }, { width: 200, height: 300, jpegBytes: JPG1 }];
  const out = await runTool(t, [{ name: "report.pdf", pages, totalPages: 60 }], { mode: "sepia" });
  assert.deepStrictEqual(out.errors, []);
  assert.strictEqual(out.outputs[0].files[0].name, "report-sepia.pdf");
  assert.strictEqual(await pageCount(out.outputs[0].files[0].bytes), 2);
  assert.ok(out.outputs[0].warnings.some((w) => /first 2 of 60 pages/.test(w)));
  const none = await runTool(t, [{ name: "x.pdf", pages: [], totalPages: 0 }], { mode: "dark" });
  assert.strictEqual(none.outputs.length, 0);
  assert.ok(none.errors[0].message.length > 0);
});

test("zipEntryNames makes download names unique for the zip", () => {
  assert.deepStrictEqual(zipEntryNames(["a.pdf", "a.pdf", "b.pdf", "A.pdf"]), ["a.pdf", "a-2.pdf", "b.pdf", "A-3.pdf"]);
});

// ---------------------------------------------------------------- source-level wiring
test("tools.html: module script only, no inline script/handlers, no remote URLs", () => {
  const html = read("src/tools/tools.html");
  assert.ok(/<script type="module" src="tools\.js"><\/script>/.test(html));
  assert.ok(/<link rel="stylesheet" href="tools\.css"/.test(html));
  assert.ok(!/<script\b(?![^>]*\ssrc\s*=)[^>]*>/i.test(html), "no inline <script>");
  assert.ok(!/\son[a-z]+\s*=/i.test(html), "no inline handlers");
  assert.ok(!/https?:|\/\/[a-z]/i.test(html), "no remote URLs");
  assert.ok(!/\sstyle\s*=/i.test(html), "no inline styles");
  for (const id of ["tool-list", "file-input", "drop-zone", "options", "run", "progress", "results"]) {
    assert.ok(html.includes(`id="${id}"`), `tools.html has #${id}`);
  }
});

test("tools.js: DOM APIs only, memory-only files, no network or storage", () => {
  const src = read("src/tools/tools.js");
  for (const [re, label] of [
    [/\.innerHTML\b/, ".innerHTML"], [/\bouterHTML\b/, "outerHTML"], [/insertAdjacentHTML/, "insertAdjacentHTML"],
    [/\bfetch\s*\(/, "fetch("], [/\blocalStorage\b/, "localStorage"], [/\bsessionStorage\b/, "sessionStorage"],
    [/\bindexedDB\b/i, "indexedDB"], [/chrome\.storage/, "chrome.storage"], [/XMLHttpRequest/, "XMLHttpRequest"],
    [/https?:\/\//, "URL"], [/\beval\s*\(/, "eval"], [/document\.write/, "document.write"],
  ]) {
    assert.ok(!re.test(src), `tools.js must not use ${label}`);
  }
  assert.ok(src.includes('from "./toolRegistry.js"'));
  assert.ok(/location\.hash/.test(src), "reads the hash to preselect a tool");
  assert.ok(/hashchange/.test(src));
  assert.ok(/createZip/.test(src), "multi-file downloads are zipped");
});

test("downloads use Blob + object URL + <a download>, revoked after 10 s", () => {
  const src = read("src/tools/download.js");
  assert.ok(/URL\.createObjectURL/.test(src));
  assert.ok(/\.download\s*=/.test(src));
  assert.ok(/setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 10000\)/.test(src));
  assert.ok(!/\.innerHTML\b|\bfetch\s*\(|localStorage|sessionStorage/.test(src));
});

test("color copy rendering: bundled PDF.js, page by page, capped, yields, JPEG via toBlob", () => {
  const src = read("src/tools/tools.js");
  assert.ok(src.includes('from "../viewer/vendor/pdf.min.mjs"'));
  assert.ok(/GlobalWorkerOptions\.workerSrc = chrome\.runtime\.getURL\(\s*"src\/viewer\/vendor\/pdf\.worker\.min\.mjs"/.test(src));
  assert.ok(/pngRenderScale/.test(src), "reuses the 40 MP scale cap");
  assert.ok(/MAX_PNG_PAGES/.test(src), "caps at 50 pages");
  assert.ok(/convertPixels\(/.test(src));
  assert.ok(/getImageData\(/.test(src), "converts canvas ImageData (Uint8ClampedArray)");
  assert.ok(/toBlob\([^)]*"image\/jpeg"/.test(src));
  assert.ok(/Page \$\{[^}]+\} of \$\{[^}]+\}/.test(src), "progress line Page N of M");
  assert.ok(/new Promise\(\(resolve\) => setTimeout\(resolve, 0\)\)/.test(src), "yields a macrotask between pages");
});

test("popup has a PDF tools button that opens the tools page in a tab", () => {
  const html = read("src/popup/popup.html");
  const js = read("src/popup/popup.js");
  const tools = html.indexOf('id="open-pdf-tools"');
  assert.ok(tools > 0, "popup.html has #open-pdf-tools");
  assert.ok(Math.abs(tools - html.indexOf('id="open-document-viewer"')) < 300, "beside the file viewer button");
  assert.ok(/getElementById\("open-pdf-tools"\)/.test(js));
  assert.ok(/chrome\.tabs\.create\(\{\s*url: chrome\.runtime\.getURL\("src\/tools\/tools\.html"\)/.test(js));
});

test("manifest permissions unchanged", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.deepStrictEqual(manifest.permissions, ["storage", "activeTab", "contextMenus", "sidePanel"]);
});

console.log("\nPDF tools page");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
