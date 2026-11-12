// Recolored page images -> PDF. The caller renders each page with PDF.js,
// runs convertPixels, encodes JPEG, then passes the bytes here with the page's
// original point size. DOM-free, no network.
import { PDFDocument } from "../vendor/pdf-lib.min.mjs";
import { makeResult, PDF_MIME } from "./result.js";
import { checkJpg, detect } from "./imagesToPdf.js";
import { MAX_PNG_PAGES } from "../convert/pdfExport.js";

const validSize = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

export async function rasterToPdf(pages) {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error("There are no pages to export.");
  const warnings = [];
  const list = pages.slice(0, MAX_PNG_PAGES);
  if (pages.length > MAX_PNG_PAGES) {
    warnings.push(`Only the first ${MAX_PNG_PAGES} of ${pages.length} pages were exported.`);
  }
  const out = await PDFDocument.create();
  for (let i = 0; i < list.length; i++) {
    const page = list[i] || {};
    const label = `page ${i + 1}`;
    if (!validSize(page.width) || !validSize(page.height)) {
      warnings.push(`Skipped ${label}: it has no valid size.`);
      continue;
    }
    const bad = detect(page.jpegBytes) !== "jpg" ? "is not a JPEG" : checkJpg(page.jpegBytes);
    if (bad) {
      warnings.push(`Skipped ${label}: the image ${bad}.`);
      continue;
    }
    let image;
    try {
      image = await out.embedJpg(page.jpegBytes);
    } catch {
      warnings.push(`Skipped ${label}: the image could not be read.`);
      continue;
    }
    const { width, height } = page;
    out.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  }
  if (out.getPageCount() === 0) throw new Error("No pages could be exported: the page images were unreadable.");
  return makeResult([{ name: "converted.pdf", bytes: await out.save(), mime: PDF_MIME }], warnings);
}
