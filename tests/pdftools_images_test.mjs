// tests/pdftools_images_test.mjs - images to PDF (JPG/PNG by magic bytes)
import assert from "assert";
import { PDFDocument } from "../src/viewer/vendor/pdf-lib.min.mjs";
import { imagesToPdf } from "../src/viewer/pdftools/imagesToPdf.js";
import { PDF_MIME } from "../src/viewer/pdftools/result.js";

const b64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
const PNG = b64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC");
const JPG = b64("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z");
const sizes = async (file) => (await PDFDocument.load(file.bytes)).getPages().map((p) => [p.getWidth(), p.getHeight()]);

// 2 images -> 2 pages, "fit" = image size (1x1)
const imgs = [{ name: "a.png", bytes: PNG }, { name: "b.jpg", bytes: JPG }];
const before = [PNG.slice(), JPG.slice()];
let r = await imagesToPdf(imgs, { pageSize: "fit" });
assert.strictEqual(r.files.length, 1);
assert.strictEqual(r.files[0].name, "images.pdf");
assert.strictEqual(r.files[0].mime, PDF_MIME);
assert.deepStrictEqual(r.warnings, []);
assert.deepStrictEqual(await sizes(r.files[0]), [[1, 1], [1, 1]]);
assert.deepStrictEqual([...PNG], [...before[0]], "input not mutated");
assert.deepStrictEqual([...JPG], [...before[1]], "input not mutated");

// a4 / letter
r = await imagesToPdf(imgs, { pageSize: "a4" });
assert.deepStrictEqual(await sizes(r.files[0]), [[595, 842], [595, 842]]);
r = await imagesToPdf(imgs, { pageSize: "letter" });
assert.deepStrictEqual(await sizes(r.files[0]), [[612, 792], [612, 792]]);

// text file skipped with warning naming it; corrupt PNG too
const enc = new TextEncoder();
r = await imagesToPdf([{ name: "a.png", bytes: PNG }, { name: "notes.txt", bytes: enc.encode("hello") }, { name: "bad.png", bytes: PNG.slice(0, 20) }], { pageSize: "fit" });
assert.strictEqual((await sizes(r.files[0])).length, 1);
assert.strictEqual(r.warnings.length, 2);
assert.ok(/notes\.txt/.test(r.warnings[0]));
assert.ok(/bad\.png/.test(r.warnings[1]));

// all bad / empty throws
await assert.rejects(() => imagesToPdf([{ name: "x.txt", bytes: enc.encode("no") }], { pageSize: "fit" }), (e) => e instanceof Error && /No usable images/.test(e.message));
await assert.rejects(() => imagesToPdf([], { pageSize: "fit" }), (e) => e instanceof Error && /Add at least one image/.test(e.message));

// Regression: truncated / oversized PNGs must be skipped fast (embedPng can hang on truncated IDAT)
import zlib from "zlib";
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function makePng(w, h, rawRows) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rawRows)), chunk("IEND", Buffer.alloc(0))]));
}
const rows = Buffer.alloc(64 * (1 + 64 * 3));
let seed = 12345;
for (let i = 0; i < rows.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; rows[i] = seed >>> 24; }
for (let y = 0; y < 64; y++) rows[y * (1 + 192)] = 0;
const BIG = makePng(64, 64, rows);
assert.ok(BIG.length > 4000, "fixture is multi-KB");
let t0 = Date.now();
r = await imagesToPdf([{ name: "big.png", bytes: BIG }], { pageSize: "fit" });
assert.deepStrictEqual(await sizes(r.files[0]), [[64, 64]]);
for (const [label, len] of [["400", 400], ["half", BIG.length >> 1]]) {
  t0 = Date.now();
  r = await imagesToPdf([{ name: "ok.png", bytes: PNG }, { name: `cut-${label}.png`, bytes: BIG.slice(0, len) }], { pageSize: "fit" });
  assert.ok(Date.now() - t0 < 2000, "truncated PNG must not hang");
  assert.strictEqual((await sizes(r.files[0])).length, 1);
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(new RegExp(`cut-${label}\\.png`).test(r.warnings[0]));
}
// oversized dimensions skipped
const huge = makePng(100000, 1, Buffer.alloc(1 + 300000));
r = await imagesToPdf([{ name: "ok.png", bytes: PNG }, { name: "huge.png", bytes: huge }], { pageSize: "fit" });
assert.strictEqual((await sizes(r.files[0])).length, 1);
assert.ok(/huge\.png/.test(r.warnings[0]));

console.log("pdftools_images_test: all passed");
