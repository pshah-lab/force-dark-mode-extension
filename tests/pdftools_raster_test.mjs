// tests/pdftools_raster_test.mjs - converted page JPEGs -> PDF
import assert from "assert";
import { PDFDocument, PDFName } from "../src/viewer/vendor/pdf-lib.min.mjs";
import { rasterToPdf } from "../src/viewer/pdftools/rasterExport.js";
import { PDF_MIME } from "../src/viewer/pdftools/result.js";
import { MAX_PNG_PAGES } from "../src/viewer/convert/pdfExport.js";

const b64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
// 1x1 JPEG (same fixture as pdftools_images_test) and a 3x2 JPEG.
const JPG1 = b64("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z");
const JPG2 = b64("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAA6ADAAQAAAABAAAAAgAAAAD/wAARCAACAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwAbGxsbGxsvGxsvQi8vL0JZQkJCQllwWVlZWVlwiHBwcHBwcIiIiIiIiIiIo6Ojo6Ojvr6+vr7V1dXV1dXV1dXV/9sAQwEhIyM2MjZdMjJd35d8l9/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f/90ABAAB/9oADAMBAAIRAxEAPwChRRRXKe+f/9k=");
const sizes = async (file) => (await PDFDocument.load(file.bytes)).getPages().map((p) => [p.getWidth(), p.getHeight()]);
const rejects = (fn, re) => assert.rejects(fn, (e) => e instanceof Error && re.test(e.message));

assert.strictEqual(MAX_PNG_PAGES, 50);

// 2 JPEGs -> 2 pages at the requested point sizes (not the pixel sizes)
const pages = [
  { width: 612, height: 792, jpegBytes: JPG1 },
  { width: 300.5, height: 400, jpegBytes: JPG2 },
];
const before = [JPG1.slice(), JPG2.slice()];
let r = await rasterToPdf(pages);
assert.strictEqual(r.files.length, 1);
assert.strictEqual(r.files[0].mime, PDF_MIME);
assert.match(r.files[0].name, /\.pdf$/);
assert.deepStrictEqual(r.warnings, []);
assert.deepStrictEqual(await sizes(r.files[0]), [[612, 792], [300.5, 400]]);
assert.deepStrictEqual([...JPG1], [...before[0]], "input not mutated");
assert.deepStrictEqual([...JPG2], [...before[1]], "input not mutated");
assert.strictEqual(pages.length, 2, "pages array not mutated");

// one image XObject per page
const doc = await PDFDocument.load(r.files[0].bytes);
const xobjs = doc.getPage(1).node.Resources().lookup(PDFName.of("XObject"));
assert.ok(xobjs && xobjs.keys().length === 1, "one image on the page");

// 51 pages -> first 50 plus a truncation warning
const many = Array.from({ length: 51 }, (_, i) => ({ width: 100 + i, height: 200, jpegBytes: JPG1 }));
r = await rasterToPdf(many);
const got = await sizes(r.files[0]);
assert.strictEqual(got.length, 50);
assert.deepStrictEqual(got[0], [100, 200]);
assert.deepStrictEqual(got[49], [149, 200], "keeps the FIRST 50");
assert.strictEqual(r.warnings.length, 1);
assert.match(r.warnings[0], /first 50/);
assert.match(r.warnings[0], /51/);

// exactly 50 -> no warning
r = await rasterToPdf(many.slice(0, 50));
assert.deepStrictEqual(r.warnings, []);

// 0 pages -> specific readable error (not makeResult's generic one)
await rejects(() => rasterToPdf([]), /no pages to export/i);
await rejects(() => rasterToPdf(undefined), /no pages to export/i);

// bad page entries skipped with a warning naming the page; all bad -> readable error
const PNG = b64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC");
r = await rasterToPdf([
  { width: 100, height: 100, jpegBytes: JPG1 },
  { width: 100, height: 100, jpegBytes: PNG },
  { width: 100, height: 100, jpegBytes: JPG1.slice(0, 40) },
  { width: 0, height: 100, jpegBytes: JPG1 },
  { width: Infinity, height: 100, jpegBytes: JPG1 },
]);
assert.strictEqual((await sizes(r.files[0])).length, 1);
assert.strictEqual(r.warnings.length, 4);
assert.match(r.warnings[0], /page 2/i);
assert.match(r.warnings[1], /page 3/i);
assert.match(r.warnings[2], /page 4/i);
assert.match(r.warnings[3], /page 5/i);
await rejects(() => rasterToPdf([{ width: 10, height: 10, jpegBytes: PNG }]), /no pages could be exported/i);

console.log("pdftools_raster_test: ok");
