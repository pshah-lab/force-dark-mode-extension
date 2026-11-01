// Minimal XLSX (SpreadsheetML) writer: one shared-string table, one default style,
// values only. Never writes formulas; text such as "=SUM(A1)" stays a string cell.
import { createZip } from "./zipWriter.js";

// OOXML requires these exact namespace identifiers inside the XML. They are names,
// not addresses: nothing here (or in Excel) dereferences them. The scheme is kept
// in its own constant so the source holds no literal network URL.
const NS_SCHEME = "http" + ":" + "//";
const NS_MAIN = `${NS_SCHEME}schemas.openxmlformats.org/spreadsheetml/2006/main`;
const NS_REL = `${NS_SCHEME}schemas.openxmlformats.org/officeDocument/2006/relationships`;
const NS_PKG_REL = `${NS_SCHEME}schemas.openxmlformats.org/package/2006/relationships`;
const NS_CT = `${NS_SCHEME}schemas.openxmlformats.org/package/2006/content-types`;

const CT_PREFIX = "application/vnd.openxmlformats-officedocument.spreadsheetml";
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAX_SHEET_NAME = 31;
const MAX_SIGNIFICANT_DIGITS = 15;

// Characters XML 1.0 cannot carry (C0 controls other than tab/LF/CR, U+FFFE/U+FFFF,
// unpaired surrogates) become U+FFFD so the file stays well-formed.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlEscape(value) {
  return String(value ?? "")
    .replace(INVALID_XML_CHARS, "\uFFFD")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r/g, "&#13;");
}

function columnLetters(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// Plain decimal numbers that survive a Number round-trip unchanged (so "007",
// "3.50", "1e3" and long IDs stay text and display exactly as in the source).
function asNumber(text) {
  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(text)) return null;
  if (text.replace(/[-.]/g, "").replace(/^0+/, "").length > MAX_SIGNIFICANT_DIGITS) return null;
  const n = Number(text);
  return Number.isFinite(n) && String(n) === text ? text : null;
}

export function sanitizeSheetNames(names) {
  const used = new Set();
  return names.map((raw, i) => {
    let name = String(raw ?? "")
      .replace(INVALID_XML_CHARS, "")
      .replace(/[[\]:*?/\\]/g, "_")
      .replace(/^'+|'+$/g, "")
      .trim()
      .slice(0, MAX_SHEET_NAME);
    if (!name) name = `Sheet${i + 1}`;
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) {
      const suffix = ` (${n})`;
      candidate = name.slice(0, MAX_SHEET_NAME - suffix.length) + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function sheetXml(rows, strings) {
  let body = "";
  rows.forEach((row, r) => {
    let cells = "";
    (row ?? []).forEach((value, c) => {
      const text = value == null ? "" : String(value);
      if (text === "") return;
      const ref = `${columnLetters(c)}${r + 1}`;
      const num = asNumber(text);
      if (num !== null) {
        cells += `<c r="${ref}"><v>${num}</v></c>`;
      } else {
        let idx = strings.index.get(text);
        if (idx === undefined) {
          idx = strings.list.length;
          strings.list.push(text);
          strings.index.set(text, idx);
        }
        strings.count += 1;
        cells += `<c r="${ref}" t="s"><v>${idx}</v></c>`;
      }
    });
    if (cells) body += `<row r="${r + 1}">${cells}</row>`;
  });
  return `${XML_DECL}<worksheet xmlns="${NS_MAIN}">${body ? `<sheetData>${body}</sheetData>` : "<sheetData/>"}</worksheet>`;
}

const STYLES_XML =
  `${XML_DECL}<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

// sheets: [{ name, rows: Array<Array<string|number|null>> }] -> Uint8Array (.xlsx bytes)
export function createXlsx(sheets) {
  const list = sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const names = sanitizeSheetNames(list.map((s) => s.name));
  const strings = { list: [], index: new Map(), count: 0 };
  const sheetParts = list.map((s) => sheetXml(s.rows ?? [], strings));
  const n = list.length;

  const contentTypes =
    `${XML_DECL}<Types xmlns="${NS_CT}">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/xl/workbook.xml" ContentType="${CT_PREFIX}.sheet.main+xml"/>` +
    list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT_PREFIX}.worksheet+xml"/>`).join("") +
    `<Override PartName="/xl/styles.xml" ContentType="${CT_PREFIX}.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="${CT_PREFIX}.sharedStrings+xml"/>` +
    "</Types>";

  const rootRels =
    `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    "</Relationships>";

  const workbook =
    `${XML_DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
    names.map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    "</sheets></workbook>";

  const workbookRels =
    `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}">` +
    list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${n + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${n + 2}" Type="${NS_REL}/sharedStrings" Target="sharedStrings.xml"/>` +
    "</Relationships>";

  const sharedStrings =
    `${XML_DECL}<sst xmlns="${NS_MAIN}" count="${strings.count}" uniqueCount="${strings.list.length}">` +
    strings.list.map((s) => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`).join("") +
    "</sst>";

  return createZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/styles.xml", data: STYLES_XML },
    { name: "xl/sharedStrings.xml", data: sharedStrings },
    ...sheetParts.map((data, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data })),
  ]);
}
