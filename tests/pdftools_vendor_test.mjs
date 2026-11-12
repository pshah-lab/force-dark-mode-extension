// tests/pdftools_vendor_test.mjs - vendored pdf-lib sanity + no-network checks
import fs from "fs";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.join(here, "..", "src", "viewer", "vendor");
const { PDFDocument, StandardFonts, degrees, rgb } = await import(path.join(vendor, "pdf-lib.min.mjs"));

assert.ok(StandardFonts && typeof degrees === "function" && typeof rgb === "function", "named exports present");
const doc = await PDFDocument.create();
doc.addPage();
doc.addPage();
const bytes = await doc.save();
const again = await PDFDocument.load(bytes);
assert.strictEqual(again.getPageCount(), 2, "round-trips 2 pages");

assert.ok(/MIT/.test(fs.readFileSync(path.join(vendor, "pdf-lib.LICENSE.txt"), "utf8")), "licence mentions MIT");
const src = fs.readFileSync(path.join(vendor, "pdf-lib.min.mjs"), "utf8");
assert.ok(!src.includes("fetch("), "no fetch(");
assert.ok(!src.includes("XMLHttpRequest"), "no XMLHttpRequest");
console.log("pdftools_vendor_test: all passed");
