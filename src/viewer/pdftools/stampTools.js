// Stamp PDF tools: page numbers and text watermark. DOM-free, no network.
import { StandardFonts, rgb, degrees } from "../vendor/pdf-lib.min.mjs";
import { exportFileName } from "../convert/exportFormats.js";
import { parseRangeList } from "./ranges.js";
import { makeResult, PDF_MIME } from "./result.js";
import { loadPdf } from "./loadPdf.js";

const POSITIONS = ["bottom-center", "bottom-right", "top-center", "top-right"];
const FORMATS = ["n", "n-of-total"];
const MARGIN = 28;

// Helvetica (WinAnsi) cannot encode every character. Replace the ones it cannot with "?".
function toEncodable(font, text) {
  const ok = new Set(font.getCharacterSet());
  let replaced = false;
  let out = "";
  for (const ch of String(text)) {
    if (ok.has(ch.codePointAt(0))) out += ch;
    else {
      out += "?";
      replaced = true;
    }
  }
  return { text: out, replaced };
}

function checkNumber(value, label, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  }
}

export async function addPageNumbers(input, options = {}) {
  const position = options.position === undefined ? "bottom-center" : options.position;
  const format = options.format === undefined ? "n" : options.format;
  const startAt = options.startAt === undefined ? 1 : options.startAt;
  const size = options.size === undefined ? 10 : options.size;
  if (!POSITIONS.includes(position)) throw new Error(`Position must be one of: ${POSITIONS.join(", ")}.`);
  if (!FORMATS.includes(format)) throw new Error(`Format must be one of: ${FORMATS.join(", ")}.`);
  if (!Number.isInteger(startAt) || startAt < 1 || startAt > 1000000) throw new Error("Start number must be a whole number from 1 to 1000000.");
  checkNumber(size, "Text size", 4, 200);

  const doc = await loadPdf(input.bytes, input.name);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const n = startAt + i;
    const label = format === "n-of-total" ? `${n} of ${startAt + total - 1}` : String(n);
    const { width, height } = page.getSize();
    const w = font.widthOfTextAtSize(label, size);
    const x = position.endsWith("center") ? (width - w) / 2 : width - MARGIN - w;
    const y = position.startsWith("bottom") ? MARGIN : height - MARGIN - size;
    page.drawText(label, { x, y, size, font, color: rgb(0.2, 0.2, 0.2) });
  });
  return makeResult([{ name: exportFileName(input.name, "pdf", "-numbered"), bytes: await doc.save(), mime: PDF_MIME }]);
}

export async function addWatermark(input, options = {}) {
  const raw = options.text === undefined || options.text === null ? "" : String(options.text);
  if (!raw.trim()) throw new Error("Enter the watermark text.");
  const size = options.size === undefined ? 48 : options.size;
  checkNumber(size, "Text size", 4, 400);
  const opacityIn = options.opacity === undefined ? 0.3 : options.opacity;
  if (typeof opacityIn !== "number" || !Number.isFinite(opacityIn)) throw new Error("Opacity must be a number between 0.05 and 1.");
  const opacity = Math.min(1, Math.max(0.05, opacityIn));
  const diagonal = options.diagonal === undefined ? true : !!options.diagonal;

  const doc = await loadPdf(input.bytes, input.name);
  const targets =
    options.pages !== undefined && options.pages !== null && String(options.pages).trim() !== ""
      ? [...new Set(parseRangeList(options.pages, doc.getPageCount()))]
      : doc.getPageIndices().map((i) => i + 1);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const warnings = [];
  const enc = toEncodable(font, raw.replace(/[\r\n]+/g, " "));
  if (enc.replaced) {
    warnings.push("Some characters in the watermark can't be drawn with the built-in font and were replaced with \"?\". Use Latin letters for the watermark.");
  }
  const text = enc.text;
  const w = font.widthOfTextAtSize(text, size);
  const h = font.heightAtSize(size, { descender: false });
  for (const p of targets) {
    const page = doc.getPage(p - 1);
    const { width, height } = page.getSize();
    if (diagonal) {
      const a = Math.PI / 4;
      // Place the text's center at the page center after rotating about its left baseline point.
      const x = width / 2 - (w / 2) * Math.cos(a) + (h / 2) * Math.sin(a);
      const y = height / 2 - (w / 2) * Math.sin(a) - (h / 2) * Math.cos(a);
      page.drawText(text, { x, y, size, font, color: rgb(0.5, 0.5, 0.5), opacity, rotate: degrees(45) });
    } else {
      page.drawText(text, { x: (width - w) / 2, y: (height - h) / 2, size, font, color: rgb(0.5, 0.5, 0.5), opacity });
    }
  }
  return makeResult([{ name: exportFileName(input.name, "pdf", "-watermarked"), bytes: await doc.save(), mime: PDF_MIME }], warnings);
}
