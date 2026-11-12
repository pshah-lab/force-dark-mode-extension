// Page range parsing for PDF tools. Pure, DOM-free. Pages are 1-based.
// Unlike pdfExport's parsePageRange this keeps order and duplicates (needed for reorder/extract).

function parsePart(part, numPages) {
  const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
  if (!m) throw new Error(`"${part}" is not a valid page or range. Use numbers like 1-3, 5.`);
  const start = Number(m[1]);
  const end = m[2] === undefined ? start : Number(m[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1 || start > numPages || end > numPages) {
    throw new Error(`"${part}" is outside this document (pages 1-${numPages}).`);
  }
  if (end < start) throw new Error(`"${part}" runs backwards. Write the lower page first.`);
  const out = [];
  for (let p = start; p <= end; p++) out.push(p);
  return out;
}

function checkPages(numPages) {
  if (!Number.isInteger(numPages) || numPages < 1) throw new Error("This PDF has no pages.");
}

export function parseRangeList(input, numPages) {
  checkPages(numPages);
  const text = String(input == null ? "" : input).trim();
  if (!text) throw new Error("Enter at least one page or range, for example 1-3, 5.");
  const pages = [];
  for (const raw of text.split(",")) {
    const part = raw.trim();
    if (!part) throw new Error("Empty entry in the page list. Remove the extra comma.");
    pages.push(...parsePart(part, numPages));
  }
  return pages;
}

export function parseSplitGroups(input, numPages) {
  checkPages(numPages);
  const text = String(input == null ? "" : input).trim();
  if (!text) return Array.from({ length: numPages }, (_, i) => [i + 1]);
  return text.split(",").map((raw) => {
    const part = raw.trim();
    if (!part) throw new Error("Empty entry in the page list. Remove the extra comma.");
    return parsePart(part, numPages);
  });
}
