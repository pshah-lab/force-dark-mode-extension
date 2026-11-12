// Shared result shape for PDF tools. Pure, DOM-free.
export const PDF_MIME = "application/pdf";

export function makeResult(files, warnings) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("No output was produced.");
  return { files, warnings: Array.isArray(warnings) ? warnings : [] };
}
