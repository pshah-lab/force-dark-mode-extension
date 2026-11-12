// Images to PDF: JPG/PNG detected by magic bytes. DOM-free, no network.
import { PDFDocument } from "../vendor/pdf-lib.min.mjs";
import { makeResult, PDF_MIME } from "./result.js";

const PAGE_SIZES = { a4: [595, 842], letter: [612, 792] };

function detect(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

export async function imagesToPdf(images, options = {}) {
  if (!Array.isArray(images) || images.length === 0) throw new Error("Add at least one image (JPG or PNG).");
  const mode = options.pageSize in PAGE_SIZES ? options.pageSize : "fit";
  const out = await PDFDocument.create();
  const warnings = [];
  for (const img of images) {
    const kind = detect(img && img.bytes);
    if (!kind) {
      warnings.push(`Skipped ${img && img.name}: not a JPG or PNG image.`);
      continue;
    }
    let embedded;
    try {
      embedded = kind === "png" ? await out.embedPng(img.bytes) : await out.embedJpg(img.bytes);
    } catch {
      warnings.push(`Skipped ${img.name}: the image could not be read.`);
      continue;
    }
    const { width, height } = embedded;
    if (mode === "fit") {
      out.addPage([width, height]).drawImage(embedded, { x: 0, y: 0, width, height });
    } else {
      const [pw, ph] = PAGE_SIZES[mode];
      const scale = Math.min(pw / width, ph / height);
      const w = width * scale;
      const h = height * scale;
      out.addPage([pw, ph]).drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
  }
  if (out.getPageCount() === 0) throw new Error("No usable images: only JPG and PNG files can be converted.");
  return makeResult([{ name: "images.pdf", bytes: await out.save(), mime: PDF_MIME }], warnings);
}
