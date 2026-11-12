// tests/pdftools_metadata_test.mjs - strip metadata (Info dict, XMP) and inspect it
import assert from "assert";
import zlib from "zlib";
import { PDFDocument, PDFName, PDFString } from "../src/viewer/vendor/pdf-lib.min.mjs";
import { stripMetadata, inspectMetadata } from "../src/viewer/pdftools/stripMetadata.js";
import { PDF_MIME } from "../src/viewer/pdftools/result.js";

const SECRETS = ["Jane Q Secret", "Quarterly Confidential", "SubjectSecret", "kw-secret", "CreatorApp-Secret", "ProducerApp-Secret", "CustomSecretValue", "XmpSecretCreator"];
// pdf-lib writes text strings as UTF-16BE hex (<FEFF...>), so check plain, hex and UTF-16 forms.
function has(bytes, s) {
  const buf = Buffer.from(bytes);
  let text = buf.toString("latin1");
  // Object streams are Flate-compressed: inflate every stream body and scan that too.
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(text))) {
    const end = text.indexOf("endstream", re.lastIndex);
    if (end < 0) break;
    try { text += "\n" + zlib.inflateSync(buf.subarray(re.lastIndex, end)).toString("latin1"); } catch {}
  }
  const hex = Buffer.from("\ufeff" + s, "utf16le").swap16().toString("hex").toUpperCase();
  const hex8 = Buffer.from(s).toString("hex").toUpperCase();
  const up = text.toUpperCase();
  return text.includes(s) || up.includes(hex) || up.includes(hex8);
}

async function fixture({ objectStreams = false, name = "doc.pdf" } = {}) {
  const d = await PDFDocument.create({ updateMetadata: false });
  d.addPage([300, 400]); d.addPage([300, 400]);
  d.setTitle("Quarterly Confidential"); d.setAuthor("Jane Q Secret"); d.setSubject("SubjectSecret");
  d.setKeywords(["kw-secret"]); d.setCreator("CreatorApp-Secret"); d.setProducer("ProducerApp-Secret");
  d.setCreationDate(new Date("2020-01-02T03:04:05Z")); d.setModificationDate(new Date("2021-02-03T04:05:06Z"));
  d.getInfoDict().set(PDFName.of("MyCustomKey"), PDFString.of("CustomSecretValue"));
  const xmp = `<?xpacket begin=''?><x:xmpmeta xmlns:x='adobe:ns:meta/'><dc:creator>XmpSecretCreator</dc:creator></x:xmpmeta>`;
  const stream = d.context.stream(Buffer.from(xmp), { Type: "Metadata", Subtype: "XML" });
  d.catalog.set(PDFName.of("Metadata"), d.context.register(stream));
  return { name, bytes: await d.save({ useObjectStreams: objectStreams, updateFieldAppearances: false }) };
}

for (const objectStreams of [false, true]) {
  const src = await fixture({ objectStreams, name: "report.pdf" });
  const before = Buffer.from(src.bytes).toString("hex");
  for (const s of SECRETS) assert.ok(has(src.bytes, s), `fixture holds ${s}`);

  const found = await inspectMetadata(src.bytes);
  const map = Object.fromEntries(found.map((f) => [f.field, f.value]));
  assert.strictEqual(map.Author, "Jane Q Secret");
  assert.strictEqual(map.Title, "Quarterly Confidential");
  assert.strictEqual(map.MyCustomKey, "CustomSecretValue");
  assert.ok(map.CreationDate && map.ModDate && map.Producer && map.Creator && map.Keywords && map.Subject);
  assert.ok(map.XMP && /present/i.test(map.XMP), "XMP presence reported");
  assert.ok(!found.some((f) => f.value.includes("XmpSecretCreator")), "XMP body is summarised, not dumped");

  const r = await stripMetadata(src);
  assert.strictEqual(Buffer.from(src.bytes).toString("hex"), before, "input not mutated");
  assert.strictEqual(r.files.length, 1);
  assert.strictEqual(r.files[0].name, "report-clean.pdf");
  assert.strictEqual(r.files[0].mime, PDF_MIME);
  const out = r.files[0].bytes;
  for (const s of SECRETS) assert.ok(!has(out, s), `${s} must not survive (objectStreams=${objectStreams})`);
  for (const k of ["/Author", "/Title", "/Producer", "/Creator", "/CreationDate", "/ModDate", "/MyCustomKey", "/Metadata", "pdf-lib"]) {
    assert.ok(!has(out, k), `${k} must not appear in output`);
  }
  assert.deepStrictEqual(await inspectMetadata(out), [], "nothing left to inspect");
  const re = await PDFDocument.load(out, { updateMetadata: false });
  assert.strictEqual(re.getPageCount(), 2, "pages kept");
  assert.strictEqual(re.getAuthor(), undefined);
  assert.strictEqual(re.getTitle(), undefined);
}

// A PDF with no metadata: nothing found, still works, no Producer/ModDate added.
{
  const d = await PDFDocument.create({ updateMetadata: false });
  d.addPage([100, 100]);
  const bytes = await d.save();
  assert.deepStrictEqual(await inspectMetadata(bytes), []);
  const r = await stripMetadata({ name: "a.pdf", bytes });
  assert.deepStrictEqual(await inspectMetadata(r.files[0].bytes), []);
}

// Default pdf-lib creation stamps Producer/Creator/dates; they are found and removed.
{
  const d = await PDFDocument.create();
  d.addPage([100, 100]);
  const bytes = await d.save();
  const fields = (await inspectMetadata(bytes)).map((f) => f.field);
  assert.ok(fields.includes("Producer") && fields.includes("ModDate"));
  const r = await stripMetadata({ name: "a.pdf", bytes });
  assert.deepStrictEqual(await inspectMetadata(r.files[0].bytes), []);
  assert.ok(!has(r.files[0].bytes, "pdf-lib"));
}

await assert.rejects(() => stripMetadata({ name: "bad.pdf", bytes: new Uint8Array([1, 2, 3]) }), (e) => e instanceof Error && /bad\.pdf/.test(e.message));
await assert.rejects(() => inspectMetadata(new Uint8Array([1, 2, 3])), (e) => e instanceof Error);
console.log("pdftools_metadata_test passed");
