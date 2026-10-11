import { mapCellColors } from "./cellColors.js";

const HEADER_CELL = { fill: "#f0f0f0", color: "#444444" };

export function columnLetters(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function buildSheetView(sheet, settings) {
  const mode = settings?.mode ?? "smart";
  const palette = { backgroundColor: settings?.backgroundColor, textColor: settings?.textColor };
  const sourceRows = sheet?.rows ?? [];
  const columnCount = sourceRows.reduce((max, row) => Math.max(max, row.length), 0);

  const rows = sourceRows.map((row) =>
    row.map((cell) => {
      if (!cell || cell.covered) return null;
      const { background, color } = mapCellColors(cell, mode, palette);
      const style = { background, color };
      if (cell.bold) style.fontWeight = "bold";
      if (cell.italic) style.fontStyle = "italic";
      if (cell.align) style.textAlign = cell.align;
      const out = { text: cell.text, style };
      if (cell.colspan > 1) out.colspan = cell.colspan;
      if (cell.rowspan > 1) out.rowspan = cell.rowspan;
      return out;
    })
  );

  const header = mapCellColors(HEADER_CELL, mode, palette);
  const container = mapCellColors({}, mode, palette).background;
  const isEmpty = sourceRows.length === 0 || columnCount === 0;

  let empty = null;
  if (sheet?.tooLarge) empty = "tooLarge";
  else if (isEmpty) empty = "empty";

  const notice =
    sheet?.truncated && !isEmpty
      ? `Showing the first ${rows.length} rows and ${columnCount} columns of this sheet.`
      : null;

  return {
    rows,
    columnCount,
    columnWidths: Array.isArray(sheet?.columnWidths) ? sheet.columnWidths : [],
    header: { background: header.background, color: header.color },
    container,
    notice,
    empty,
  };
}
