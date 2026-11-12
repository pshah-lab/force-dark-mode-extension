// tests/pdftools_stamp_test.mjs - page numbers and watermark
import assert from "assert";
import zlib from "zlib";
import { PDFDocument, PDFName, PDFRawStream, PDFArray } from "../src/viewer/vendor/pdf-lib.min.mjs";
import { addPageNumbers, addWatermark } from "../src/viewer/pdftools/stampTools.js";
import { PDF_MIME } from "../src/viewer/pdftools/result.js";

async function fixture(n, name = "doc.pdf") {
  const d = await PDFDocument.create();
  for (let i = 1; i <= n; i++) d.addPage([300, 400]);
  return { name, bytes: await d.save() };
}
// Decoded content of a page: inflate streams, and decode <hex> strings to text.
function content(doc, idx) {
  const page = doc.getPage(idx);
  let c = page.node.Contents();
  if (!c) return "";
  const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
  let s = "";
  for (const st of streams) {
    const bytes = st.getContents();
    let buf = Buffer.from(bytes);
    try { buf = zlib.inflateSync(buf); } catch {}
    s += buf.toString("latin1") + "\n";
  }
  return s.replace(/<([0-9A-Fa-f]+)>/g, (_, h) => "(" + Buffer.from(h, "hex").toString("latin1") + ")");
}
async function total(file, idx) { return content(await PDFDocument.load(file.bytes), idx).length; }
const rejects = (fn, re) => assert.rejects(fn, (e) => e instanceof Error && re.test(e.message));

const src = await fixture(3, "report.pdf");
const before = Buffer.from(src.bytes).toString("hex");

let r = await addPageNumbers(src, { position: "bottom-center", startAt: 1, format: "n-of-total" });
assert.strictEqual(r.files[0].name, "report-numbered.pdf");
assert.strictEqual(r.files[0].mime, PDF_MIME);
let out = await PDFDocument.load(r.files[0].bytes);
assert.strictEqual(out.getPageCount(), 3, "page count unchanged");
const orig = await PDFDocument.load(src.bytes);
assert.ok(content(out, 1).length > content(orig, 1).length, "content stream grows");
assert.ok(content(out, 1).includes("(2 of 3)"), "page 2 says 2 of 3");
assert.strictEqual(Buffer.from(src.bytes).toString("hex"), before, "input bytes untouched");

r = await addPageNumbers(src, { position: "top-right", startAt: 5, format: "n" });
out = await PDFDocument.load(r.files[0].bytes);
assert.ok(content(out, 0).includes("(5)") && content(out, 2).includes("(7)"), "startAt honoured");
r = await addPageNumbers(src, { position: "top-center", startAt: 5, format: "n-of-total" });
out = await PDFDocument.load(r.files[0].bytes);
assert.ok(content(out, 0).includes("(5 of 7)"), "n-of-total with startAt");
await rejects(() => addPageNumbers(src, { position: "middle", startAt: 1, format: "n" }), /position/i);
await rejects(() => addPageNumbers(src, { position: "bottom-right", startAt: 0, format: "n" }), /start/i);
await rejects(() => addPageNumbers(src, { position: "bottom-right", startAt: 1.5, format: "n" }), /start/i);
await rejects(() => addPageNumbers(src, { position: "bottom-right", startAt: 1, format: "roman" }), /format/i);
await rejects(() => addPageNumbers(src, { position: "bottom-right", startAt: 1, format: "n", size: -3 }), /size/i);
await rejects(() => addPageNumbers({ name: "x.pdf", bytes: new Uint8Array([1, 2, 3]) }, { position: "bottom-right", startAt: 1, format: "n" }), /could not be read/i);

// watermark
r = await addWatermark(src, { text: "DRAFT", opacity: 0.4, size: 40, diagonal: true });
assert.strictEqual(r.files[0].name, "report-watermarked.pdf");
assert.deepStrictEqual(r.warnings, []);
out = await PDFDocument.load(r.files[0].bytes);
assert.strictEqual(out.getPageCount(), 3);
for (let i = 0; i < 3; i++) assert.ok(content(out, i).includes("(DRAFT)"), "watermark on page " + (i + 1));
assert.ok(await total(r.files[0], 0) > content(orig, 0).length);

r = await addWatermark(src, { text: "ONLY", opacity: 0.4, size: 40, diagonal: false, pages: "2" });
out = await PDFDocument.load(r.files[0].bytes);
assert.ok(!content(out, 0).includes("(ONLY)") && content(out, 1).includes("(ONLY)") && !content(out, 2).includes("(ONLY)"), "pages range");
await rejects(() => addWatermark(src, { text: "X", opacity: 0.4, size: 40, diagonal: false, pages: "9" }), /outside/i);

for (const text of ["नमस्ते", "你好", "😀 hi"]) {
  r = await addWatermark(src, { text, opacity: 0.5, size: 30, diagonal: true });
  assert.strictEqual(r.warnings.length, 1, "warning for " + text);
  assert.ok(/replaced/i.test(r.warnings[0]));
  out = await PDFDocument.load(r.files[0].bytes);
  assert.strictEqual(out.getPageCount(), 3, "valid pdf");
}
r = await addWatermark(src, { text: "😀 hi", opacity: 0.5, size: 30, diagonal: false });
assert.ok(content(await PDFDocument.load(r.files[0].bytes), 0).includes("(? hi)"), "emoji replaced by one ?");

// opacity clamp
async function opacities(o) {
  const res = await addWatermark(src, { text: "A", opacity: o, size: 30, diagonal: false });
  const d = await PDFDocument.load(res.files[0].bytes);
  const gs = [];
  const ext = d.getPage(0).node.Resources().lookup(PDFName.of("ExtGState"));
  for (const [, ref] of ext.entries()) gs.push(d.context.lookup(ref).get(PDFName.of("ca")).asNumber());
  return gs;
}
assert.deepStrictEqual(await opacities(0), [0.05], "low clamp");
assert.deepStrictEqual(await opacities(5), [1], "high clamp");
await rejects(() => addWatermark(src, { text: "A", opacity: NaN, size: 30, diagonal: false }), /opacity/i);
await rejects(() => addWatermark(src, { text: "   ", opacity: 0.5, size: 30, diagonal: false }), /text/i);
await rejects(() => addWatermark(src, { text: "A", opacity: 0.5, size: 0, diagonal: false }), /size/i);
assert.strictEqual(Buffer.from(src.bytes).toString("hex"), before, "input untouched");
console.log("pdftools_stamp_test passed");
