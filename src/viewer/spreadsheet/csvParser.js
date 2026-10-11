import { applyLimits, MAX_ROWS, MAX_COLS } from "./spreadsheetLimits.js";

export function parseCsv(text) {
  let src = String(text ?? "");
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  let capped = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    records.push(row);
    row = [];
    // One record past the cap is enough to know the sheet is truncated.
    if (records.length > MAX_ROWS) capped = true;
  };

  for (let i = 0; i < src.length && !capped; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (src[i + 1] === "\"") {
          field += "\"";
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === "\"") {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === ",") {
      endField();
      fieldStarted = true;
    } else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  // Flush final record unless input ended on a row terminator.
  if (!capped && (fieldStarted || field !== "" || row.length > 0)) endRow();

  // Bound the padded width before allocating: one extra column is enough for
  // applyLimits to notice (and flag) column truncation.
  const width = Math.min(records.reduce((m, r) => Math.max(m, r.length), 0), MAX_COLS + 1);
  const cells = records.map((r) => {
    const cellRow = (r.length > width ? r.slice(0, width) : r).map((t) => ({ text: t }));
    while (cellRow.length < width) cellRow.push({ text: "" });
    return cellRow;
  });
  const { rows, truncated } = applyLimits(cells);
  return { name: "Sheet1", rows, columnWidths: [], truncated };
}
