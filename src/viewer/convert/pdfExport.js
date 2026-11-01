// Pure helpers for PDF exports. Input is PDF.js getTextContent() output per page
// ({ items: [{ str, transform, width, height }] }); nothing here touches the DOM.
import { escapeMarkdown } from "./docExport.js";

export const MAX_PNG_PAGES = 50;
export const PNG_DEFAULT_SCALE = 2;
const MAX_PNG_SIDE = 8192;
const MAX_PNG_PIXELS = 40e6;

const BULLET_RE = /^(?:[•◦▪▫●○■□‣⁃·]\s*|[-*–—]\s+)(\S.*)$/;
const NUMBERED_RE = /^(\d{1,3})[.)]\s+(\S.*)$/;
const MAX_HEADING_CHARS = 150;

function itemSize(item) {
  const t = item.transform || [];
  const fromMatrix = Math.hypot(t[2] || 0, t[3] || 0);
  return fromMatrix || item.height || 0;
}

// Groups text items that share a baseline into lines, top-to-bottom then left-to-right.
export function groupTextItemsIntoLines(items) {
  const usable = (items || [])
    .filter((it) => typeof it?.str === "string" && it.str.trim() !== "" && Array.isArray(it.transform))
    .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width || 0, size: itemSize(it) }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  for (const it of usable) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(1, Math.min(line?.size || it.size, it.size) * 0.5);
    if (line && Math.abs(line.y - it.y) <= tolerance) line.items.push(it);
    else lines.push({ y: it.y, size: it.size, items: [it] });
  }

  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x);
    let text = "";
    let end = null;
    let size = 0;
    for (const it of line.items) {
      const gap = end === null ? 0 : it.x - end;
      if (text && gap > it.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += " ";
      text += it.str;
      end = it.x + it.width;
      size = Math.max(size, it.size);
    }
    return { text: text.replace(/\s+/g, " ").trim(), y: line.y, x: line.items[0].x, size };
  });
}

export function hasExtractableText(pages) {
  return pages.some((p) => (p.items || []).some((it) => typeof it?.str === "string" && it.str.trim() !== ""));
}

// Character-weighted most common font size: the body text size.
function bodySize(pageLines) {
  const weights = new Map();
  for (const lines of pageLines) {
    for (const l of lines) {
      const key = Math.round(l.size * 2) / 2;
      weights.set(key, (weights.get(key) || 0) + l.text.length);
    }
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, w] of weights) {
    if (w > bestWeight) {
      best = size;
      bestWeight = w;
    }
  }
  return best || 1;
}

function headingLevel(line, body) {
  if (line.text.length > MAX_HEADING_CHARS || !/\p{L}/u.test(line.text)) return 0;
  const ratio = line.size / body;
  if (ratio >= 1.6) return 1;
  if (ratio >= 1.3) return 2;
  if (ratio >= 1.12) return 3;
  return 0;
}

function joinWrapped(prev, next) {
  if (/\p{L}-$/u.test(prev) && /^\p{Ll}/u.test(next)) return prev.slice(0, -1) + next;
  return `${prev} ${next}`;
}

// Splits a page's lines into blocks: { kind: "heading"|"bullet"|"numbered"|"para", lines, ... }.
function pageBlocks(lines, body) {
  const blocks = [];
  let prev = null;
  for (const line of lines) {
    const level = headingLevel(line, body);
    const bullet = BULLET_RE.exec(line.text);
    const numbered = NUMBERED_RE.exec(line.text);
    const kind = level ? "heading" : bullet ? "bullet" : numbered ? "numbered" : "para";
    const last = blocks[blocks.length - 1];
    const gap = prev ? prev.y - line.y : 0;
    const sameSize = prev && Math.abs(prev.size - line.size) < 0.5;
    const tight = prev && gap <= Math.max(prev.size, line.size) * 1.6;
    // Wrapped continuation: plain line, tight spacing, same size, after a para or list item.
    const continues = last && kind === "para" && tight && sameSize && last.kind !== "heading";
    const headingContinues = last && kind === "heading" && last.kind === "heading" && last.level === level && tight;

    if (continues || headingContinues) {
      last.lines.push(line.text);
    } else {
      blocks.push({
        kind,
        level,
        number: numbered ? numbered[1] : null,
        lines: [kind === "bullet" ? bullet[1] : kind === "numbered" ? numbered[2] : line.text],
        raw: [line.text],
        listGroup: (kind === "bullet" || kind === "numbered") && last && (last.kind === "bullet" || last.kind === "numbered") && tight,
      });
    }
    if (continues || headingContinues) last.raw.push(line.text);
    prev = line;
  }
  return blocks;
}

function pagesToBlocks(pages) {
  const pageLines = pages.map((p) => groupTextItemsIntoLines(p.items));
  const body = bodySize(pageLines);
  return pageLines.map((lines) => pageBlocks(lines, body));
}

function renderBlocks(pagesBlocks, renderBlock) {
  let out = "";
  for (const blocks of pagesBlocks) {
    for (const block of blocks) {
      const text = renderBlock(block);
      if (!text) continue;
      if (out) out += block.listGroup ? "\n" : "\n\n";
      out += text;
    }
  }
  return out ? out + "\n" : "";
}

export function pdfPagesToText(pages) {
  return renderBlocks(pagesToBlocks(pages), (b) => b.raw.join("\n"));
}

export function pdfPagesToMarkdown(pages) {
  return renderBlocks(pagesToBlocks(pages), (b) => {
    const text = escapeMarkdown(b.lines.reduce(joinWrapped));
    if (b.kind === "heading") return `${"#".repeat(b.level)} ${text}`;
    if (b.kind === "bullet") return `- ${text}`;
    if (b.kind === "numbered") return `${b.number}. ${text}`;
    return text;
  });
}

// "1-3, 5, 8-" -> { pages: [1,2,3,5,8,...] } or { error }. Empty / "all" means every page.
export function parsePageRange(input, numPages, maxPages = MAX_PNG_PAGES) {
  const spec = String(input ?? "").trim().toLowerCase();
  const pages = new Set();
  if (spec === "" || spec === "all") {
    for (let p = 1; p <= numPages; p += 1) pages.add(p);
  } else {
    for (const part of spec.split(",")) {
      const m = /^\s*(\d+)\s*(?:(-)\s*(\d*)\s*)?$/.exec(part);
      if (!m) return { error: `Invalid page range "${part.trim()}". Use e.g. 1-3, 5.` };
      const start = Number(m[1]);
      const end = m[2] ? (m[3] ? Number(m[3]) : numPages) : start;
      if (start < 1 || end > numPages || start > end) {
        return { error: `Pages must be between 1 and ${numPages}.` };
      }
      if (end - start + 1 > maxPages) return { error: `Export at most ${maxPages} pages at a time.` };
      for (let p = start; p <= end; p += 1) pages.add(p);
    }
  }
  if (pages.size > maxPages) return { error: `Export at most ${maxPages} pages at a time; enter a page range.` };
  return { pages: [...pages].sort((a, b) => a - b) };
}

// Render scale for a page whose viewport at scale 1 is width x height CSS px.
export function pngRenderScale(width, height, preferred = PNG_DEFAULT_SCALE) {
  if (!(width > 0) || !(height > 0)) return preferred;
  let scale = preferred;
  scale = Math.min(scale, MAX_PNG_SIDE / width, MAX_PNG_SIDE / height);
  scale = Math.min(scale, Math.sqrt(MAX_PNG_PIXELS / (width * height)));
  return scale;
}
