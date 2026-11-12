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

console.log("pdftools_images_test: all passed");
