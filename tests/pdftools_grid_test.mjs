// tests/pdftools_grid_test.mjs - card-grid landing page: registry metadata, new tools, page wiring
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument } from "../src/viewer/vendor/pdf-lib.min.mjs";
import { TOOLS, getTool, gridTools, CATEGORIES, runTool, readValues, acceptsFile, toolFromHash } from "../src/tools/toolRegistry.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
const queue = [];
const test = (name, fn) => queue.push({ name, fn });

const GRID_ORDER = [
  "merge", "split", "compress", "rotate",
  "pdf-to-images", "images-to-pdf", "organize", "watermark",
  "encrypt", "decrypt", "html-to-pdf", "share",
];
const EXTRA_CARDS = ["page-numbers", "strip-metadata", "color-copy"];

async function pdf(n, name = "doc.pdf") {
  const d = await PDFDocument.create();
  for (let i = 1; i <= n; i++) d.addPage([100 + i, 200]);
  return { name, bytes: await d.save() };
}
const widths = async (f) => (await PDFDocument.load(f.bytes)).getPages().map((p) => p.getWidth());

test("the grid shows the 12 requested tools first, in order, then the extra cards", () => {
  const ids = gridTools().map((t) => t.id);
  assert.deepStrictEqual(ids.slice(0, 12), GRID_ORDER);
  assert.deepStrictEqual(ids.slice(12), EXTRA_CARDS);
  for (const hidden of ["extract", "remove", "reorder"]) {
    assert.ok(!ids.includes(hidden), `${hidden} is folded into Organize Pages`);
    assert.ok(getTool(hidden), `${hidden} stays reachable by hash for the viewer and old links`);
  }
});

test("every card has a category, a one-line summary, a tile colour and no third-party brand", () => {
  for (const t of gridTools()) {
    assert.ok(CATEGORIES.includes(t.category), `${t.id} category`);
    assert.strictEqual(typeof t.summary, "string", `${t.id} summary`);
    assert.ok(t.summary.length > 0 && t.summary.length <= 72, `${t.id} summary is one short line`);
    assert.ok(/^[a-z]+$/.test(t.tile), `${t.id} tile colour class`);
    assert.ok(!/ilovepdf|smallpdf|adobe|sejda|pdf24/i.test(`${t.title} ${t.summary} ${t.description}`), `${t.id} no brand names`);
  }
  assert.deepStrictEqual([...CATEGORIES].sort(), ["EDIT", "CONVERT", "OPTIMIZE", "ORGANIZE", "SECURITY", "SHARE"].sort());
  const newIds = gridTools().filter((t) => t.isNew).map((t) => t.id).sort();
  assert.deepStrictEqual(newIds, ["decrypt", "encrypt", "share"]);
});

test("Share Files is a disabled Coming soon card with the reason, and cannot run", async () => {
  const t = getTool("share");
  assert.strictEqual(t.disabled, true);
  assert.match(t.comingSoon, /same network|nearby|local/i);
  assert.match(t.comingSoon, /server|permission|privacy/i);
  const r = await runTool(t, [], {});
  assert.strictEqual(r.outputs.length, 0);
  assert.ok(r.errors.length >= 1);
  assert.strictEqual(toolFromHash("#share"), null, "disabled tool has no work view");
  for (const other of GRID_ORDER.filter((id) => id !== "share")) assert.ok(!getTool(other).disabled, `${other} is enabled`);
});

test("new tools stay out of the viewer menu so its list is unchanged", async () => {
  const { VIEWER_TOOLS } = await import("../src/tools/viewerToolMenu.js");
  const ids = VIEWER_TOOLS.map((t) => t.id);
  for (const id of ["compress", "organize", "encrypt", "decrypt", "pdf-to-images", "html-to-pdf", "share"]) {
    assert.ok(!ids.includes(id), `${id} not in the viewer menu`);
  }
});

test("Organize Pages covers extract, remove, reorder and rotate", async () => {
  const t = getTool("organize");
  const f = await pdf(5);
  const run = async (v) => (await runTool(t, [f], readValues(t, v)));
  let r = await run({ action: "extract", pages: "4,2-3" });
  assert.deepStrictEqual(await widths(r.outputs[0].files[0]), [104, 102, 103]);
  r = await run({ action: "remove", pages: "2,4" });
  assert.deepStrictEqual(await widths(r.outputs[0].files[0]), [101, 103, 105]);
  r = await run({ action: "reorder", pages: "5,4,3,2,1" });
  assert.deepStrictEqual(await widths(r.outputs[0].files[0]), [105, 104, 103, 102, 101]);
  r = await run({ action: "rotate", pages: "1", angle: "90" });
  const rotated = await PDFDocument.load(r.outputs[0].files[0].bytes);
  assert.strictEqual(rotated.getPage(0).getRotation().angle, 90);
  assert.strictEqual(rotated.getPage(1).getRotation().angle, 0);
  assert.deepStrictEqual(t.options.find((o) => o.id === "action").choices.map((c) => c.value), ["extract", "remove", "reorder", "rotate"]);
});

