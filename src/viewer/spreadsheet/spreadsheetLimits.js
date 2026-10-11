export const MAX_ROWS = 5000;
export const MAX_COLS = 50;
export const MAX_CELLS = 100000;
export const MAX_SHEETS = 50;
export const MAX_CSV_BYTES = 64 * 1024 * 1024;

export function applyLimits(rows) {
  let truncated = false;
  let out = rows;
  if (out.length > MAX_ROWS) {
    out = out.slice(0, MAX_ROWS);
    truncated = true;
  }
  out = out.map((r) => {
    if (r.length > MAX_COLS) {
      truncated = true;
      return r.slice(0, MAX_COLS);
    }
    return r;
  });
  let total = 0;
  const kept = [];
  for (const r of out) {
    if (total + r.length > MAX_CELLS) {
      truncated = true;
      break;
    }
    total += r.length;
    kept.push(r);
  }
  return { rows: kept, truncated };
}
