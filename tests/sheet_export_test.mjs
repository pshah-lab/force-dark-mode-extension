// tests/sheet_export_test.mjs — CSV serializer, JSON export and the minimal XLSX writer.
import assert from "assert";
import { toCsv, sheetToMatrix, workbookToJson } from "../src/viewer/convert/csvWriter.js";
import { createXlsx, sanitizeSheetNames } from "../src/viewer/convert/xlsxWriter.js";
import { parseCsv } from "../src/viewer/spreadsheet/csvParser.js";
import { parseXlsx } from "../src/viewer/spreadsheet/xlsxParser.js";
import { readZipEntryText } from "../src/shared/zipReader.js";

console.log("=========================================");
console.log("📤 Running Spreadsheet Export Tests");
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

await test("toCsv quotes only fields that need it (RFC 4180) and uses CRLF", () => {
  const csv = toCsv([["a", "b,c", 'say "hi"', "l1\nl2", "cr\r"], ["1", "", null, 2]]);
  assert.strictEqual(csv, 'a,"b,c","say ""hi""","l1\nl2","cr\r"\r\n1,,,2\r\n');
  assert.strictEqual(toCsv([]), "");
});

await test("toCsv keeps formula-like values faithful (no injection rewriting)", () => {
  assert.strictEqual(toCsv([["=1+1", "+x", "-y", "@z"]]), "=1+1,+x,-y,@z\r\n");
});

await test("toCsv round-trips through the existing CSV parser, Unicode included", () => {
  const rows = [["名前", "emoji 🌙", 'q"uote'], ["multi\r\nline", ",", ""]];
  assert.deepStrictEqual(texts(parseCsv(toCsv(rows))), rows);
});

await test("sheetToMatrix pulls display text and fills sparse cells", () => {
  const sheet = { name: "S", rows: [[{ text: "a" }, null, { text: "c" }], []] };
  assert.deepStrictEqual(sheetToMatrix(sheet), [["a", "", "c"], []]);
});

await test("workbookToJson emits sheet names and string rows", () => {
  const json = workbookToJson({ sheets: [{ name: "One", rows: [[{ text: "x" }, { text: "1" }]] }] });
  assert.deepStrictEqual(JSON.parse(json), { sheets: [{ name: "One", rows: [["x", "1"]] }] });
});

await test("sanitizeSheetNames strips forbidden chars, caps at 31 and de-duplicates", () => {
  const names = sanitizeSheetNames(["a/b:c", "", "x".repeat(40), "Data", "data", "'quoted'"]);
  assert.strictEqual(names[0], "a_b_c");
  assert.strictEqual(names[1], "Sheet2");
  assert.strictEqual(names[2].length, 31);
  assert.strictEqual(names[3], "Data");
  assert.notStrictEqual(names[4].toLowerCase(), "data");
  assert.ok(names[4].length <= 31);
  assert.ok(!names[5].startsWith("'") && !names[5].endsWith("'"));
});

await test("createXlsx round-trips through the existing xlsx parser", async () => {
  const bytes = createXlsx([
    { name: "First", rows: [["Name", "Qty"], ["Ünïcödé 🌙", "42"], ["", "3.5"]] },
    { name: "Second", rows: [["<b>&amp;</b>", 'He said "hi"']] },
  ]);
  const wb = await parseXlsx(bytes);
  assert.deepStrictEqual(wb.sheets.map((s) => s.name), ["First", "Second"]);
  assert.deepStrictEqual(texts(wb.sheets[0]), [["Name", "Qty"], ["Ünïcödé 🌙", "42"], ["", "3.5"]]);
  assert.deepStrictEqual(texts(wb.sheets[1]), [["<b>&amp;</b>", 'He said "hi"']]);
});

await test("createXlsx writes plain numbers as numeric cells but keeps codes and formulas as text", async () => {
  const bytes = createXlsx([{ name: "S", rows: [["42", "007", "=SUM(A1)", "1e3", "12345678901234567890"]] }]);
  const xml = await readZipEntryText(bytes, "xl/worksheets/sheet1.xml");
  assert.ok(/<c r="A1"[^>]*><v>42<\/v>/.test(xml), "42 is numeric");
  assert.ok(!xml.includes("<f>"), "never writes formulas");
  const wb = await parseXlsx(bytes);
  assert.deepStrictEqual(texts(wb.sheets[0]), [["42", "007", "=SUM(A1)", "1e3", "12345678901234567890"]]);
});

await test("createXlsx escapes markup and drops XML-invalid control characters", async () => {
  const bytes = createXlsx([{ name: "S", rows: [["a\u0001b", "</t></si><evil/>"]] }]);
  const shared = await readZipEntryText(bytes, "xl/sharedStrings.xml");
  assert.ok(!shared.includes("<evil/>"));
  assert.ok(!shared.includes("\u0001"));
  const wb = await parseXlsx(bytes);
  assert.deepStrictEqual(texts(wb.sheets[0]), [["a�b", "</t></si><evil/>"]]);
});

await test("createXlsx contains the required OOXML parts", async () => {
  const bytes = createXlsx([{ name: "S", rows: [] }]);
  for (const part of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/sharedStrings.xml", "xl/worksheets/sheet1.xml"]) {
    assert.ok((await readZipEntryText(bytes, part)) !== null, `missing ${part}`);
  }
});

console.log(`\n🎉 Spreadsheet export tests complete. Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
