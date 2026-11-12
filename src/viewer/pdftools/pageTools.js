// Page-structure PDF tools: merge, extract, remove, split, reorder, rotate. DOM-free, no network.
import { PDFDocument, degrees } from "../vendor/pdf-lib.min.mjs";
import { exportFileName } from "../convert/exportFormats.js";
import { parseRangeList, parseSplitGroups } from "./ranges.js";
import { makeResult, PDF_MIME } from "./result.js";
import { loadPdf } from "./loadPdf.js";

async function pickPages(src, pageNumbers) {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pageNumbers.map((p) => p - 1));
  copied.forEach((pg) => out.addPage(pg));
  return out;
}

async function file(doc, name) {
  return { name, bytes: await doc.save(), mime: PDF_MIME };
}

export async function mergePdfs(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error("Add at least one PDF to merge.");
  const out = await PDFDocument.create();
  for (const input of inputs) {
    const src = await loadPdf(input.bytes, input.name);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((pg) => out.addPage(pg));
  }
  return makeResult([await file(out, "merged.pdf")]);
}

export async function extractPages(input, rangeText) {
  const src = await loadPdf(input.bytes, input.name);
  const pages = parseRangeList(rangeText, src.getPageCount());
  return makeResult([await file(await pickPages(src, pages), exportFileName(input.name, "pdf", "-extract"))]);
}

export async function removePages(input, rangeText) {
  const src = await loadPdf(input.bytes, input.name);
  const n = src.getPageCount();
  const drop = new Set(parseRangeList(rangeText, n));
  const keep = [];
  for (let p = 1; p <= n; p++) if (!drop.has(p)) keep.push(p);
  if (keep.length === 0) throw new Error("That would remove every page. Keep at least one page.");
  return makeResult([await file(await pickPages(src, keep), exportFileName(input.name, "pdf", "-removed"))]);
}

export async function splitPdf(input, groupsText) {
  const src = await loadPdf(input.bytes, input.name);
  const groups = parseSplitGroups(groupsText, src.getPageCount());
  const files = [];
  for (let i = 0; i < groups.length; i++) {
    files.push(await file(await pickPages(src, groups[i]), exportFileName(input.name, "pdf", `-part-${i + 1}`)));
  }
  return makeResult(files);
}

export async function reorderPages(input, orderText) {
  const src = await loadPdf(input.bytes, input.name);
  const order = parseRangeList(orderText, src.getPageCount());
  return makeResult([await file(await pickPages(src, order), exportFileName(input.name, "pdf", "-reordered"))]);
}

export async function rotatePages(input, rangeText, angle) {
  if (![90, 180, 270].includes(angle)) throw new Error("Rotation must be 90, 180 or 270 degrees.");
  const src = await loadPdf(input.bytes, input.name);
  const pages = parseRangeList(rangeText, src.getPageCount());
  for (const p of new Set(pages)) {
    const page = src.getPage(p - 1);
    page.setRotation(degrees((((page.getRotation().angle + angle) % 360) + 360) % 360));
  }
  return makeResult([await file(src, exportFileName(input.name, "pdf", "-rotated"))]);
}
