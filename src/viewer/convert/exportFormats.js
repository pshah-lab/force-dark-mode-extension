// Which export formats each open document type supports, and safe download names.

const FORMATS = {
  txt: { id: "txt", label: "Plain text (.txt)", ext: "txt" },
  md: { id: "md", label: "Markdown (.md)", ext: "md" },
  html: { id: "html", label: "HTML page (.html)", ext: "html" },
  png: { id: "png", label: "Page images (.png / .zip)", ext: "png" },
  csv: { id: "csv", label: "CSV (.csv / .zip per sheet)", ext: "csv" },
  json: { id: "json", label: "JSON (.json)", ext: "json" },
  xlsx: { id: "xlsx", label: "Excel workbook (.xlsx)", ext: "xlsx" },
};

const FORMATS_BY_KIND = {
  pdf: ["txt", "md", "png"],
  docx: ["txt", "md", "html"],
  pptx: ["txt", "md", "html"],
  xlsx: ["csv", "json"],
  csv: ["xlsx"],
  markdown: ["html"],
  text: ["html"],
  rtf: ["html"],
};

export const EXPORT_MIME_TYPES = {
  txt: "text/plain;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  html: "text/html;charset=utf-8",
  png: "image/png",
  zip: "application/zip",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function detectDocumentKind(name, mimeType = "") {
  const lower = String(name ?? "").toLowerCase();
  const type = String(mimeType ?? "").toLowerCase();
  if (type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (type === "text/csv" || lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".rtf")) return "rtf";
  if (lower.endsWith(".txt") || type.startsWith("text/")) return "text";
  return null;
}

export function getExportFormats(kind) {
  return (FORMATS_BY_KIND[kind] ?? []).map((id) => ({ ...FORMATS[id] }));
}

const MAX_BASE_LENGTH = 120;

// "dir/Report.final.docx" + "md" -> "Report.final.md". Strips path parts, control,
// bidi-override and filesystem-reserved characters; falls back to "document".
export function exportFileName(originalName, ext, suffix = "") {
  const leaf = String(originalName ?? "").split(/[\\/]/).pop();
  const dot = leaf.lastIndexOf(".");
  let base = dot > 0 ? leaf.slice(0, dot) : dot === 0 ? "" : leaf;
  base = (base + suffix)
    .replace(/[\u0000-\u001f\u007f\u200E\u200F\u202A-\u202E\u2066-\u2069<>:"|?*]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!base) base = "document";
  // Cut by code point so a surrogate pair is never split.
  const chars = Array.from(base);
  if (chars.length > MAX_BASE_LENGTH) base = chars.slice(0, MAX_BASE_LENGTH).join("");
  return `${base}.${ext}`;
}