test("Encrypt then Decrypt through the registry round-trips", async () => {
  const enc = getTool("encrypt");
  const dec = getTool("decrypt");
  assert.strictEqual(enc.options.find((o) => o.id === "userPassword").type, "password");
  assert.strictEqual(dec.options.find((o) => o.id === "password").type, "password");
  for (const id of ["allowPrint", "allowCopy", "allowEdit"]) assert.strictEqual(enc.options.find((o) => o.id === id).type, "checkbox");
  const f = await pdf(2, "paper.pdf");
  const e = await runTool(enc, [f], readValues(enc, { userPassword: "pw1", allowPrint: true }));
  assert.strictEqual(e.errors.length, 0, JSON.stringify(e.errors));
  const encFile = e.outputs[0].files[0];
  const bad = await runTool(dec, [{ name: encFile.name, bytes: encFile.bytes }], readValues(dec, { password: "zzz" }));
  assert.match(bad.errors[0].message, /incorrect password/i);
  const ok = await runTool(dec, [{ name: encFile.name, bytes: encFile.bytes }], readValues(dec, { password: "pw1" }));
  assert.strictEqual(ok.errors.length, 0);
  assert.deepStrictEqual(await widths(ok.outputs[0].files[0]), [101, 102]);
  const none = await runTool(enc, [f], readValues(enc, { userPassword: "" }));
  assert.match(none.errors[0].message, /password/i);
});

test("Compress passes notes through and offers image quality", async () => {
  const t = getTool("compress");
  assert.ok(t.options.some((o) => o.id === "imageQuality" && o.type === "select"));
  assert.ok(t.options.some((o) => o.id === "removeMetadata" && o.type === "checkbox"));
  const d = await PDFDocument.create();
  d.addPage();
  d.context.register(d.context.stream("x".repeat(50000)));
  const f = { name: "c.pdf", bytes: await d.save({ useObjectStreams: false }) };
  const r = await runTool(t, [f], readValues(t, {}));
  assert.strictEqual(r.errors.length, 0);
  assert.ok(Array.isArray(r.outputs[0].notes) && r.outputs[0].notes.length === 1);
});

test("PDF to Images turns rendered pages into files and offers JPG or PNG", async () => {
  const t = getTool("pdf-to-images");
  assert.strictEqual(t.renderer, "pdf-images");
  assert.deepStrictEqual(t.options.find((o) => o.id === "format").choices.map((c) => c.value), ["jpg", "png"]);
  const rendered = { name: "doc.pdf", images: [{ name: "doc-page-1.jpg", bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" }], totalPages: 1 };
  const r = await runTool(t, [rendered], readValues(t, {}));
  assert.strictEqual(r.outputs[0].files[0].name, "doc-page-1.jpg");
  assert.strictEqual(r.outputs[0].files[0].mime, "image/jpeg");
});

test("HTML to PDF accepts .html files, has a paste box and a page size, and is offline-only", async () => {
  const t = getTool("html-to-pdf");
  assert.strictEqual(t.renderer, "html");
  assert.strictEqual(t.accepts, "html");
  assert.ok(acceptsFile(t, { name: "page.html", type: "text/html" }));
  assert.ok(acceptsFile(t, { name: "page.htm", type: "" }));
  assert.ok(!acceptsFile(t, { name: "a.pdf", type: "application/pdf" }));
  assert.ok(t.options.some((o) => o.id === "html" && o.type === "textarea"));
  assert.ok(t.options.some((o) => o.id === "pageSize" && o.type === "select"));
  assert.match(t.description, /not selectable|image/i);
  assert.match(t.description, /remote|internet|offline|external/i);
  // rendered pages -> PDF
  const JPG = new Uint8Array(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=", "base64"));
  const r = await runTool(t, [{ name: "page.html", pages: [{ width: 595, height: 842, jpegBytes: JPG }], totalPages: 1 }], readValues(t, {}));
  assert.strictEqual(r.errors.length, 0, JSON.stringify(r.errors));
  assert.strictEqual(r.outputs[0].files[0].name, "page.pdf");
  assert.strictEqual((await PDFDocument.load(r.outputs[0].files[0].bytes)).getPageCount(), 1);
});

test("page markup is a card grid with a work view, back link, and accessible names", () => {
  const html = read("src/tools/tools.html");
  assert.match(html, /id="tool-list"[^>]*class="tool-grid"/);
  assert.match(html, /id="grid-view"/);
  assert.match(html, /id="tool-view"/);
  assert.match(html, /id="back-link"/);
  assert.match(html, /id="tool-search"[^>]*aria-label="Search tools"/, "search box with an accessible name");
  assert.match(html, /id="category-filters"[^>]*role="group"/, "category chips");
  assert.match(html, /class="work-card"/, "work view panel");
  assert.match(html, /Back to all tools/);
  assert.match(html, /<h1[^>]*>PDF Tools<\/h1>/);
  assert.match(html, /name="viewport"/);
  const css = read("src/tools/tools.css");
  assert.match(css, /prefers-color-scheme:\s*dark/, "supports dark theme");
  assert.match(css, /grid-template-columns:\s*repeat\(4/, "4 columns");
  assert.match(css, /grid-template-columns:\s*repeat\(2/, "2 columns");
  assert.match(css, /grid-template-columns:\s*1fr|repeat\(1/, "1 column");
  assert.match(css, /:focus-visible/, "keyboard focus states");
  assert.match(css, /prefers-reduced-motion/, "reduced motion respected");
  const js = read("src/tools/tools.js");
  assert.ok(!/\.innerHTML|insertAdjacentHTML|document\.write/.test(js), "no HTML string injection in tools.js");
  assert.match(js, /Open Tool/);
  assert.match(js, /function applyFilter/, "search and category filter");
  assert.match(js, /"success"/, "success banner tone");
  assert.match(js, /Coming soon/);
});

for (const { name, fn } of queue) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n${e && e.stack}`);
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log("pdftools_grid_test: all passed");
