import { listZipEntryNames, readZipEntryText } from "../../shared/zipReader.js";
import { parseStyles, parseThemeColors } from "./xlsxStyles.js";
import { formatCellValue } from "./numberFormat.js";
import { applyLimits, MAX_ROWS, MAX_COLS, MAX_CELLS, MAX_SHEETS } from "./spreadsheetLimits.js";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

// Out-of-range or surrogate code points would make String.fromCodePoint throw.
function safeCodePoint(n) {
  return n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) ? "\uFFFD" : String.fromCodePoint(n);
}

function decode(text) {
  return text.replace(/&(#(\d+)|#x([0-9a-fA-F]+)|amp|lt|gt|quot|apos);/g, (m, _e, dec, hex) => {
    if (dec) return safeCodePoint(Number(dec));
    if (hex) return safeCodePoint(parseInt(hex, 16));
    return ENTITIES[m.slice(1, -1)] ?? m;
  });
}

function attrs(tagText) {
  const out = {};
  // The lookbehind anchors names at their start so a long run of name characters
  // without '=' is not re-scanned from every offset (quadratic).
  const re = /(?<![\w:.-])([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagText)) !== null) out[m[1]] = decode(m[2]);
  return out;
}

// Text of the first <tag>...</tag> in xml (or null). Linear: the open tag cannot
// cross '<' and the close is found with a single indexOf.
function elementInner(xml, tag) {
  const open = new RegExp(`<${tag}(?=[\\s>])[^<>]*>`).exec(xml);
  if (!open) return null;
  const from = open.index + open[0].length;
  const end = xml.indexOf(`</${tag}>`, from);
  return end === -1 ? null : xml.slice(from, end);
}

// Removes <rPh>...</rPh> phonetic runs; an unclosed <rPh> is left in place.
function stripPhonetic(inner) {
  let out = "";
  let pos = 0;
  for (;;) {
    const st = inner.indexOf("<rPh", pos);
    if (st === -1 || /[\w]/.test(inner[st + 4] ?? "")) {
      if (st !== -1) {
        out += inner.slice(pos, st + 4);
        pos = st + 4;
        continue;
      }
      break;
    }
    const end = inner.indexOf("</rPh>", st);
    if (end === -1) break;
    out += inner.slice(pos, st);
    pos = end + 6;
  }
  return out + inner.slice(pos);
}

// Concatenates the <t> texts of an <si>/<is> body, ignoring phonetic runs.
function textOf(inner) {
  const stripped = stripPhonetic(inner);
  let out = "";
  const openRe = /<t(?=[\s/>])([^<>]*)>/g;
  let m;
  while ((m = openRe.exec(stripped)) !== null) {
    if (m[1].endsWith("/")) continue;
    const end = stripped.indexOf("</t>", openRe.lastIndex);
    if (end === -1) break;
    out += decode(stripped.slice(openRe.lastIndex, end));
    openRe.lastIndex = end + 4;
  }
  return out;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const openRe = /<si(?=[\s/>])([^<>]*)>/g;
  let m;
  while ((m = openRe.exec(xml)) !== null) {
    if (m[1].endsWith("/")) {
      out.push("");
      continue;
    }
    const end = xml.indexOf("</si>", openRe.lastIndex);
    if (end === -1) break;
    out.push(textOf(xml.slice(openRe.lastIndex, end)));
    openRe.lastIndex = end + 5;
  }
  return out;
}

function colIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseRef(ref) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref ?? "");
  return m ? { col: colIndex(m[1]), row: Number(m[2]) - 1 } : null;
}

function resolveTarget(target) {
  if (target.startsWith("/")) return target.slice(1);
  return "xl/" + target.replace(/^\.\//, "");
}

function parseWorkbook(xml, relsXml) {
  const rels = {};
  const relRe = /<Relationship\b([^<>]*)>/g;
  let m;
  while ((m = relRe.exec(relsXml ?? "")) !== null) {
    const a = attrs(m[1]);
    if (a.Id && a.Target) rels[a.Id] = resolveTarget(a.Target);
  }
  const sheets = [];
  const re = /<sheet\b([^<>]*)>/g;
  while ((m = re.exec(xml)) !== null) {
    const a = attrs(m[1]);
    sheets.push({ name: a.name ?? `Sheet${sheets.length + 1}`, path: rels[a["r:id"]] });
  }
  const pr = /<workbookPr\b([^<>]*)>/.exec(xml);
  const d = pr ? attrs(pr[1]).date1904 : undefined;
  return { sheets, date1904: d === "1" || d === "true" };
}

function parseColumnWidths(xml) {
  const widths = [];
  const re = /<col\b([^<>]*)>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const a = attrs(m[1]);
    const min = Number(a.min);
    const max = Math.min(Number(a.max), MAX_COLS);
    const raw = Number(a.width);
    if (!(min >= 1) || !Number.isFinite(raw)) continue;
    const w = Math.max(0, Math.min(255, raw)); // Excel's column width range
    for (let c = min; c <= max; c++) widths[c - 1] = w;
  }
  return widths;
}

