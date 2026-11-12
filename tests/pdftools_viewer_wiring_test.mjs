// tests/pdftools_viewer_wiring_test.mjs - Viewer "Tools" control: pure menu logic + source-level wiring
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

const menu = await import("../src/tools/viewerToolMenu.js").catch((e) => ({ loadError: e }));
const { getTool } = await import("../src/tools/toolRegistry.js");
const need = () => { if (menu.loadError) throw menu.loadError; return menu; };

const SINGLE_IDS = ["extract", "remove", "reorder", "rotate", "page-numbers", "watermark", "strip-metadata", "color-copy"];
const HANDOFF_IDS = ["merge", "split", "images-to-pdf"];

// ---------------------------------------------------------------- pure menu logic
test("viewer lists exactly the single-file PDF tools, in registry order", () => {
  const { VIEWER_TOOLS } = need();
  assert.deepStrictEqual(VIEWER_TOOLS.map((t) => t.id).sort(), [...SINGLE_IDS].sort());
  for (const t of VIEWER_TOOLS) {
    assert.strictEqual(t, getTool(t.id), "same frozen registry entry (labels and copy reused verbatim)");
    assert.strictEqual(t.accepts, "pdf");
    assert.strictEqual(t.multiple, false);
  }
  assert.ok(Object.isFrozen(VIEWER_TOOLS));
});

test("merge, split and images to PDF are hand-offs to the Tools page", () => {
  const { HANDOFF_TOOLS, VIEWER_TOOLS } = need();
  assert.deepStrictEqual(HANDOFF_TOOLS.map((t) => t.id).sort(), [...HANDOFF_IDS].sort());
  for (const t of HANDOFF_TOOLS) assert.ok(!VIEWER_TOOLS.includes(t), `${t.id} not run in the viewer`);
  assert.ok(Object.isFrozen(HANDOFF_TOOLS));
});

test("More tools link targets src/tools/tools.html#<id>, only for known tools", () => {
  const { toolsPagePath } = need();
  assert.strictEqual(toolsPagePath("merge"), "src/tools/tools.html#merge");
  assert.strictEqual(toolsPagePath("split"), "src/tools/tools.html#split");
  assert.strictEqual(toolsPagePath("images-to-pdf"), "src/tools/tools.html#images-to-pdf");
  assert.strictEqual(toolsPagePath("nope"), "src/tools/tools.html");
  assert.strictEqual(toolsPagePath("x\"><script>"), "src/tools/tools.html");
  assert.strictEqual(toolsPagePath(undefined), "src/tools/tools.html");
});

test("control is enabled only for an open PDF whose bytes the viewer holds", () => {
  const { viewerToolsState } = need();
  const none = viewerToolsState(null, false);
  assert.strictEqual(none.enabled, false);
  assert.strictEqual(none.placeholder, "Open a file first");
  for (const kind of ["docx", "pptx", "xlsx", "csv", "markdown", "rtf", "text"]) {
    const s = viewerToolsState(kind, true);
    assert.strictEqual(s.enabled, false, `${kind} disabled`);
    assert.strictEqual(s.placeholder, "PDFs only");
    assert.ok(/PDF/.test(s.title), `${kind} explains why`);
  }
  const url = viewerToolsState("pdf", false);
  assert.strictEqual(url.enabled, false, "URL-opened PDF without bytes: disabled, no fetch");
  assert.ok(/Open file/.test(url.title), "tells the user how to enable it");
  assert.ok(url.placeholder.length > 0);
  const ok = viewerToolsState("pdf", true);
  assert.strictEqual(ok.enabled, true);
  assert.strictEqual(ok.title, "");
});

test("verbatim copy from the Tools page is what the viewer shows", () => {
  const { VIEWER_TOOLS } = need();
  const strip = VIEWER_TOOLS.find((t) => t.id === "strip-metadata");
  assert.match(strip.description, /Info fields and XMP metadata only/);
  const color = VIEWER_TOOLS.find((t) => t.id === "color-copy");
  assert.deepStrictEqual(color.options[0].choices.map((c) => c.label), ["Dark (image copy)", "Sepia (image copy)", "Grayscale (image copy)"]);
  assert.match(color.description, /image-only copy/);
  assert.match(color.description, /first 50 pages/);
});

// ---------------------------------------------------------------- source-level wiring
const html = read("src/viewer/viewer.html");
const js = read("src/viewer/viewer.js");
const css = read("src/viewer/viewer.css");

