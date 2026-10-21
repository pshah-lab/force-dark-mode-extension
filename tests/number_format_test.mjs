// tests/number_format_test.mjs
import assert from "assert";
import { BUILTIN_FORMATS, getFormatCode, formatCellValue } from "../src/viewer/spreadsheet/numberFormat.js";

console.log("=========================================");
console.log("🔢 Running Number Format Tests");
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

// BUILTIN_FORMATS / getFormatCode
await test("has the ECMA-376 builtin ids", () => {
  const ids = [...Array(23).keys(), 37, 38, 39, 40, 45, 46, 47, 48, 49].filter((i) => ![5, 6, 7, 8].includes(i));
  for (const id of ids) assert.strictEqual(typeof BUILTIN_FORMATS[id], "string", `id ${id}`);
  assert.strictEqual(BUILTIN_FORMATS[0], "General");
  assert.strictEqual(BUILTIN_FORMATS[9], "0%");
  assert.strictEqual(BUILTIN_FORMATS[14], "m/d/yyyy");
  assert.strictEqual(BUILTIN_FORMATS[22], "m/d/yyyy h:mm");
});

await test("prefers custom formats, then builtin, then General", () => {
  assert.strictEqual(getFormatCode(164, { 164: "yyyy-mm-dd" }), "yyyy-mm-dd");
  assert.strictEqual(getFormatCode(2, {}), "0.00");
  assert.strictEqual(getFormatCode(999, {}), "General");
  assert.strictEqual(getFormatCode(3, undefined), "#,##0");
});

// formatCellValue numbers
const cases = [
  [1, "General", "1"],
  [1.5, "General", "1.5"],
  [0.1 + 0.2, "General", "0.3"],
  [-42, "General", "-42"],
  [1234.5678, "0", "1235"],
  [3.14159, "0.00", "3.14"],
  [1234567.89, "#,##0", "1,234,568"],
  [1234.5, "#,##0.00", "1,234.50"],
  [0.5, "0%", "50%"],
  [0.1234, "0.00%", "12.34%"],
  [1234.5, "$#,##0.00", "$1,234.50"],
  [5, "#,##0;(#,##0)", "5"],
  [-5, "#,##0;(#,##0)", "(5)"],
  [-5, "0.00", "-5.00"],
  [1234, "[Red]#,##0;(0)", "1,234"],
  [-1234, "[Red]#,##0;[Red](#,##0)", "(1,234)"],
  [12, "0 \"units\"", "12 units"],
  [12345, "0.00E+00", "1.23E+04"],
];
for (const [v, code, out] of cases) {
  await test(`${v} with ${code} -> ${out}`, () => {
    assert.strictEqual(formatCellValue(v, code), out);
  });
}

await test("scales percents without float error", () => {
  assert.strictEqual(formatCellValue(0.145, "0%"), "15%");
  assert.strictEqual(formatCellValue(0.285, "0%"), "29%");
  assert.strictEqual(formatCellValue(0.0725, "0.0%"), "7.3%");
});

await test("renders empty sections as empty strings", () => {
  assert.strictEqual(formatCellValue(5, ";;;"), "");
  assert.strictEqual(formatCellValue(-5, ";;;"), "");
  assert.strictEqual(formatCellValue(0, ";;;"), "");
  assert.strictEqual(formatCellValue(-5, "0;"), "");
  assert.strictEqual(formatCellValue(5, "0;"), "5");
});

await test("non-finite values become strings", () => {
  assert.strictEqual(formatCellValue(Infinity, "0.00"), "Infinity");
  assert.strictEqual(formatCellValue(NaN, "General"), "NaN");
});

await test("never throws on odd codes", () => {
  for (const code of ["", ";;;", "[", "\"abc", "# ?/?", "@", "[>100]0;0", "zzz"]) {
    assert.doesNotThrow(() => formatCellValue(12.5, code));
  }
});

// formatCellValue dates
await test("formats serial 45000 as 2023-03-15", () => {
  assert.strictEqual(formatCellValue(45000, "yyyy-mm-dd"), "2023-03-15");
  assert.strictEqual(formatCellValue(45000, "m/d/yyyy"), "3/15/2023");
  assert.strictEqual(formatCellValue(45000, "d-mmm-yy"), "15-Mar-23");
  assert.strictEqual(formatCellValue(45000, "mmmm d, yyyy"), "March 15, 2023");
  assert.strictEqual(formatCellValue(45000, "dddd"), "Wednesday");
});

await test("formats times", () => {
  assert.strictEqual(formatCellValue(0.5, "h:mm"), "12:00");
  assert.strictEqual(formatCellValue(0.75, "h:mm AM/PM"), "6:00 PM");
  assert.strictEqual(formatCellValue(0.5 + 30 / 1440 + 5 / 86400, "hh:mm:ss"), "12:30:05");
  assert.strictEqual(formatCellValue(45000.5, "yyyy-mm-dd hh:mm"), "2023-03-15 12:00");
  assert.strictEqual(formatCellValue(90 / 1440, "mm:ss"), "30:00");
});

await test("treats m as month otherwise", () => {
  assert.strictEqual(formatCellValue(45000, "mm"), "03");
});

