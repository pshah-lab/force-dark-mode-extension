// Canvas helpers for the Tools page: PDF pages -> JPG / PNG files, and JPEG re-encoding for Compress PDF.
// Needs a DOM (canvas); the caller passes its PDF.js module. Runs locally: nothing is fetched or sent anywhere.
import { loadPdf } from "../viewer/pdftools/loadPdf.js";
import { MAX_PNG_PAGES, pngRenderScale, parsePageRange } from "../viewer/convert/pdfExport.js";
import { exportFileName } from "../viewer/convert/exportFormats.js";

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));
const JPEG_QUALITY = 0.9;

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Returns { name, images: [{name, bytes, mime}], totalPages } or throws a readable Error.
export async function renderPdfToImages(pdfjsLib, { name, bytes, format, pages: rangeText, onProgress = () => {}, isCurrent = () => true }) {
  await loadPdf(bytes, name); // readable encrypted / corrupt message
  let loadingTask;
  let pdf;
  try {
    loadingTask = pdfjsLib.getDocument({ data: bytes.slice(), verbosity: pdfjsLib.VerbosityLevel?.ERRORS ?? 0 });
    pdf = await loadingTask.promise;
  } catch {
    if (loadingTask) await loadingTask.destroy();
    throw new Error(`${name} could not be read. It may be corrupt or not a PDF.`);
  }
  try {
    const total = pdf.numPages;
    const range = parsePageRange(rangeText, total);
    if (range.error) throw new Error(range.error);
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const ext = format === "png" ? "png" : "jpg";
    const images = [];
    for (let i = 0; i < range.pages.length; i++) {
      if (!isCurrent()) throw new Error("Cancelled.");
      const n = range.pages[i];
      onProgress(`Page ${i + 1} of ${range.pages.length}`);
      const page = await pdf.getPage(n);
      try {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: pngRenderScale(base.width, base.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        try {
          await page.render({ canvasContext: context, viewport }).promise;
          const blob = await toBlob(canvas, mime, JPEG_QUALITY);
          if (!blob) throw new Error("Image encoding failed.");
          images.push({
            name: exportFileName(name, ext, `-page-${n}`),
            bytes: new Uint8Array(await blob.arrayBuffer()),
            mime,
          });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        page.cleanup();
      }
      await yieldToEventLoop();
    }
    return { name, images, totalPages: range.pages.length };
  } finally {
    await pdf.destroy();
  }
}

// Compress PDF hook: re-encode one DeviceRGB JPEG smaller. Returns {bytes, width, height} or null.
export async function recompressJpeg(bytes, { width, height, quality, maxSide }) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }), { imageOrientation: "none" });
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    if (width && height && (bitmap.width !== width || bitmap.height !== height)) return null; // metadata mismatch: leave it alone
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, w, h);
    context.drawImage(bitmap, 0, 0, w, h);
    const blob = await toBlob(canvas, "image/jpeg", quality);
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
  } finally {
    bitmap.close();
  }
}
