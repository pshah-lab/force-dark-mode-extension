// CSV (RFC 4180) and JSON serialisation of parsed spreadsheet data.
// Values are written faithfully: formula-like text (=, +, -, @) is NOT rewritten.

function csvField(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// rows: Array<Array<string | number | null>> -> CSV text with CRLF record endings.
export function toCsv(rows) {
  let out = "";
  for (const row of rows) out += row.map(csvField).join(",") + "\r\n";
  return out;
}

// Parsed sheet ({ rows: [[{ text }]] }) -> string[][] of display text.
export function sheetToMatrix(sheet) {
  return (sheet?.rows ?? []).map((row) => Array.from(row ?? [], (cell) => (cell && cell.text != null ? String(cell.text) : "")));
}

export function workbookToJson(workbook) {
  const sheets = (workbook?.sheets ?? []).map((sheet) => ({ name: String(sheet.name ?? ""), rows: sheetToMatrix(sheet) }));
  return JSON.stringify({ sheets }, null, 2) + "\n";
}