test("viewer.html has the Tools control beside Export, disabled until a PDF is open", () => {
  const exportAt = html.indexOf('id="export-format"');
  const toolsAt = html.indexOf('id="tools-tool"');
  assert.ok(toolsAt > 0, "viewer.html has #tools-tool");
  assert.ok(toolsAt > exportAt && toolsAt - exportAt < 1500, "beside Export");
  assert.ok(/<select id="tools-tool"[^>]*disabled/.test(html), "tool select disabled by default");
  assert.ok(/<option value="">Open a file first<\/option>/.test(html.slice(toolsAt)), "same empty text as Export");
  assert.ok(/<button id="tools-run" type="button"[^>]*disabled/.test(html), "run/download button disabled by default");
  assert.ok(/id="tools-status"[^>]*role="status"[^>]*aria-live="polite"/.test(html), "status line announces");
  assert.ok(html.includes('id="tools-panel"'), "options panel");
  assert.ok(html.includes('id="tools-options"'), "options form");
  assert.ok(html.includes('id="tools-messages"'), "warnings / errors area");
  assert.ok(html.includes('id="tools-more"'), "More tools entry");
  assert.ok(html.includes("More tools…"), "More tools label");
  assert.ok(!/\son[a-z]+\s*=/i.test(html), "no inline handlers");
});

test("viewer.js imports the registry, menu and shared option rows; still no .innerHTML", () => {
  assert.ok(js.includes('from "../tools/toolRegistry.js"'), "imports toolRegistry.js");
  assert.ok(js.includes('from "../tools/viewerToolMenu.js"'));
  assert.ok(js.includes('from "../tools/optionFields.js"'));
  assert.ok(js.includes('from "../tools/download.js"') || /function downloadBlob/.test(js), "downloads locally");
  assert.ok(!js.includes(".innerHTML"), "no .innerHTML");
  assert.ok(!/insertAdjacentHTML|outerHTML/.test(js));
  assert.ok(!/\bfetch\s*\(/.test(js), "no fetch");
  assert.ok(/getElementById\("tools-tool"\)/.test(js));
  assert.ok(/getElementById\("tools-run"\)/.test(js));
  assert.ok(/getElementById\("tools-status"\)/.test(js));
});

test("viewer.js gates the control on the document kind and on held bytes", () => {
  const set = js.slice(js.indexOf("function setToolsSource"), js.indexOf("function clearToolsSource"));
  assert.ok(set.length > 0, "setToolsSource exists before clearToolsSource");
  assert.ok(/viewerToolsState\(/.test(set), "uses viewerToolsState");
  const exportSet = js.slice(js.indexOf("function setExportSource"), js.indexOf("function clearExportSource"));
  assert.ok(/setToolsSource\(kind/.test(exportSet), "Export source changes drive the Tools source (kind from detectDocumentKind / openPdf)");
  const exportClear = js.slice(js.indexOf("function clearExportSource"), js.indexOf("function updateExportControls"));
  assert.ok(/clearToolsSource\(\)/.test(exportClear), "clearing the open file clears the tool source");
  assert.ok(/instanceof Uint8Array/.test(set) || /currentPdfBytes\(\)/.test(exportSet), "only bytes the viewer already holds");
});

test("viewer.js runs tools with stale-run guards and hands off multi-file tools", () => {
  const runAt = js.indexOf("async function runViewerTool");
  assert.ok(runAt > 0, "runViewerTool exists");
  const run = js.slice(runAt, runAt + 4000);
  assert.ok(/toolsGeneration/.test(run), "generation token guards against stale results");
  assert.ok(/toolsSource !== source|source !== toolsSource/.test(run), "file change discards the result");
  assert.ok(/runTool\(/.test(run), "runs through the registry");
  assert.ok(/readValues\(/.test(js), "typed values from the registry");
  assert.ok(/warnings/.test(run), "shows warnings");
  assert.ok(/chrome\.runtime\.getURL\(toolsPagePath\(/.test(js), "More tools links via chrome.runtime.getURL");
  assert.ok(/target\s*=\s*"_blank"|target: "_blank"/.test(js) || /target="_blank"/.test(html), "opens in a new tab");
  assert.ok(/MAX_PNG_PAGES/.test(js), "50-page cap for image copies");
  assert.ok(/pngRenderScale/.test(js), "40 MP scale cap");
  assert.ok(/convertPixels\(/.test(js), "dark / sepia / gray pixel conversion");
  assert.ok(/toBlob\([^)]*"image\/jpeg"/.test(js), "JPEG pages");
  assert.ok(/tool\.description|\.description\b/.test(run + js), "shows the registry's description copy");
});

test("tools.js and the viewer share the option-row helper", () => {
  const tools = read("src/tools/tools.js");
  assert.ok(tools.includes('from "./optionFields.js"'));
  const helper = read("src/tools/optionFields.js");
  assert.ok(/export function buildOptionFields/.test(helper));
  assert.ok(!/\.innerHTML\b|insertAdjacentHTML|\bfetch\s*\(/.test(helper));
});

test("viewer.css styles the Tools control", () => {
  assert.ok(css.includes(".tools-group"));
  assert.ok(css.includes(".tools-panel"));
});

test("new modules are egress-scanned", () => {
  const privacy = read("tests/privacy_security_test.mjs");
  assert.ok(privacy.includes('"src/tools/viewerToolMenu.js"'));
  assert.ok(privacy.includes('"src/tools/optionFields.js"'));
});

test("manifest permissions unchanged", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.deepStrictEqual(manifest.permissions, ["storage", "activeTab", "contextMenus", "sidePanel"]);
});

console.log("\nViewer PDF tools");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
