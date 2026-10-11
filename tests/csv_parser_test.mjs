// tests/csv_parser_test.mjs
import assert from "assert";
import { parseCsv } from "../src/viewer/spreadsheet/csvParser.js";
import { MAX_ROWS, MAX_COLS, MAX_CELLS } from "../src/viewer/spreadsheet/spreadsheetLimits.js";

console.log("=========================================");
console.log("📊 Running CSV Parser Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

const texts = (sheet) => sheet.rows.map((r) => r.map((c) => c.text));

await test("parses a simple table", () => {
  const s = parseCsv("a,b,c\n1,2,3");
  assert.strictEqual(s.name, "Sheet1");
  assert.deepStrictEqual(s.columnWidths, []);
  assert.strictEqual(s.truncated, false);
  assert.deepStrictEqual(texts(s), [["a", "b", "c"], ["1", "2", "3"]]);
});

await test("handles quoted fields with commas, \"\" escapes and embedded newlines", () => {
  const s = parseCsv("\"a,b\",\"say \"\"hi\"\"\",\"line1\nline2\"\nx,y,z");
  assert.deepStrictEqual(texts(s), [["a,b", "say \"hi\"", "line1\nline2"], ["x", "y", "z"]]);
});

await test("strips a UTF-8 BOM", () => {
  assert.deepStrictEqual(texts(parseCsv("﻿a,b\n1,2"))[0], ["a", "b"]);
});

await test("handles \\r\\n and \\n", () => {
  assert.deepStrictEqual(texts(parseCsv("a,b\r\n1,2\n3,4\r\n")), [["a", "b"], ["1", "2"], ["3", "4"]]);
});

await test("no phantom row for a trailing newline", () => {
  assert.strictEqual(parseCsv("a,b\n1,2\n").rows.length, 2);
});

await test("pads ragged rows to equal length", () => {
  const s = parseCsv("a,b,c\n1\n1,2,3,4");
  assert.deepStrictEqual(texts(s), [["a", "b", "c", ""], ["1", "", "", ""], ["1", "2", "3", "4"]]);
});

await test("empty text → one empty sheet (rows: [])", () => {
  const s = parseCsv("");
  assert.deepStrictEqual(s.rows, []);
  assert.strictEqual(s.name, "Sheet1");
});

await test("truncates at 5,000 rows and sets truncated", () => {
  const s = parseCsv(Array.from({ length: MAX_ROWS + 10 }, (_, i) => `r${i}`).join("\n"));
  assert.strictEqual(s.rows.length, MAX_ROWS);
  assert.strictEqual(s.truncated, true);
});

await test("truncates at 50 columns", () => {
  const s = parseCsv(Array.from({ length: MAX_COLS + 5 }, (_, i) => i).join(",") + "\n1");
  assert.strictEqual(s.rows[0].length, MAX_COLS);
  assert.strictEqual(s.truncated, true);
});

await test("truncates at 100,000 cells", () => {
  const row = Array.from({ length: 40 }, () => "x").join(",");
  const s = parseCsv(Array.from({ length: 3000 }, () => row).join("\n"));
  const cells = s.rows.reduce((n, r) => n + r.length, 0);
  assert.ok(cells <= MAX_CELLS);
  assert.strictEqual(s.truncated, true);
});

await test("does not blow up on a very wide first line followed by many short rows", () => {
  const wide = Array.from({ length: 100000 }, () => "a").join(",");
  const text = wide + "\n" + Array.from({ length: 5000 }, () => "x").join("\n");
  const t0 = performance.now();
  const s = parseCsv(text);
  assert.ok(performance.now() - t0 < 1500);
  assert.strictEqual(s.truncated, true);
  assert.ok(s.rows.length > 0);
  for (const r of s.rows) assert.ok(r.length <= MAX_COLS);
});

await test("a wide-only file truncates columns", () => {
  const s = parseCsv(Array.from({ length: 100000 }, () => "a").join(","));
  assert.strictEqual(s.rows.length, 1);
  assert.strictEqual(s.rows[0].length, MAX_COLS);
  assert.strictEqual(s.truncated, true);
});

await test("exactly 5,000 rows (20 cols) is not truncated", () => {
  const row = Array.from({ length: 20 }, () => "1").join(",");
  const s = parseCsv(Array.from({ length: MAX_ROWS }, () => row).join("\n"));
  assert.strictEqual(s.rows.length, MAX_ROWS);
  assert.strictEqual(s.truncated, false);
});

await test("exactly 50 columns (2,000 rows, within the cell cap) is not truncated", () => {
  const row = Array.from({ length: MAX_COLS }, () => "1").join(",");
  const s = parseCsv(Array.from({ length: 2000 }, () => row).join("\n"));
  assert.strictEqual(s.rows[0].length, MAX_COLS);
  assert.strictEqual(s.truncated, false);
});

await test("stops collecting records past the row cap", () => {
  const s = parseCsv(Array.from({ length: MAX_ROWS + 1 }, () => "a").join("\n"));
  assert.strictEqual(s.rows.length, MAX_ROWS);
  assert.strictEqual(s.truncated, true);
});

console.log("\n=========================================");
console.log(`🎉 CSV Parser Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
