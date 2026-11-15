// tests/pdftools_compress_test.mjs - offline PDF compression: Flate for raw streams, object streams, optional image re-encode
import assert from "assert";
import { PDFDocument, PDFName, PDFRawStream } from "../src/viewer/vendor/pdf-lib.min.mjs";
import { compressPdf } from "../src/viewer/pdftools/compressTools.js";

const JPG = new Uint8Array(Buffer.from("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z", "base64"));

// A PDF whose page content and an embedded font-like stream are stored raw (no Filter) and repetitive.
async function bloated(pages = 6) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = d.addPage([300, 300]);
    p.drawText("Compress me ".repeat(5), { x: 10, y: 100 });
  }
  const raw = d.context.stream("A".repeat(60000) + " repeated data ".repeat(2000));
  d.catalog.set(PDFName.of("Blob"), d.context.register(raw));
  d.setTitle("Has a title"); d.setAuthor("Someone");
  return { name: "big.pdf", bytes: await d.save({ useObjectStreams: false }) };
}

const big = await bloated();
const out = await compressPdf(big, {});
const small = out.files[0];
assert.strictEqual(small.name, "big-compressed.pdf");
assert.ok(small.bytes.length < big.bytes.length * 0.5, `expected >50% smaller, got ${small.bytes.length} of ${big.bytes.length}`);
assert.strictEqual((await PDFDocument.load(small.bytes)).getPageCount(), 6, "still a valid 6-page PDF");
assert.ok(out.notes.some((w) => /Reduced .* by \d+%/.test(w)), "reports the saving");

// Metadata removal option
const stripped = await compressPdf(big, { removeMetadata: true });
const sd = await PDFDocument.load(stripped.files[0].bytes, { updateMetadata: false });
assert.strictEqual(sd.getTitle() || "", "");
assert.strictEqual(sd.getAuthor() || "", "");
const kept = await PDFDocument.load(small.bytes, { updateMetadata: false });
assert.strictEqual(kept.getTitle(), "Has a title", "metadata kept by default");

// Nothing to gain: the original bytes come back unchanged with an honest warning
const again = await compressPdf({ name: "big-compressed.pdf", bytes: small.bytes }, {});
assert.deepStrictEqual([...again.files[0].bytes], [...small.bytes], "no growth: original returned");
assert.ok(again.notes.some((w) => /already|no (size )?reduction|could not be made smaller/i.test(w)), "says it could not shrink");
assert.strictEqual(again.files[0].name, "big-compressed-compressed.pdf");

// Image recompression is injected (needs a canvas in the browser): called only for 8-bit RGB/Gray DCT images
const d = await PDFDocument.create();
const img = await d.embedJpg(JPG);
d.addPage([100, 100]).drawImage(img, { x: 0, y: 0, width: 50, height: 50 });
const withImage = { name: "img.pdf", bytes: await d.save() };
let calls = 0;
const fake = async (bytes, info) => {
  calls++;
  assert.ok(info.width >= 1 && info.height >= 1 && typeof info.quality === "number");
  return null; // "no smaller version"
};
await compressPdf(withImage, { imageQuality: "medium" }, { recompressJpeg: fake });
assert.strictEqual(calls, 1, "recompress hook called once for the JPEG");
calls = 0;
await compressPdf(withImage, { imageQuality: "none" }, { recompressJpeg: fake });
assert.strictEqual(calls, 0, "not called when image quality is left alone");

const replaced = await compressPdf(withImage, { imageQuality: "low" }, {
  recompressJpeg: async () => ({ bytes: JPG.slice(0, JPG.length), width: 1, height: 1 }),
});
assert.strictEqual((await PDFDocument.load(replaced.files[0].bytes)).getPageCount(), 1);

await assert.rejects(() => compressPdf({ name: "x.pdf", bytes: new Uint8Array([1, 2, 3]) }, {}), /could not be read/);
console.log("pdftools_compress_test: all passed");
