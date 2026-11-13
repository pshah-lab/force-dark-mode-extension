// tests/surface_test.mjs
// surfaceFor is the only place a URL is read for the usage report. It must return one of the 9 fixed surface
// strings and never anything derived from its input.
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import "../src/shared/surface.js";
import { SURFACES as REPORT_SURFACES } from "../src/shared/usageReport.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

const EXPECTED = ["google_docs", "google_sheets", "google_slides", "web_pdf", "local_pdf", "local_sheet", "local_doc", "web_other", "other"];
const { SURFACES, surfaceFor } = globalThis.SurfaceKind || {};

test("ES-module import sets the SurfaceKind global", () => {
  assert.ok(globalThis.SurfaceKind, "SurfaceKind global");
  assert.strictEqual(typeof surfaceFor, "function");
});

test("SURFACES is the exact 9-value list, in order", () => {
  assert.deepStrictEqual([...SURFACES], EXPECTED);
  assert.ok(Object.isFrozen(SURFACES));
  for (const s of SURFACES) {
    assert.match(s, /^[a-z0-9_]+$/);
    assert.ok(!s.includes("__"), s);
  }
});

test("usageReport re-exports the same SURFACES (one implementation)", () => {
  assert.strictEqual(REPORT_SURFACES, SURFACES);
});

test("loads as a classic script (popup <script> tag) and sets SurfaceKind", () => {
  const sandbox = { URL };
  vm.runInNewContext(read("src/shared/surface.js"), sandbox);
  assert.ok(sandbox.SurfaceKind, "global SurfaceKind in a classic script");
  assert.deepStrictEqual([...sandbox.SurfaceKind.SURFACES], EXPECTED);
  assert.strictEqual(sandbox.SurfaceKind.surfaceFor("https://docs.google.com/document/d/x/edit"), "google_docs");
});

test("surface.js has no ES export syntax (must parse as a classic script)", () => {
  const src = read("src/shared/surface.js");
  assert.ok(!/^\s*export\s/m.test(src), "no export statements");
  assert.ok(!/^\s*import\s/m.test(src), "no import statements");
});

// The Review Focus URL list, verbatim, with expected categories.
const URL_CASES = [
  ["https://docs.google.com/document/d/SECRET_ID/edit?x=1#h", "google_docs"],
  ["https://docs.google.com.evil.com/document/d/x", "web_other"],
  ["https://evil.com/docs.google.com/document/", "web_other"],
  ["https://docs.google.com@evil.com/document/", "web_other"],
  ["http://docs.google.com/document/d/x", "web_other"],
  ["https://docs.google.com/", "web_other"],
  ["https://docs.google.com/forms/d/x", "web_other"],
  ["", "other"],
  [null, "other"],
  [42, "other"],
  ["javascript:alert(1)", "other"],
  ["chrome-extension://abcdefghijklmnop/src/viewer/viewer.html", "other"],
];

test("Review Focus URL list gives the right category", () => {
  for (const [input, want] of URL_CASES) assert.strictEqual(surfaceFor(input), want, String(input));
});

test("Google Docs, Sheets and Slides by first path segment only", () => {
  const cases = [
    ["https://docs.google.com/document/d/abc/edit", "google_docs"],
    ["https://docs.google.com/spreadsheets/d/abc/edit#gid=0", "google_sheets"],
    ["https://docs.google.com/presentation/d/abc/edit", "google_slides"],
    ["https://DOCS.GOOGLE.COM/document/d/abc", "google_docs"],
    ["https://docs.google.com:443/document/d/abc", "google_docs"],
    ["https://docs.google.com/document", "google_docs"],
    ["https://docs.google.com/a/example.com/document/d/abc", "web_other"],
    ["https://docs.google.com/x/document/d/abc", "web_other"],
    ["https://docs.google.com/Document/d/abc", "web_other"],
    ["https://docs.google.com/documents/d/abc", "web_other"],
    ["https://docs.google.com?document", "web_other"],
    ["https://docs.google.com/#/document", "web_other"],
    ["https://user:pw@docs.google.com/document/d/abc", "web_other"],
    ["https://user@docs.google.com/document/d/abc", "web_other"],
    ["https://docs.google.com./document/d/abc", "web_other"],
    ["https://sheets.google.com/spreadsheets/d/abc", "web_other"],
    ["https://drive.google.com/document/d/abc", "web_other"],
  ];
  for (const [input, want] of cases) assert.strictEqual(surfaceFor(input), want, input);
});

test("other http(s) URLs are web_other; other schemes and junk are other", () => {
  const cases = [
    ["https://example.com/", "web_other"],
    ["http://example.com/a.pdf", "web_other"],
    ["https://bbc.co.uk/news?x=1", "web_other"],
    ["file:///Users/me/secret.pdf", "other"],
    ["chrome://settings", "other"],
    ["about:blank", "other"],
    ["data:text/html,hi", "other"],
    ["ftp://example.com/x", "other"],
    ["not a url", "other"],
    ["docs.google.com/document/d/x", "other"],
    ["//docs.google.com/document/d/x", "other"],
    ["   ", "other"],
  ];
  for (const [input, want] of cases) assert.strictEqual(surfaceFor(input), want, input);
});

test("non-string, non-descriptor inputs give other", () => {
  const bad = [undefined, null, 0, 42, NaN, true, false, [], ["https://docs.google.com/document/d/x"], () => "x",
    Symbol("x"), new URL("https://docs.google.com/document/d/x"), {}, { kind: 5 }, { href: "https://docs.google.com/document/d/x" }];
  for (const b of bad) assert.strictEqual(surfaceFor(b), "other", String(typeof b));
  assert.strictEqual(surfaceFor(), "other");
});

test("viewer descriptors map kind/source to surfaces", () => {
  const cases = [
    [{ kind: "pdf", source: "url" }, "web_pdf"],
    [{ kind: "pdf", source: "file" }, "local_pdf"],
    [{ kind: "pdf" }, "other"],
    [{ kind: "pdf", source: "nope" }, "other"],
    [{ kind: "xlsx" }, "local_sheet"],
    [{ kind: "csv", source: "file" }, "local_sheet"],
    [{ kind: "docx" }, "local_doc"],
    [{ kind: "pptx" }, "local_doc"],
    [{ kind: "md" }, "local_doc"],
    [{ kind: "txt" }, "local_doc"],
    [{ kind: "rtf" }, "local_doc"],
    [{ kind: "PDF", source: "url" }, "other"],
    [{ kind: "html" }, "other"],
    [{ kind: "" }, "other"],
    [{ kind: "__proto__" }, "other"],
    [{ kind: "constructor" }, "other"],
    [{ kind: "toString" }, "other"],
    [{ kind: ["pdf"], source: "url" }, "other"],
  ];
  for (const [input, want] of cases) assert.strictEqual(surfaceFor(input), want, JSON.stringify(input));
});

test("the return value is always a member of SURFACES and never echoes the input", () => {
  const inputs = [
    ...URL_CASES.map(([u]) => u),
    "https://docs.google.com/document/d/SECRET_ID/edit",
    "https://SECRET.example.com/SECRET",
    "https://docs.google.com/SECRET/d/x",
    { kind: "SECRET", source: "SECRET" },
    { kind: "pdf", source: "SECRET" },
    "SECRET",
    undefined,
  ];
  for (const i of inputs) {
    const out = surfaceFor(i);
    assert.ok(EXPECTED.includes(out), `${String(i)} -> ${out}`);
    assert.ok(!String(out).includes("SECRET"));
    assert.ok(!String(out).includes("example"));
  }
});

console.log("\nSurface classification");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
