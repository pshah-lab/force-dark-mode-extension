// Maps viewer document kinds and export formats to opt-in usage feature keys.
// Pure and DOM-free: only allow-listed keys come out, never names or file details.
import { FEATURE_KEYS, surfaceFor } from "../shared/usageReport.js";

// Document kind (from detectDocumentKind) -> short name used in feature keys.
const KIND_NAMES = new Map([
  ["pdf", "pdf"], ["docx", "docx"], ["pptx", "pptx"], ["xlsx", "xlsx"],
  ["csv", "csv"], ["markdown", "md"], ["text", "txt"], ["rtf", "rtf"],
]);

// A zip download is the multi-file form of the chosen format, so it counts under that format.
const ZIP_FORMAT = new Map([["xlsx", "csv"], ["pdf", "png"]]);

const allowed = (key) => (FEATURE_KEYS.includes(key) ? key : null);

export function viewerFeatureKey(kind) {
  const short = typeof kind === "string" ? KIND_NAMES.get(kind) : undefined;
  return short ? allowed(`viewer_${short}`) : null;
}

export function exportFeatureKey(kind, ext) {
  if (typeof kind !== "string" || typeof ext !== "string") return null;
  const short = KIND_NAMES.get(kind);
  if (!short) return null;
  const format = ext === "zip" ? ZIP_FORMAT.get(kind) : ext;
  return format ? allowed(`export_${short}_${format}`) : null;
}

// Where a PDF came from: "url" only for an http(s) address (the ?src= path); bytes from the file picker,
// file: and blob: addresses are "file". Returns one of two fixed strings, never the address itself.
export function pdfSourceKind(source) {
  return typeof source === "string" && /^https?:/i.test(source) ? "url" : "file";
}

// Surface for the opt-in report: one of the fixed surface strings, derived from the document kind and the
// "url"/"file" source only. Non-PDF documents only come from the file picker, so their source is always "file".
export function viewerSurface(kind, source) {
  const short = typeof kind === "string" ? KIND_NAMES.get(kind) : undefined;
  return surfaceFor({ kind: short, source: source === "url" ? "url" : source === "file" ? "file" : undefined });
}