function makeCell(text, style, isNumber) {
  const cell = { text };
  if (style) {
    if (style.bold) cell.bold = true;
    if (style.italic) cell.italic = true;
    if (style.fill) cell.fill = style.fill;
    if (style.color) cell.color = style.color;
    if (style.align) cell.align = style.align;
  }
  if (!cell.align && isNumber) cell.align = "right";
  return cell;
}

function parseSheet(xml, ctx) {
  const start = xml.indexOf("<sheetData");
  const rowsOut = []; // sparse: rowsOut[rowIndex] = { [col]: cell }
  let truncated = false;
  let maxRow = -1;
  let maxCol = -1;
  let cellCount = 0;

  if (start !== -1) {
    const openEnd = xml.indexOf(">", start);
    const selfClosed = xml[openEnd - 1] === "/";
    let pos = selfClosed ? xml.length : openEnd + 1;
    const dataEnd = selfClosed ? -1 : xml.indexOf("</sheetData>", pos);
    const limit = dataEnd === -1 ? xml.length : dataEnd;
    const rowRe = /<row\b([^<>]*?)(\/?)>/g;
    rowRe.lastIndex = pos;
    let prevRow = -1;
    let stop = false;
    let rm;
    while (!stop && (rm = rowRe.exec(xml)) !== null && rm.index < limit) {
      const ra = attrs(rm[1]);
      const rowIdx = ra.r !== undefined && Number(ra.r) >= 1 ? Number(ra.r) - 1 : prevRow + 1;
      prevRow = rowIdx;
      if (rm[2] === "/") continue;
      const bodyStart = rowRe.lastIndex;
      let bodyEnd = xml.indexOf("</row>", bodyStart);
      if (bodyEnd === -1 || bodyEnd > limit) bodyEnd = limit;
      rowRe.lastIndex = bodyEnd;

      const body = xml.slice(bodyStart, bodyEnd);
      const cellRe = /<c\b([^<>]*?)(\/?)>/g;
      let prevCol = -1;
      let cm;
      while ((cm = cellRe.exec(body)) !== null) {
        const ca = attrs(cm[1]);
        const ref = ca.r ? parseRef(ca.r) : null;
        const col = ref ? ref.col : prevCol + 1;
        prevCol = col;
        let inner = "";
        if (cm[2] !== "/") {
          let ce = body.indexOf("</c>", cellRe.lastIndex);
          if (ce === -1) ce = body.length;
          inner = body.slice(cellRe.lastIndex, ce);
          cellRe.lastIndex = ce;
        }
        const hasValue = /<v(?:\s[^<>]*)?>[^<]|<t(?:\s[^<>]*)?>[^<]/.test(inner);
        if (rowIdx >= MAX_ROWS) {
          if (!hasValue) continue;
          truncated = true;
          stop = true;
          break;
        }
        if (col >= MAX_COLS) {
          if (hasValue) truncated = true;
          continue;
        }
        if (cellCount >= MAX_CELLS) {
          truncated = true;
          stop = true;
          break;
        }
        const style = ctx.cellStyles[Number(ca.s) || 0];
        const vInner = elementInner(inner, "v");
        const v = vInner === null ? "" : decode(vInner);
        let text = "";
        let isNumber = false;
        switch (ca.t) {
          case "s":
            text = v === "" ? "" : (ctx.sharedStrings[Number(v)] ?? "");
            break;
          case "inlineStr":
            text = textOf(inner);
            break;
          case "b":
            text = v === "" ? "" : v === "1" ? "TRUE" : "FALSE";
            break;
          case "str":
          case "e":
            text = v;
            break;
          default: {
            if (v !== "") {
              const n = Number(v);
              if (Number.isFinite(n)) {
                text = ctx.formatCellValue(n, style?.formatCode, { date1904: ctx.date1904 });
                isNumber = true;
              } else text = v;
            }
          }
        }
        (rowsOut[rowIdx] ??= {})[col] = makeCell(text, style, isNumber);
        cellCount++;
        if (rowIdx > maxRow) maxRow = rowIdx;
        if (col > maxCol) maxCol = col;
      }
    }
  }

  const grid = [];
  for (let r = 0; r <= maxRow; r++) {
    const sparse = rowsOut[r] ?? {};
    const row = [];
    for (let c = 0; c <= maxCol; c++) row.push(sparse[c] ?? { text: "" });
    grid.push(row);
  }
  const limited = applyLimits(grid);
  const rows = limited.rows;
  if (limited.truncated) truncated = true;

  const height = rows.length;
  const width = height ? rows[0].length : 0;
  const mergeRe = /<mergeCell\b([^<>]*)>/g;
  let mm;
  while ((mm = mergeRe.exec(xml)) !== null) {
    const [a, b] = (attrs(mm[1]).ref ?? "").split(":");
    const tl = parseRef(a);
    const br = parseRef(b ?? a);
    if (!tl || !br || tl.row >= height || tl.col >= width) continue;
    const r2 = Math.min(br.row, height - 1);
    const c2 = Math.min(br.col, width - 1);
    const colspan = c2 - tl.col + 1;
    const rowspan = r2 - tl.row + 1;
    if (colspan === 1 && rowspan === 1) continue;
    for (let r = tl.row; r <= r2; r++) {
      for (let c = tl.col; c <= c2; c++) {
        if (r === tl.row && c === tl.col) continue;
        rows[r][c] = { text: "", covered: true };
      }
    }
    if (colspan > 1) rows[tl.row][tl.col].colspan = colspan;
    if (rowspan > 1) rows[tl.row][tl.col].rowspan = rowspan;
  }

  return { rows, columnWidths: parseColumnWidths(xml), truncated };
}

