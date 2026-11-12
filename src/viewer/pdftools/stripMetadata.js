// Strip / inspect PDF metadata. DOM-free, no network.
// "Metadata" here = the Info dictionary (all keys, incl. custom ones), every XMP /Metadata
// stream (catalog, pages, images, ...) and any stale Info-like dictionary left as an orphan
// object. Loaded with updateMetadata:false so pdf-lib does not re-stamp Producer/ModDate; the
// objects are deleted from the context so they are not serialised (not even in object streams).
import {
  PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFString, PDFHexString, PDFNumber, PDFBool,
} from "../vendor/pdf-lib.min.mjs";
import { exportFileName } from "../convert/exportFormats.js";
import { makeResult, PDF_MIME } from "./result.js";
import { loadPdf } from "./loadPdf.js";

const LOAD_OPTS = { updateMetadata: false };
const INFO_MARKER_KEYS = ["Producer", "Creator", "CreationDate", "ModDate"];
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

function eachChild(obj, fn) {
  const d = dictOf(obj);
  if (d) for (const [k, v] of d.entries()) fn(v, k, d);
  else if (obj instanceof PDFArray) for (let i = obj.size() - 1; i >= 0; i--) fn(obj.get(i), i, obj);
}

// Every ref mentioned by any object value (trailer Info excluded: that is what we strip).
function mentionedRefs(ctx) {
  const seen = new Set();
  for (const [k, v] of Object.entries(ctx.trailerInfo)) {
    if (k !== "Info" && v instanceof PDFRef) seen.add(v);
  }
  const visit = (o) => {
    if (o instanceof PDFRef) { seen.add(o); return; }
    eachChild(o, (v) => visit(v));
  };
  for (const [, obj] of ctx.enumerateIndirectObjects()) eachChild(obj, (v) => visit(v));
  return seen;
}

export async function stripMetadata(input) {
  const doc = await loadPdf(input.bytes, input.name, LOAD_OPTS);
  const ctx = doc.context;
  const doomed = new Set();
  const infoRef = ctx.trailerInfo.Info;
  if (infoRef instanceof PDFRef) doomed.add(infoRef);
  delete ctx.trailerInfo.Info;
  const mentioned = mentionedRefs(ctx);

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream && String(obj.dict.get(PDFName.of("Type"))) === "/Metadata") doomed.add(ref);
    const d = dictOf(obj);
    if (!d) continue;
    const m = d.get(METADATA);
    if (m instanceof PDFRef) doomed.add(m);
    if (m !== undefined) d.delete(METADATA);
    // Stale Info dictionary left as an orphan: must look like a real Info dict AND be referenced by nothing
    // (outline items etc. also carry /Title, so Title/Author alone never qualifies).
    if (obj instanceof PDFDict && !mentioned.has(ref) && !d.has(PDFName.of("Type"))
        && INFO_MARKER_KEYS.some((k) => d.has(PDFName.of(k)))) doomed.add(ref);
  }
  for (const ref of doomed) ctx.delete(ref);
  // Drop any remaining pointers to deleted objects so nothing dangles.
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    eachChild(obj, (v, k, parent) => {
      if (!(v instanceof PDFRef) || !doomed.has(v)) return;
      if (parent instanceof PDFArray) parent.remove(k); else parent.delete(k);
    });
  }

  const bytes = await doc.save();
  return makeResult([{ name: exportFileName(input.name, "pdf", "-clean"), bytes, mime: PDF_MIME }]);
}
