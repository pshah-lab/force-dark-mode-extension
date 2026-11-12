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

// Geometry of what the viewer sees: the visible box (CropBox if valid, else MediaBox) and the page
// rotation. place() maps a point in the viewer's upright frame (origin bottom-left of the displayed
// page) to unrotated page space, and returns the text angle that reads upright to the viewer.
function viewGeometry(page) {
  let box = page.getMediaBox();
  const crop = page.getCropBox();
  if (crop && crop.width > 0 && crop.height > 0) box = crop;
  const { x: x0, y: y0, width: W, height: H } = box;
  const raw = Math.round(page.getRotation().angle / 90) * 90;
  const rot = ((raw % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  return {
    rot,
    width: swap ? H : W,
    height: swap ? W : H,
    place(u, v, visualAngle = 0) {
      let x, y;
      if (rot === 0) [x, y] = [u, v];
      else if (rot === 90) [x, y] = [W - v, u];
      else if (rot === 180) [x, y] = [W - u, H - v];
      else [x, y] = [v, H - u];
      return { x: x0 + x, y: y0 + y, angle: visualAngle + rot };
    },
  };
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
    const g = viewGeometry(page);
    const w = font.widthOfTextAtSize(label, size);
    const u = position.endsWith("center") ? (g.width - w) / 2 : g.width - MARGIN - w;
    const v = position.startsWith("bottom") ? MARGIN : g.height - MARGIN - size;
    const { x, y, angle } = g.place(u, v);
    page.drawText(label, { x, y, size, font, color: rgb(0.2, 0.2, 0.2), rotate: degrees(angle) });
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
    const g = viewGeometry(page);
    const a = diagonal ? Math.PI / 4 : 0;
    // Baseline-left origin that puts the text's centre at the visible centre.
    const u = g.width / 2 - (w / 2) * Math.cos(a) + (h / 2) * Math.sin(a);
    const v = g.height / 2 - (w / 2) * Math.sin(a) - (h / 2) * Math.cos(a);
    const { x, y, angle } = g.place(u, v, diagonal ? 45 : 0);
    page.drawText(text, { x, y, size, font, color: rgb(0.5, 0.5, 0.5), opacity, rotate: degrees(angle) });
  }
  return makeResult([{ name: exportFileName(input.name, "pdf", "-watermarked"), bytes: await doc.save(), mime: PDF_MIME }], warnings);
}
