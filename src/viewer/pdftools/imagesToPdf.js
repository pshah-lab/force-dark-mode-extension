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

const MAX_SIDE = 16384;
const MAX_PIXELS = 40e6;

// Returns null when OK, else a reason string. Header-only parse; guards embedPng against truncated data.
function checkPng(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 8, first = true, idat = false, iend = false, w = 0, h = 0;
  while (pos + 12 <= b.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    if (pos + 12 + len > b.length) return "is truncated or corrupt";
    if (first) {
      if (type !== "IHDR" || len !== 13) return "is truncated or corrupt";
      w = dv.getUint32(pos + 8);
      h = dv.getUint32(pos + 12);
      first = false;
    } else if (type === "IDAT") idat = true;
    else if (type === "IEND") { iend = true; break; }
    pos += 12 + len;
  }
  if (first || !idat || !iend) return "is truncated or corrupt";
  return tooBig(w, h);
}

function tooBig(w, h) {
  if (!w || !h) return "is truncated or corrupt";
  return w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS ? "is too large to convert" : null;
}

// JPEG: scan markers up to the first SOF for dimensions.
function checkJpg(b) {
  let pos = 2;
  while (pos + 4 <= b.length) {
    if (b[pos] !== 0xff) return "is truncated or corrupt";
    const m = b[pos + 1];
    if (m === 0xff) { pos++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { pos += 2; continue; }
    const len = (b[pos + 2] << 8) | b[pos + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (pos + 9 > b.length) return "is truncated or corrupt";
      return tooBig((b[pos + 7] << 8) | b[pos + 8], (b[pos + 5] << 8) | b[pos + 6]);
    }
    pos += 2 + len;
  }
  return "is truncated or corrupt";
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
    const bad = kind === "png" ? checkPng(img.bytes) : checkJpg(img.bytes);
    if (bad) {
      warnings.push(`Skipped ${img.name}: the image ${bad}.`);
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