await test("handles the 1900 leap-year quirk", () => {
  assert.strictEqual(formatCellValue(1, "yyyy-mm-dd"), "1900-01-01");
  assert.strictEqual(formatCellValue(59, "yyyy-mm-dd"), "1900-02-28");
  assert.strictEqual(formatCellValue(60, "yyyy-mm-dd"), "1900-02-29");
  assert.strictEqual(formatCellValue(61, "yyyy-mm-dd"), "1900-03-01");
});

await test("shifts the epoch for the 1904 system by 1462 days", () => {
  assert.strictEqual(formatCellValue(0, "yyyy-mm-dd", { date1904: true }), "1904-01-01");
  assert.strictEqual(formatCellValue(45000 - 1462, "yyyy-mm-dd", { date1904: true }), "2023-03-15");
});

await test("quoted text is not a date token", () => {
  assert.strictEqual(formatCellValue(45000, "yyyy \"day\""), "2023 day");
});

// Bracket tags: colours, conditions and locale are dropped, [$sym-loc] keeps its symbol, [h]/[m]/[s] stay.
await test("bracket tags: strips colour/condition/locale tags and keeps currency text", () => {
  assert.strictEqual(formatCellValue(1234.5, "[$\u20ac-407]#,##0.00"), "\u20ac1,234.50");
  assert.strictEqual(formatCellValue(1234.5, "[$USD]#,##0"), "USD1,235");
  assert.strictEqual(formatCellValue(1234.5, "[$-409]#,##0"), "1,235");
  assert.strictEqual(formatCellValue(1234.5, "[$]#,##0"), "1,235");
  assert.strictEqual(formatCellValue(1234.5, "[Blue][>100]#,##0"), "1,235");
  assert.strictEqual(formatCellValue(45000, "[$-F800]dddd, mmmm dd, yyyy"), "Wednesday, March 15, 2023");
});

await test("bracket tags: elapsed markers survive, case-insensitively", () => {
  assert.strictEqual(formatCellValue(1.5, "[h]:mm:ss"), "36:00:00");
  assert.strictEqual(formatCellValue(1.5, "[HH]:MM:SS"), "36:00:00");
  assert.strictEqual(formatCellValue(1.5 + 30 / 1440, "[hh]:[mm]"), "36:2190");
  assert.strictEqual(formatCellValue(90 / 1440, "[mm]:ss"), "90:00");
  assert.strictEqual(formatCellValue(1.5, "[Red][h]:mm"), "36:00");
});

await test("bracket tags: an unterminated [ is literal text", () => {
  assert.strictEqual(formatCellValue(12, "0[abc"), "12[abc");
  assert.strictEqual(formatCellValue(12, "0[$abc"), "12[$abc");
  assert.strictEqual(formatCellValue(12, "[Red]0[x"), "12[x");
  assert.strictEqual(formatCellValue(12, "[$X]0[$Z"), "X12[$Z");
});

// Format-code length cap (Excel's own limit is 255): longer codes are not interpreted.
await test("format code over 255 characters falls back to General", () => {
  assert.strictEqual(formatCellValue(1234.5, "0.00" + "x".repeat(300)), "1234.5");
  assert.strictEqual(formatCellValue(45000, "yyyy-mm-dd" + " ".repeat(300)), "45000");
});

await test("format code of exactly 255 characters is still interpreted", () => {
  const code = "0.00" + "\"" + "x".repeat(249) + "\"";
  assert.strictEqual(code.length, 255);
  assert.strictEqual(formatCellValue(3.14159, code), "3.14" + "x".repeat(249));
});

// Hostile formatCode regressions: a 255-character code (the largest accepted) of unterminated '[' / '[$'
// tags used to cost several times a benign code of the same length in every numeric cell, and one workbook
// can hold millions of cells. Each hostile code is timed against the same code with its '[' swapped for a
// neutral letter (identical length and tokenising work, no brackets); the ratio keeps the test machine-independent.
const HOSTILE_CODES = [
  "[".repeat(255),
  "[$".repeat(127),
  "[$-".repeat(85),
  "[h".repeat(127),
  "[$[".repeat(85),
  "0[".repeat(127),
];
const timeCells = (code, cells) => {
  const t0 = performance.now();
  for (let i = 0; i < cells; i++) formatCellValue(i + 0.5, code);
  return performance.now() - t0;
};
for (const code of HOSTILE_CODES) {
  await test(`hostile format code costs no more per cell than a benign one: ${JSON.stringify(code.slice(0, 8))}... (${code.length} chars)`, () => {
    assert.ok(code.length <= 255);
    const benign = code.replaceAll("[", "x");
    const cells = 4000;
    timeCells(code, cells);
    timeCells(benign, cells);
    let hostileMs = Infinity;
    let benignMs = Infinity;
    for (let rep = 0; rep < 5; rep++) {
      hostileMs = Math.min(hostileMs, timeCells(code, cells));
      benignMs = Math.min(benignMs, timeCells(benign, cells));
    }
    assert.ok(hostileMs < benignMs * 1.6 + 5, `hostile ${hostileMs.toFixed(1)}ms vs benign ${benignMs.toFixed(1)}ms for ${cells} cells`);
  });
}

console.log("\n=========================================");
console.log(`🎉 Number Format Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
