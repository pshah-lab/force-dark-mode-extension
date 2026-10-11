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

console.log("\n=========================================");
console.log(`🎉 Number Format Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
