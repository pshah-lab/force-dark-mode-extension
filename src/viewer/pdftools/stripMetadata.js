// Strip / inspect PDF metadata. DOM-free, no network.
// "Metadata" here = the Info dictionary (all keys, incl. custom ones), every XMP /Metadata
// stream (catalog, pages, images, ...) and any stale Info-like dictionary left as an orphan
// object. Loaded with updateMetadata:false so pdf-lib does not re-stamp Producer/ModDate; the
// objects are deleted from the context so they are not serialised (not even in object streams).
import {
  PDFName, PDFDict, PDFRef, PDFStream, PDFString, PDFHexString, PDFNumber, PDFBool,
} from "../vendor/pdf-lib.min.mjs";
import { exportFileName } from "../convert/exportFormats.js";
import { makeResult, PDF_MIME } from "./result.js";
import { loadPdf } from "./loadPdf.js";

const LOAD_OPTS = { updateMetadata: false };
const INFO_KEYS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped"];
const METADATA = PDFName.of("Metadata");

function dictOf(obj) {
  if (obj instanceof PDFDict) return obj;
  if (obj instanceof PDFStream) return obj.dict;
  return null;
}

function valueText(v) {
  if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
  if (v instanceof PDFName) return v.decodeText();
  if (v instanceof PDFNumber) return String(v.asNumber());
  if (v instanceof PDFBool) return String(v.asBoolean());
  return String(v);
}

export async function inspectMetadata(bytes) {
  const doc = await loadPdf(bytes, "this file", LOAD_OPTS);
  const ctx = doc.context;
  const out = [];
  const info = dictOf(ctx.lookup(ctx.trailerInfo.Info));
  if (info) {
    for (const [key, raw] of info.entries()) {
      const value = valueText(ctx.lookup(raw));
      if (value !== "") out.push({ field: key.decodeText(), value });
    }
  }
  let xmp = 0, xmpBytes = 0;
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream && String(obj.dict.get(PDFName.of("Type"))) === "/Metadata") {
      xmp++;
      xmpBytes += obj.getContentsSize();
    }
  }
  if (xmp) out.push({ field: "XMP", value: `present (${xmp} stream${xmp > 1 ? "s" : ""}, ${xmpBytes} bytes)` });
  return out;
}

export async function stripMetadata(input) {
  const doc = await loadPdf(input.bytes, input.name, LOAD_OPTS);
  const ctx = doc.context;
  const doomed = [];
  const infoRef = ctx.trailerInfo.Info;
  if (infoRef instanceof PDFRef) doomed.push(infoRef);
  delete ctx.trailerInfo.Info;

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream && String(obj.dict.get(PDFName.of("Type"))) === "/Metadata") doomed.push(ref);
    const d = dictOf(obj);
    if (!d) continue;
    const m = d.get(METADATA);
    if (m instanceof PDFRef) doomed.push(m);
    if (m !== undefined) d.delete(METADATA);
    // Stale Info-like dictionary (untyped, with Info keys) left behind as an orphan.
    if (obj instanceof PDFDict && !d.has(PDFName.of("Type")) && INFO_KEYS.some((k) => d.has(PDFName.of(k)))
        && !d.has(PDFName.of("Kids")) && !d.has(PDFName.of("Subtype"))) doomed.push(ref);
  }
  for (const ref of doomed) ctx.delete(ref);

  const bytes = await doc.save();
  return makeResult([{ name: exportFileName(input.name, "pdf", "-clean"), bytes, mime: PDF_MIME }]);
}
