// Safe PDF loading for the offline PDF tools. DOM-free, no network.
import { PDFDocument } from "../vendor/pdf-lib.min.mjs";

export async function loadPdf(bytes, name, options) {
  const label = String(name || "this file");
  try {
    return await PDFDocument.load(bytes, options);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/encrypt/i.test(msg)) {
      throw new Error(`${label} is password-protected or encrypted, so it can't be edited. Remove the password first.`);
    }
    throw new Error(`${label} could not be read. It may be corrupt or not a PDF.`);
  }
}
