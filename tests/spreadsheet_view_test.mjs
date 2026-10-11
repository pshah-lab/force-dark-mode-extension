// tests/spreadsheet_view_test.mjs
import assert from "assert";
import { columnLetters, buildSheetView } from "../src/viewer/spreadsheet/spreadsheetView.js";
import { mapCellColors } from "../src/viewer/spreadsheet/cellColors.js";

console.log("=========================================");
console.log("📊 Running Spreadsheet View Model Tests");
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

const cell = (text, extra = {}) => ({ text, ...extra });
const sheet = (rows, extra = {}) => ({ name: "S", rows, ...extra });

await test("columnLetters maps indexes to spreadsheet letters", () => {
  assert.strictEqual(columnLetters(0), "A");
  assert.strictEqual(columnLetters(25), "Z");
  assert.strictEqual(columnLetters(26), "AA");
  assert.strictEqual(columnLetters(27), "AB");
  assert.strictEqual(columnLetters(49), "AX");
  assert.strictEqual(columnLetters(51), "AZ");
  assert.strictEqual(columnLetters(52), "BA");
  assert.strictEqual(columnLetters(701), "ZZ");
  assert.strictEqual(columnLetters(702), "AAA");
});

await test("builds rows with text and column count from the widest row", () => {
  const v = buildSheetView(sheet([[cell("a"), cell("b")], [cell("c")]]), { mode: "smart" });
  assert.strictEqual(v.columnCount, 2);
  assert.strictEqual(v.rows.length, 2);
  assert.strictEqual(v.rows[0][0].text, "a");
  assert.strictEqual(v.rows[0][1].text, "b");
  assert.strictEqual(v.rows[1].length, 1);
  assert.strictEqual(v.empty, null);
  assert.strictEqual(v.notice, null);
});

await test("covered and missing cells become null", () => {
  const v = buildSheetView(
    sheet([
      [cell("m", { colspan: 2, rowspan: 2 }), cell("", { covered: true })],
      [cell("", { covered: true }), null],
    ]),
    { mode: "smart" }
  );
  assert.strictEqual(v.rows[0][1], null);
  assert.strictEqual(v.rows[1][0], null);
  assert.strictEqual(v.rows[1][1], null);
  assert.strictEqual(v.rows[0][0].colspan, 2);
  assert.strictEqual(v.rows[0][0].rowspan, 2);
});

await test("plain cells carry no span values above 1", () => {
  const v = buildSheetView(sheet([[cell("x")]]), { mode: "smart" });
  assert.ok(!(v.rows[0][0].colspan > 1));
  assert.ok(!(v.rows[0][0].rowspan > 1));
});

await test("bold, italic and align become style properties; absent otherwise", () => {
  const v = buildSheetView(
    sheet([[cell("a", { bold: true, italic: true, align: "right" }), cell("b")]]),
    { mode: "smart" }
  );
  assert.strictEqual(v.rows[0][0].style.fontWeight, "bold");
  assert.strictEqual(v.rows[0][0].style.fontStyle, "italic");
  assert.strictEqual(v.rows[0][0].style.textAlign, "right");
  assert.ok(!("fontWeight" in v.rows[0][1].style));
  assert.ok(!("fontStyle" in v.rows[0][1].style));
  assert.ok(!("textAlign" in v.rows[0][1].style));
});

await test("cell colours come from mapCellColors and differ between smart and original", () => {
  const c = cell("a", { fill: "#ffff00", color: "#ff0000" });
  const settings = { backgroundColor: "#202020", textColor: "#dddddd" };
  const smart = buildSheetView(sheet([[c]]), { mode: "smart", ...settings });
  const orig = buildSheetView(sheet([[c]]), { mode: "original", ...settings });
  const expectedSmart = mapCellColors(c, "smart", settings);
  assert.strictEqual(smart.rows[0][0].style.background, expectedSmart.background);
  assert.strictEqual(smart.rows[0][0].style.color, expectedSmart.color);
  assert.strictEqual(orig.rows[0][0].style.background, "#ffff00");
  assert.strictEqual(orig.rows[0][0].style.color, "#ff0000");
  assert.notStrictEqual(smart.rows[0][0].style.background, orig.rows[0][0].style.background);
});

await test("header and container colours follow mode and palette", () => {
  const settings = { mode: "smart", backgroundColor: "#202020", textColor: "#dddddd" };
  const v = buildSheetView(sheet([[cell("a")]]), settings);
  const h = mapCellColors({ fill: "#f0f0f0", color: "#444444" }, "smart", settings);
  assert.deepStrictEqual(v.header, { background: h.background, color: h.color });
  assert.strictEqual(v.container, mapCellColors({}, "smart", settings).background);
  const o = buildSheetView(sheet([[cell("a")]]), { mode: "original" });
  assert.deepStrictEqual(o.header, { background: "#f0f0f0", color: "#444444" });
  assert.strictEqual(o.container, "#ffffff");
});

await test("defaults to smart mode when settings are missing or partial", () => {
  const expected = mapCellColors({ fill: "#ffff00" }, "smart", {});
  const a = buildSheetView(sheet([[cell("a", { fill: "#ffff00" })]]), undefined);
  const b = buildSheetView(sheet([[cell("a", { fill: "#ffff00" })]]), {});
  assert.strictEqual(a.rows[0][0].style.background, expected.background);
  assert.strictEqual(b.rows[0][0].style.background, expected.background);
  assert.notStrictEqual(a.rows[0][0].style.background, "#ffff00");
});

await test("column widths pass through", () => {
  const v = buildSheetView(sheet([[cell("a"), cell("b")]], { columnWidths: [12, undefined] }), {});
  assert.strictEqual(v.columnWidths[0], 12);
  assert.ok(!v.columnWidths[1]);
  const w = buildSheetView(sheet([[cell("a")]]), {});
  assert.ok(Array.isArray(w.columnWidths));
});

await test("truncation notice has the exact text when truncated and non-empty", () => {
  const v = buildSheetView(sheet([[cell("a"), cell("b"), cell("c")], [cell("d")]], { truncated: true }), {});
  assert.strictEqual(v.notice, "Showing the first 2 rows and 3 columns of this sheet.");
});

await test("no notice when the sheet is not truncated", () => {
  const v = buildSheetView(sheet([[cell("a")]], { truncated: false }), {});
  assert.strictEqual(v.notice, null);
});

await test("no notice when truncated but the grid is empty", () => {
  const a = buildSheetView(sheet([], { truncated: true }), {});
  assert.strictEqual(a.notice, null);
  assert.strictEqual(a.empty, "empty");
  const b = buildSheetView(sheet([[], []], { truncated: true }), {});
  assert.strictEqual(b.notice, null);
  assert.strictEqual(b.empty, "empty");
});

await test("empty and tooLarge states", () => {
  assert.strictEqual(buildSheetView(sheet([]), {}).empty, "empty");
  assert.strictEqual(buildSheetView(sheet([[]]), {}).empty, "empty");
  assert.strictEqual(buildSheetView(sheet([], { tooLarge: true }), {}).empty, "tooLarge");
  assert.strictEqual(buildSheetView(sheet([[cell("a")]]), {}).empty, null);
});

console.log(`\n🎉 Spreadsheet view model tests complete. Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
