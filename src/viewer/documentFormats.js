// Which kind of document the viewer has open, and the best-effort RTF stripping used for on-screen display.
// Pure and DOM-free.

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

export function rtfToPlainText(text) {
  return String(text ?? "")
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