// Reads a zip part. An oversize part (error.code "TOO_LARGE") is surfaced as
// { tooLarge: true, text: <bounded prefix> } instead of looking like a missing one.
async function readPart(bytes, name, opts) {
  try {
    return { text: await readZipEntryText(bytes, name, opts), tooLarge: false };
  } catch (error) {
    if (error?.code === "TOO_LARGE") return { text: error.partialText ?? "", tooLarge: true };
    throw error;
  }
}

// Parts the workbook cannot be interpreted without: an oversize one rejects the file.
async function readRequiredPart(bytes, name, opts) {
  const part = await readPart(bytes, name, opts);
  if (part.tooLarge) {
    const error = new Error(`${name} is too large to read.`);
    error.code = "TOO_LARGE";
    throw error;
  }
  return part.text;
}

export async function parseXlsx(bytes, { maxEntrySize, formatCellValue: format = formatCellValue } = {}) {
  const opts = maxEntrySize === undefined ? undefined : { maxEntrySize };
  const names = await listZipEntryNames(bytes);
  if (!names.includes("xl/workbook.xml")) {
    const error = new Error("Not an Excel workbook (xl/workbook.xml is missing).");
    error.code = "NOT_XLSX";
    throw error;
  }
  const workbookXml = (await readRequiredPart(bytes, "xl/workbook.xml", opts)) ?? "";
  const relsXml = await readRequiredPart(bytes, "xl/_rels/workbook.xml.rels", opts);
  const { sheets: sheetDefs, date1904 } = parseWorkbook(workbookXml, relsXml);

  // Theme only tints colors; an oversize theme falls back to the default palette.
  const theme = await readPart(bytes, "xl/theme/theme1.xml", opts);
  const themeColors = parseThemeColors(theme.tooLarge ? null : theme.text);
  const { cellStyles } = parseStyles(await readRequiredPart(bytes, "xl/styles.xml", opts), themeColors);
  const sharedStrings = parseSharedStrings(await readRequiredPart(bytes, "xl/sharedStrings.xml", opts));
  const ctx = { cellStyles, sharedStrings, date1904, formatCellValue: format };

  // `truncated` means any sheet was truncated or the sheet list was capped;
  // `sheetsCapped` is the workbook-level part only.
  const sheetsCapped = sheetDefs.length > MAX_SHEETS;
  let truncated = sheetsCapped;
  const sheets = [];
  for (const def of sheetDefs.slice(0, MAX_SHEETS)) {
    const part = def.path && names.includes(def.path) ? await readPart(bytes, def.path, opts) : { text: null };
    if (part.text == null) {
      sheets.push({ name: def.name, rows: [], columnWidths: [], truncated: false });
      continue;
    }
    const parsed = parseSheet(part.text, ctx);
    if (part.tooLarge) {
      // Only a bounded prefix of the sheet was readable.
      parsed.truncated = true;
      if (parsed.rows.length === 0) parsed.tooLarge = true;
    }
    if (parsed.truncated) truncated = true;
    sheets.push({ name: def.name, ...parsed });
  }
  return { sheets, truncated, sheetsCapped };
}
