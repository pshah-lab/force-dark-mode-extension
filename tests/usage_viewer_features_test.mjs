// tests/usage_viewer_features_test.mjs — viewer/export feature keys and the viewer's usage hooks.
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { detectDocumentKind, getExportFormats } from "../src/viewer/convert/exportFormats.js";
import { FEATURE_KEYS, SURFACES } from "../src/shared/usageReport.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("=========================================");
console.log("📊 Running Viewer Usage Feature Tests");
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

const KINDS = ["pdf", "docx", "pptx", "xlsx", "csv", "markdown", "text", "rtf"];

let helpers = {};
try {
  helpers = await import("../src/viewer/usageFeatures.js");
} catch (err) {
  console.error(`  ✗ import src/viewer/usageFeatures.js: ${err.message}`);
  failed++;
}
const { viewerFeatureKey, exportFeatureKey, viewerSurface, pdfSourceKind } = helpers;

// ---- Pure helpers -------------------------------------------------------

await test("KINDS covers every kind detectDocumentKind can return", () => {
  const samples = ["a.pdf", "a.docx", "a.pptx", "a.xlsx", "a.csv", "a.md", "a.markdown", "a.rtf", "a.txt", "a.log"];
  for (const name of samples) {
    const kind = detectDocumentKind(name, name === "a.log" ? "text/plain" : "");
    assert.ok(KINDS.includes(kind), `${name} -> ${kind} is not in KINDS`);
  }
});

await test("viewerFeatureKey maps every kind to a FEATURE_KEYS entry", () => {
  const expected = {
    pdf: "viewer_pdf", docx: "viewer_docx", pptx: "viewer_pptx", xlsx: "viewer_xlsx",
    csv: "viewer_csv", markdown: "viewer_md", text: "viewer_txt", rtf: "viewer_rtf",
  };
  for (const kind of KINDS) {
    assert.strictEqual(viewerFeatureKey(kind), expected[kind], kind);
    assert.ok(FEATURE_KEYS.includes(viewerFeatureKey(kind)), kind);
  }
});

await test("viewerFeatureKey returns null for unknown kinds", () => {
  for (const kind of [undefined, null, "", "doc", "zip", "toString", "__proto__", "constructor", "PDF", 5, {}]) {
    assert.strictEqual(viewerFeatureKey(kind), null, String(kind));
  }
});

await test("every (kind, format) from getExportFormats maps to a FEATURE_KEYS entry", () => {
  const seen = new Set();
  for (const kind of KINDS) {
    const formats = getExportFormats(kind);
    assert.ok(formats.length > 0, `${kind} has export formats`);
    for (const format of formats) {
      const key = exportFeatureKey(kind, format.id);
      assert.ok(typeof key === "string" && FEATURE_KEYS.includes(key), `${kind}/${format.id} -> ${key}`);
      assert.ok(key.startsWith("export_"), key);
      seen.add(key);
    }
  }
  const exportKeys = FEATURE_KEYS.filter((k) => k.startsWith("export_"));
  assert.deepStrictEqual([...seen].sort(), [...exportKeys].sort(), "every export_* key is reachable");
});

await test("exportFeatureKey known values", () => {
  assert.strictEqual(exportFeatureKey("pdf", "txt"), "export_pdf_txt");
  assert.strictEqual(exportFeatureKey("pdf", "png"), "export_pdf_png");
  assert.strictEqual(exportFeatureKey("xlsx", "csv"), "export_xlsx_csv");
  assert.strictEqual(exportFeatureKey("markdown", "html"), "export_md_html");
  assert.strictEqual(exportFeatureKey("text", "html"), "export_txt_html");
  assert.strictEqual(exportFeatureKey("csv", "xlsx"), "export_csv_xlsx");
});

await test("zip outputs count under the chosen format key", () => {
  assert.strictEqual(exportFeatureKey("xlsx", "zip"), "export_xlsx_csv");
  assert.strictEqual(exportFeatureKey("pdf", "zip"), "export_pdf_png");
});

await test("exportFeatureKey returns null for unsupported combinations", () => {
  const bad = [["pdf", "html"], ["docx", "png"], ["csv", "csv"], ["nope", "txt"], ["toString", "txt"],
    ["pdf", "__proto__"], [undefined, undefined], [null, "txt"], ["docx", "zip"]];
  for (const [kind, ext] of bad) assert.strictEqual(exportFeatureKey(kind, ext), null, `${kind}/${ext}`);
});

