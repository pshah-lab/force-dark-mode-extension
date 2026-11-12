// tests/pdftools_pages_test.mjs - page-structure PDF tools (merge, extract, remove, split, reorder, rotate)
import assert from "assert";
import { PDFDocument, PDFName } from "../src/viewer/vendor/pdf-lib.min.mjs";
import { loadPdf } from "../src/viewer/pdftools/loadPdf.js";
import { mergePdfs, extractPages, removePages, splitPdf, reorderPages, rotatePages } from "../src/viewer/pdftools/pageTools.js";
import { PDF_MIME } from "../src/viewer/pdftools/result.js";

// Page n has width 100 + n so identity is checkable.
async function fixture(n, name = "doc.pdf") {
  const d = await PDFDocument.create();
  for (let i = 1; i <= n; i++) d.addPage([100 + i, 200]);
  return { name, bytes: await d.save() };
}
async function widths(file) {
  const d = await PDFDocument.load(file.bytes);
  return d.getPages().map((p) => p.getWidth());
}
const rejects = async (fn, re, msg) => {
  await assert.rejects(fn, (e) => e instanceof Error && re.test(e.message), msg);
};

// merge
const a = await fixture(2, "a.pdf");
const b = await fixture(3, "b.pdf");
let r = await mergePdfs([a, b]);
assert.strictEqual(r.files.length, 1);
assert.strictEqual(r.files[0].name, "merged.pdf");
assert.strictEqual(r.files[0].mime, PDF_MIME);
assert.deepStrictEqual(await widths(r.files[0]), [101, 102, 101, 102, 103], "merge order");
await rejects(() => mergePdfs([]), /at least/i, "merge needs input");

// extract
const d5 = await fixture(5, "report.pdf");
r = await extractPages(d5, "4,2-3");
assert.deepStrictEqual(await widths(r.files[0]), [104, 102, 103], "extract order");
assert.strictEqual(r.files[0].name, "report-extract.pdf");

// remove
r = await removePages(d5, "2,4");
assert.deepStrictEqual(await widths(r.files[0]), [101, 103, 105], "remove");
await rejects(() => removePages(d5, "1-5"), /all|every|remove/i, "remove all throws");
await rejects(() => removePages(d5, "9"), /outside/i, "remove out of range");

// split
r = await splitPdf(d5, "1-2,5");
assert.deepStrictEqual(r.files.map((f) => f.name), ["report-part-1.pdf", "report-part-2.pdf"]);
assert.deepStrictEqual(await widths(r.files[0]), [101, 102]);
assert.deepStrictEqual(await widths(r.files[1]), [105]);
r = await splitPdf(d5, "");
assert.strictEqual(r.files.length, 5, "empty = every page");

// reorder
const d3 = await fixture(3, "x.pdf");
r = await reorderPages(d3, "3,1,2");
assert.deepStrictEqual(await widths(r.files[0]), [103, 101, 102], "reorder");

// rotate
const rot = await rotatePages(d3, "1,3", 90);
let doc = await PDFDocument.load(rot.files[0].bytes);
assert.deepStrictEqual(doc.getPages().map((p) => p.getRotation().angle), [90, 0, 90]);
const rot2 = await rotatePages(rot.files[0], "1", 270);
doc = await PDFDocument.load(rot2.files[0].bytes);
assert.deepStrictEqual(doc.getPages().map((p) => p.getRotation().angle), [0, 0, 90], "adds to existing, wraps 360");
await rejects(() => rotatePages(d3, "1", 45), /90|180|270/, "bad angle");

// corrupt and encrypted
await rejects(() => loadPdf(new Uint8Array([1, 2, 3, 4]), "junk.pdf"), /junk\.pdf/, "garbage names file");
const enc = await PDFDocument.create();
enc.addPage();
enc.context.trailerInfo.Encrypt = enc.context.register(enc.context.obj({ Filter: PDFName.of("Standard") }));
const encBytes = await enc.save();
await rejects(() => loadPdf(encBytes, "locked.pdf"), /locked\.pdf.*(encrypt|password)/i, "encrypted names file");
await rejects(() => extractPages({ name: "locked.pdf", bytes: encBytes }, "1"), /locked\.pdf/, "tools surface it");

console.log("pdftools_pages_test: OK");
