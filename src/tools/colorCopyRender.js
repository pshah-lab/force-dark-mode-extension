// Renders a PDF's pages to recolored JPEGs for the dark / sepia / grayscale image copy.
// Shared by the Tools page and the document viewer's Tools control. Needs a DOM (canvas);
// the caller passes its PDF.js module. Runs locally: nothing is fetched or sent anywhere.
// Each call opens its own PDF.js document from a copy of the bytes, releases each page's
// caches after rendering it, and destroys the document when done (success or error).
import { loadPdf } from "../viewer/pdftools/loadPdf.js";
import { convertPixels } from "../viewer/pdftools/pixelModes.js";
import { MAX_PNG_PAGES, pngRenderScale } from "../viewer/convert/pdfExport.js";

const JPEG_QUALITY = 0.85;

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

function pdfjsMessage(error, name) {
  if (error && error.name === "PasswordException") {
    return `${name} is password-protected or encrypted, so it can't be edited. Remove the password first.`;
  }
  return `${name} could not be read. It may be corrupt or not a PDF.`;
}

async function renderPageToJpeg(page, mode) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: pngRenderScale(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({ canvasContext: context, viewport }).promise;
    // ImageData.data is a Uint8ClampedArray, converted in place.
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    convertPixels(image.data, mode);
    context.putImageData(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("JPEG encoding failed");
    // Scale 1 viewport size is in PDF points and already accounts for page rotation.
    return { width: base.width, height: base.height, jpegBytes: new Uint8Array(await blob.arrayBuffer()) };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

// Returns { name, pages, totalPages } (pages: [{width, height, jpegBytes}] for rasterToPdf), or throws a
// readable Error. At most MAX_PNG_PAGES pages; onProgress gets "Page N of M"; isCurrent() false cancels.
export async function renderColorCopyPages(pdfjsLib, { name, bytes, mode, onProgress = () => {}, isCurrent = () => true }) {
  await loadPdf(bytes, name); // engine's readable encrypted / corrupt message
  let loadingTask;
  let pdf;
  try {
    loadingTask = pdfjsLib.getDocument({ data: bytes.slice(), verbosity: pdfjsLib.VerbosityLevel?.ERRORS ?? 0 });
    pdf = await loadingTask.promise;
  } catch (error) {
    if (loadingTask) await loadingTask.destroy();
    throw new Error(pdfjsMessage(error, name));
  }
  try {
    const total = pdf.numPages;
    const count = Math.min(total, MAX_PNG_PAGES);
    const pages = [];
    for (let n = 1; n <= count; n++) {
      if (!isCurrent()) throw new Error("Cancelled.");
      onProgress(`Page ${n} of ${count}`);
      const page = await pdf.getPage(n);
      try {
        pages.push(await renderPageToJpeg(page, mode));
      } finally {
        page.cleanup();
      }
      await yieldToEventLoop();
    }
    return { name, pages, totalPages: total };
  } finally {
    await loadingTask.destroy(); // pdf.js 6: the loading task owns destroy()
  }
}