await test("viewerSurface maps every document kind and both sources to a fixed surface", () => {
  const expected = {
    pdf: { url: "web_pdf", file: "local_pdf" },
    docx: { url: "local_doc", file: "local_doc" }, pptx: { url: "local_doc", file: "local_doc" },
    markdown: { url: "local_doc", file: "local_doc" }, text: { url: "local_doc", file: "local_doc" },
    rtf: { url: "local_doc", file: "local_doc" },
    xlsx: { url: "local_sheet", file: "local_sheet" }, csv: { url: "local_sheet", file: "local_sheet" },
  };
  for (const kind of KINDS) {
    for (const source of ["url", "file"]) assert.strictEqual(viewerSurface(kind, source), expected[kind][source], `${kind}/${source}`);
  }
});

await test("viewerSurface never returns anything but a fixed surface for odd input", () => {
  const odd = [[undefined, undefined], [null, "url"], ["pdf", "https://x.example/a.pdf"], ["pdf", undefined], ["__proto__", "file"], [{}, {}]];
  for (const [kind, source] of odd) {
    assert.ok(SURFACES.includes(viewerSurface(kind, source)), `${String(kind)}/${String(source)}`);
  }
  assert.strictEqual(viewerSurface("pdf", "https://x.example/a.pdf"), "other");
});

await test("pdfSourceKind: http(s) strings are url; bytes, file:, blob: are file", () => {
  assert.strictEqual(pdfSourceKind("https://example.com/a.pdf"), "url");
  assert.strictEqual(pdfSourceKind("HTTP://example.com/a.pdf"), "url");
  for (const v of [new Uint8Array(2), "file:///tmp/a.pdf", "blob:chrome-extension://x/1", "", null, undefined]) {
    assert.strictEqual(pdfSourceKind(v), "file");
  }
});

await test("usageFeatures.js is DOM-free and network-free", () => {
  const src = fs.readFileSync(path.join(rootDir, "src/viewer/usageFeatures.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const re of [/\bdocument\b/, /\bwindow\b/, /\bchrome\b/, /\bfetch\s*\(/, /XMLHttpRequest/, /https?:\/\//]) {
    assert.ok(!re.test(src), `usageFeatures.js must not match ${re}`);
  }
});

await test("usageFeatures.js is in the privacy egress scan list", () => {
  const src = fs.readFileSync(path.join(rootDir, "tests/privacy_security_test.mjs"), "utf8");
  assert.ok(src.includes('"src/viewer/usageFeatures.js"'));
});

// ---- viewer.js wiring ---------------------------------------------------

const viewerSrc = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.js"), "utf8");

function functionBody(name) {
  const start = viewerSrc.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `function ${name} exists`);
  const rest = viewerSrc.slice(start + 1);
  const next = rest.search(/\n(?:async )?function \w+\(/);
  return viewerSrc.slice(start, next < 0 ? undefined : start + 1 + next);
}

function callArgs(src, callee) {
  const out = [];
  const re = new RegExp(`\\b${callee}\\(`, "g");
  let m;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const begin = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    out.push({ index: m.index, args: src.slice(begin, i - 1) });
  }
  return out;
}

await test("viewer.js imports the helpers from usageFeatures.js", () => {
  const m = viewerSrc.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/usageFeatures\.js";/);
  assert.ok(m, "import from ./usageFeatures.js");
  assert.ok(/\bviewerFeatureKey\b/.test(m[1]) && /\bexportFeatureKey\b/.test(m[1]));
});

await test("reportFeature sends only {type, key, surface} inside try/catch and swallows rejections", () => {
  const body = functionBody("reportFeature");
  assert.ok(/^function reportFeature\(key, surface\)/.test(body), "plain (non-async) reportFeature(key, surface)");
  assert.ok(/try\s*\{[\s\S]*chrome\.runtime\.sendMessage\(\{\s*type:\s*"USAGE_FEATURE",\s*key,\s*surface\s*\}\)[\s\S]*\}\s*catch/.test(body));
  assert.ok(/\.catch\(/.test(body), "a returned rejected promise is ignored");
  const sends = viewerSrc.match(/USAGE_FEATURE/g) || [];
  assert.strictEqual(sends.length, 1, "USAGE_FEATURE is sent from exactly one place");
});

await test("reportFeature calls pass only a helper result, never a name or file", () => {
  const calls = callArgs(viewerSrc, "reportFeature").filter((c) => c.args !== "key, surface");
  assert.ok(calls.length >= 5, `expected open + export calls, found ${calls.length}`);
  for (const { args } of calls) {
    assert.ok(/^(viewerFeatureKey|exportFeatureKey)\(/.test(args.trim()), `reportFeature(${args})`);
    const surfaceCalls = callArgs(args, "viewerSurface");
    assert.strictEqual(surfaceCalls.length, 1, `reportFeature(${args}) passes one viewerSurface(...) result`);
    assert.ok(/,\s*viewerSurface\([^]*\)\s*$/.test(args), `reportFeature(${args}): surface is the last argument`);
    assert.ok(!/,\s*(name|url|src|source|file)\s*$/.test(args), `reportFeature(${args}) passes a bare variable`);
    // Quoted literals (the fixed "file" source word) cannot carry data; every identifier is still checked.
    assert.ok(!/\bname\b|\bfile\b|Name\b|\.name\b|size|numPages|pages/.test(args.replace(/"[^"]*"/g, '""')), `reportFeature(${args}) leaks data`);
  }
  assert.ok(!/await\s+reportFeature/.test(viewerSrc), "reportFeature is never awaited");
});

await test("open paths report after success", () => {
  for (const fn of ["openTextDocument", "openOfficeFile", "openSpreadsheetFile"]) {
    const body = functionBody(fn);
    const reports = callArgs(body, "reportFeature");
    assert.ok(reports.length >= 1, `${fn} reports`);
    for (const r of reports) {
      const before = body.slice(0, r.index);
      const lastExport = before.lastIndexOf("setExportSource(");
      assert.ok(lastExport >= 0, `${fn} reports after setExportSource`);
      assert.ok(!/\breturn\b/.test(before.slice(lastExport)), `${fn}: no early return between success and report`);
    }
  }
  const office = functionBody("openOfficeFile");
  assert.ok(/reportFeature\(viewerFeatureKey\("docx"\), viewerSurface\("docx", "file"\)\)/.test(office));
  assert.ok(/reportFeature\(viewerFeatureKey\("pptx"\), viewerSurface\("pptx", "file"\)\)/.test(office));
});

await test("PDF open counts only from file-open entry points, not re-renders", () => {
  const pdf = functionBody("openPdf");
  const report = pdf.search(/reportFeature\(viewerFeatureKey\("pdf"\), viewerSurface\("pdf", pdfSourceKind\(source\)\)\)/);
  assert.ok(report >= 0, "openPdf reports viewer_pdf");
  assert.ok(report > pdf.indexOf("currentPdf = pdf"), "reported only after the PDF loaded");
  assert.ok(report < pdf.indexOf("catch (error)"), "not reported from the failure path");
  assert.ok(/if\s*\(countOpen\)\s*reportFeature/.test(pdf), "gated by countOpen");
  for (const fn of ["loadInitialDocument", "openLocalFile"]) {
    const calls = callArgs(functionBody(fn), "openPdf");
    assert.ok(calls.length >= 1, `${fn} opens PDFs`);
    for (const c of calls) assert.ok(/countOpen:\s*true/.test(c.args), `${fn}: openPdf(${c.args})`);
  }
  for (const fn of ["persistCurrentSettingsAndRerenderPdf", "debouncedPersistAndRerenderPdf"]) {
    const body = functionBody(fn);
    for (const c of callArgs(body, "openPdf")) assert.ok(!/countOpen/.test(c.args), `${fn} must not count an open`);
    assert.ok(!/reportFeature/.test(body), `${fn} must not report`);
  }
});

await test("re-render and conversion helpers never report", () => {
  for (const fn of ["rerenderSpreadsheet", "convertAndDownload", "exportPdfPages", "downloadBlob", "downloadExport", "openPdfFallback"]) {
    assert.ok(!/reportFeature/.test(functionBody(fn)), `${fn} must not report`);
  }
});

await test("runExport reports only after a successful, non-stale download", () => {
  const body = functionBody("runExport");
  const m = body.match(/reportFeature\(exportFeatureKey\(source\.kind,\s*formatId\),\s*viewerSurface\(source\.kind,\s*pdfSourceKind\(currentPdfSource\)\)\)/);
  assert.ok(m, "runExport reports exportFeatureKey(source.kind, formatId) with the document's own surface");
  const at = body.indexOf(m[0]);
  assert.ok(at > body.indexOf("if (currentExport !== source) return;"), "after the stale check");
  assert.ok(at > body.indexOf("if (done)"), "inside the done branch");
  assert.ok(at < body.indexOf("catch (error)"), "not in the failure path");
  assert.strictEqual(callArgs(body, "reportFeature").length, 1);
});

await test("viewer.js still has no .innerHTML", () => {
  assert.ok(!/\.innerHTML/.test(viewerSrc));
});

await test("viewer.js imports viewerSurface and pdfSourceKind and has no other surface source", () => {
  const m = viewerSrc.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/usageFeatures\.js";/);
  assert.ok(/\bviewerSurface\b/.test(m[1]) && /\bpdfSourceKind\b/.test(m[1]));
  assert.ok(!/surfaceFor/.test(viewerSrc), "viewer.js goes through viewerSurface only");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
