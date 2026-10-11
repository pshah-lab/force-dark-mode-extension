// tests/xlsx_parser_test.mjs
import assert from "assert";
import { makeZip } from "./helpers/zip.mjs";
import { parseXlsx } from "../src/viewer/spreadsheet/xlsxParser.js";
import { MAX_ROWS } from "../src/viewer/spreadsheet/spreadsheetLimits.js";
import { formatCellValue } from "../src/viewer/spreadsheet/numberFormat.js";

console.log("=========================================");
console.log("📗 Running XLSX Parser Tests");
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

// Equivalent of Vitest's toMatchObject for flat objects: every expected key must match.
function assertMatch(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepStrictEqual(actual[key], value, `property "${key}"`);
  }
}

async function assertRejectsWithCode(promise, code) {
  let error = null;
  try {
    await promise;
  } catch (err) {
    error = err;
  }
  assert.ok(error, "expected the promise to reject");
  assert.strictEqual(error.code, code);
}

const NS = "xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"";

function workbook({ sheets = [["Sheet1", "sheet1.xml"]], pr = "", absolute = false, extra = {} } = {}) {
  const files = {
    "xl/workbook.xml": `<workbook ${NS}>${pr}<sheets>${sheets
      .map(([n], i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships>${sheets
      .map(([, f], i) => `<Relationship Id="rId${i + 1}" Type="x" Target="${absolute ? "/xl/worksheets/" : "worksheets/"}${f}"/>`)
      .join("")}</Relationships>`,
    ...extra,
  };
  return files;
}
const sheetXml = (data, rest = "", before = "") =>
  `<worksheet ${NS}>${before}<sheetData>${data}</sheetData>${rest}</worksheet>`;

async function one(sheet, extra = {}, opts = {}, parseOpts = undefined) {
  const files = workbook({ ...opts, extra: { "xl/worksheets/sheet1.xml": sheet, ...extra } });
  return parseXlsx(makeZip(files), parseOpts);
}

await test("reads sheet names and order from workbook.xml + rels", async () => {
  const files = workbook({
    sheets: [["Second", "b.xml"], ["First", "a.xml"]],
    absolute: true,
    extra: {
      "xl/worksheets/a.xml": sheetXml("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>a</t></is></c></row>"),
      "xl/worksheets/b.xml": sheetXml("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>b</t></is></c></row>"),
    },
  });
  const r = await parseXlsx(makeZip(files));
  assert.deepStrictEqual(r.sheets.map((s) => s.name), ["Second", "First"]);
  assert.strictEqual(r.sheets[0].rows[0][0].text, "b");
  assert.strictEqual(r.sheets[1].rows[0][0].text, "a");
  assert.strictEqual(r.truncated, false);
});

await test("shared strings and inline strings", async () => {
  const r = await one(
    sheetXml("<row r=\"1\"><c r=\"A1\" t=\"s\"><v>1</v></c><c r=\"B1\" t=\"inlineStr\"><is><t>inl</t></is></c><c r=\"C1\" t=\"str\"><v>fs</v></c></row>"),
    { "xl/sharedStrings.xml": "<sst><si><t>zero</t></si><si><t>one</t></si></sst>" },
  );
  assert.deepStrictEqual(r.sheets[0].rows[0].map((c) => c.text), ["one", "inl", "fs"]);
});

await test("rich-text shared string runs are concatenated, xml:space preserve kept, entities decoded", async () => {
  const r = await one(sheetXml("<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"s\"><v>1</v></c></row>"), {
    "xl/sharedStrings.xml":
      "<sst><si><r><t>Hello </t></r><r><rPr><b/></rPr><t xml:space=\"preserve\"> &amp; world</t></r><rPh><t>PHON</t></rPh></si><si><t xml:space=\"preserve\">  pad  </t></si></sst>",
  });
  assert.strictEqual(r.sheets[0].rows[0][0].text, "Hello  & world");
  assert.strictEqual(r.sheets[0].rows[0][1].text, "  pad  ");
});

await test("numbers use the style's format (percent, date, thousands)", async () => {
  const styles =
    "<styleSheet><cellXfs count=\"4\"><xf numFmtId=\"0\"/><xf numFmtId=\"9\"/><xf numFmtId=\"14\"/><xf numFmtId=\"3\"/></cellXfs></styleSheet>";
  const r = await one(
    sheetXml("<row r=\"1\"><c r=\"A1\"><v>12</v></c><c r=\"B1\" s=\"1\"><v>0.5</v></c><c r=\"C1\" s=\"2\"><v>45000</v></c><c r=\"D1\" s=\"3\"><v>1234567</v></c></row>"),
    { "xl/styles.xml": styles },
  );
  const row = r.sheets[0].rows[0];
  assert.strictEqual(row[0].text, "12");
  assert.strictEqual(row[1].text, "50%");
  assert.match(row[2].text, /2023/);
  assert.strictEqual(row[3].text, "1,234,567");
  assert.strictEqual(row[0].align, "right");
});

await test("booleans, error cells and formula cached values", async () => {
  const r = await one(
    sheetXml(
      "<row r=\"1\"><c r=\"A1\" t=\"b\"><v>1</v></c><c r=\"B1\" t=\"b\"><v>0</v></c><c r=\"C1\" t=\"e\"><v>#DIV/0!</v></c><c r=\"D1\"><f>1+2</f><v>3</v></c></row>",
    ),
  );
  assert.deepStrictEqual(r.sheets[0].rows[0].map((c) => c.text), ["TRUE", "FALSE", "#DIV/0!", "3"]);
});

await test("date1904 flag from workbookPr", async () => {
  const styles = "<styleSheet><cellXfs count=\"1\"><xf numFmtId=\"14\"/></cellXfs></styleSheet>";
  const sheet = sheetXml("<row r=\"1\"><c r=\"A1\" s=\"0\"><v>43000</v></c></row>");
  const a = await one(sheet, { "xl/styles.xml": styles });
  const b = await one(sheet, { "xl/styles.xml": styles }, { pr: "<workbookPr date1904=\"1\"/>" });
  assert.notStrictEqual(a.sheets[0].rows[0][0].text, b.sheets[0].rows[0][0].text);
});

await test("sparse cells keep grid position and skipped rows become empty rows", async () => {
  const r = await one(sheetXml("<row r=\"5\"><c r=\"C5\" t=\"inlineStr\"><is><t>x</t></is></c></row>"));
  const rows = r.sheets[0].rows;
  assert.strictEqual(rows.length, 5);
  assert.deepStrictEqual(rows[4].map((c) => c.text), ["", "", "x"]);
  assert.deepStrictEqual(rows[0].map((c) => c.text), ["", "", ""]);
});

await test("merge anchors get colspan/rowspan and covered cells are flagged", async () => {
  const r = await one(
    sheetXml("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>m</t></is></c></row><row r=\"2\"><c r=\"C2\" t=\"inlineStr\"><is><t>z</t></is></c></row>", "<mergeCells count=\"1\"><mergeCell ref=\"A1:C2\"/></mergeCells>"),
  );
  const rows = r.sheets[0].rows;
  assertMatch(rows[0][0], { text: "m", colspan: 3, rowspan: 2 });
  assert.strictEqual(rows[0][1].covered, true);
  assert.strictEqual(rows[1][0].covered, true);
  assert.strictEqual(rows[1][2].covered, true);
});

await test("column widths from <cols> ranges", async () => {
  const r = await one(
    sheetXml("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>x</t></is></c></row>", "", "<cols><col min=\"2\" max=\"4\" width=\"12.5\"/><col min=\"1\" max=\"1\" width=\"5\"/></cols>"),
  );
  const w = r.sheets[0].columnWidths;
  assert.strictEqual(w[0], 5);
  assert.strictEqual(w[1], 12.5);
  assert.strictEqual(w[3], 12.5);
});

await test("fills, fonts and alignment flow into cells", async () => {
  const styles =
    "<styleSheet><fonts count=\"2\"><font/><font><b/><i/><color rgb=\"FFFF0000\"/></font></fonts><fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF00FF00\"/></patternFill></fill></fills><cellXfs count=\"2\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\"/><xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\"><alignment horizontal=\"center\"/></xf></cellXfs></styleSheet>";
  const r = await one(sheetXml("<row r=\"1\"><c r=\"A1\" s=\"1\" t=\"inlineStr\"><is><t>x</t></is></c></row>"), { "xl/styles.xml": styles });
  const c = r.sheets[0].rows[0][0];
  assertMatch(c, { bold: true, italic: true, align: "center", fill: "#00ff00", color: "#ff0000" });
  const plain = (await one(sheetXml("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>x</t></is></c></row>"), { "xl/styles.xml": styles })).sheets[0].rows[0][0];
  assert.strictEqual("bold" in plain, false);
  assert.strictEqual("fill" in plain, false);
});

await test("cell cap: a 200,000-row sheet stops early", async () => {
  let data = "";
  for (let i = 1; i <= 200000; i++) data += `<row r="${i}"><c r="A${i}"><v>${i}</v></c></row>`;
  const r = await one(sheetXml(data));
  assert.strictEqual(r.truncated, true);
  assert.strictEqual(r.sheets[0].truncated, true);
  assert.ok(r.sheets[0].rows.length <= MAX_ROWS);
});

await test("does not scan past the caps (later malformed content is never reached)", async () => {
  let data = "";
  for (let i = 1; i <= MAX_ROWS + 1; i++) data += `<row r="${i}"><c r="A${i}"><v>1</v></c></row>`;
  const poisoned = data + "<row r=\"99999\"><c r=\"A99999\" t=\"s\"><v>" + "9".repeat(10) + "</v></c>";
  const r = await one(sheetXml(poisoned));
  assert.strictEqual(r.sheets[0].rows.length, MAX_ROWS);
  assert.strictEqual(r.sheets[0].truncated, true);
});

await test("a sheet part missing from the ZIP yields an empty sheet; others still parse", async () => {
  const files = workbook({
    sheets: [["Gone", "gone.xml"], ["Here", "sheet1.xml"]],
    extra: { "xl/worksheets/sheet1.xml": sheetXml("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>ok</t></is></c></row>") },
  });
  const r = await parseXlsx(makeZip(files));
  assert.deepStrictEqual(r.sheets[0].rows, []);
  assert.strictEqual(r.sheets[1].rows[0][0].text, "ok");
});

await test("missing workbook.xml -> NOT_XLSX", async () => {
  await assertRejectsWithCode(parseXlsx(makeZip({ "foo.txt": "x" })), "NOT_XLSX");
});

await test("empty worksheet -> rows: []", async () => {
  const r = await one(`<worksheet ${NS}><sheetData/></worksheet>`);
  assert.deepStrictEqual(r.sheets[0].rows, []);
});

await test("early stop is genuine: a cell past the cap is never processed", async () => {
  let data = "";
  for (let i = 1; i <= MAX_ROWS + 1; i++) data += `<row r="${i}"><c r="A${i}"><v>1</v></c></row>`;
  // 777777 is formatted (via the injected formatCellValue) only if this cell is actually processed.
  data += "<row r=\"9000\"><c r=\"A9000\"><v>777777</v></c></row>";
  const calls = [];
  // Counting spy wrapping the real implementation, injected through parseXlsx's formatCellValue option.
  const spy = (...args) => {
    calls.push(args[0]);
    return formatCellValue(...args);
  };
  const r = await one(sheetXml(data), {}, {}, { formatCellValue: spy });
  assert.strictEqual(r.truncated, true);
  assert.ok(r.sheets[0].rows.length <= MAX_ROWS);
  assert.ok(calls.length > 0); // the spy is live: early cells were formatted
  assert.strictEqual(calls.some((n) => n === 777777), false);
});

await test("malformed numeric entities render U+FFFD instead of rejecting the file", async () => {
  const cell = (ref, t) => `<c r="${ref}" t="inlineStr"><is><t>${t}</t></is></c>`;
  const r = await one(
    sheetXml(
      `<row r="1">${cell("A1", "a&#99999999;b")}${cell("B1", "&#xD800;")}${cell("C1", "&#xFFFFFFFF;")}${cell("D1", "&#65;&#x42;")}</row>`
    ),
    { "xl/sharedStrings.xml": `<sst ${NS}><si><t>&#1114112;</t></si></sst>` }
  );
  assert.deepStrictEqual(r.sheets[0].rows[0].map((c) => c.text), ["a�b", "�", "�", "AB"]);
});

await test("a malformed numeric entity in shared strings and attributes does not reject", async () => {
  const files = workbook({
    sheets: [["N&#99999999;", "sheet1.xml"]],
    extra: {
      "xl/sharedStrings.xml": `<sst ${NS}><si><t>x&#1114112;y</t></si></sst>`,
      "xl/worksheets/sheet1.xml": sheetXml("<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c></row>"),
    },
  });
  const r = await parseXlsx(makeZip(files));
  assert.strictEqual(r.sheets[0].name, "N�");
  assert.strictEqual(r.sheets[0].rows[0][0].text, "x�y");
});

await test("many empty open/close rows scan in linear time", async () => {
  let data = "<row r=\"1\"><c r=\"A1\"><v>1</v></c></row>";
  for (let i = 2; i <= 50000; i++) data += `<row r="${i}" spans="1:1"></row>`;
  const t0 = Date.now();
  const r = await one(sheetXml(data));
  assert.ok(Date.now() - t0 < 1500);
  assert.strictEqual(r.sheets[0].rows[0][0].text, "1");
});

await test("empty shared-string and boolean cells show nothing", async () => {
  const r = await one(
    sheetXml("<row r=\"1\"><c r=\"A1\" t=\"s\"/><c r=\"B1\" t=\"s\"><v></v></c><c r=\"C1\" t=\"b\"/><c r=\"D1\" t=\"b\"><v></v></c></row>"),
    { "xl/sharedStrings.xml": "<sst><si><t>zero</t></si></sst>" },
  );
  assert.deepStrictEqual(r.sheets[0].rows[0].map((c) => c.text), ["", "", "", ""]);
});

await test("self-closing <t/> with attributes contributes nothing", async () => {
  const r = await one(sheetXml("<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c></row>"), {
    "xl/sharedStrings.xml": "<sst><si><r><t xml:space=\"preserve\"/></r><r><t>abc</t></r></si></sst>",
  });
  assert.strictEqual(r.sheets[0].rows[0][0].text, "abc");
});

await test("truncated only flags dropped cells that have a value", async () => {
  const empty = await one(sheetXml("<row r=\"1\"><c r=\"A1\"><v>1</v></c><c r=\"BZ1\" s=\"0\"/></row><row r=\"5001\"><c r=\"A5001\" s=\"0\"/></row>"));
  assert.strictEqual(empty.truncated, false);
  assert.strictEqual(empty.sheets[0].truncated, false);
  const val = await one(sheetXml("<row r=\"1\"><c r=\"A1\"><v>1</v></c><c r=\"BZ1\"><v>5</v></c></row>"));
  assert.strictEqual(val.truncated, true);
  const inl = await one(sheetXml("<row r=\"1\"><c r=\"A1\"><v>1</v></c><c r=\"BZ1\" t=\"inlineStr\"><is><t>x</t></is></c></row>"));
  assert.strictEqual(inl.truncated, true);
});

await test("date1904 shifts actual dates", async () => {
  const styles = "<styleSheet><numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"yyyy-mm-dd\"/></numFmts><cellXfs count=\"1\"><xf numFmtId=\"164\"/></cellXfs></styleSheet>";
  const sheet = sheetXml("<row r=\"1\"><c r=\"A1\" s=\"0\"><v>43000</v></c></row>");
  const a = await one(sheet, { "xl/styles.xml": styles });
  const b = await one(sheet, { "xl/styles.xml": styles }, { pr: "<workbookPr date1904=\"1\"/>" });
  assert.strictEqual(a.sheets[0].rows[0][0].text, "2017-09-22");
  // 1904 serial 43000 == 1900 serial 44462 (offset 1462 days) == 2021-09-23
  assert.strictEqual(b.sheets[0].rows[0][0].text, "2021-09-23");
});

// oversize parts
const rowsXml = (n) =>
  Array.from({ length: n }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>row${i + 1}</t></is></c></row>`).join("");

await test("oversize parts: an oversize worksheet renders a bounded prefix and is flagged truncated", async () => {
  const files = workbook({ extra: { "xl/worksheets/sheet1.xml": sheetXml(rowsXml(300)) } });
  const r = await parseXlsx(makeZip(files), { maxEntrySize: 2000 });
  const sheet = r.sheets[0];
  assert.strictEqual(sheet.truncated, true);
  assert.strictEqual(r.truncated, true);
  assert.ok(sheet.rows.length > 5);
  assert.ok(sheet.rows.length < 300);
  assert.strictEqual(sheet.rows[0][0].text, "row1");
  assert.strictEqual(sheet.tooLarge, undefined);
});

await test("oversize parts: an oversize worksheet whose prefix holds no cells is marked tooLarge, not plainly empty", async () => {
  const files = workbook({ extra: { "xl/worksheets/sheet1.xml": sheetXml("", "<!--" + "x".repeat(3000) + "-->", "<!--" + "y".repeat(2500) + "-->") } });
  const r = await parseXlsx(makeZip(files), { maxEntrySize: 2000 });
  assert.strictEqual(r.sheets[0].truncated, true);
  assert.strictEqual(r.sheets[0].tooLarge, true);
  assert.deepStrictEqual(r.sheets[0].rows, []);
});

await test("oversize parts: an oversize sharedStrings.xml rejects instead of blanking text cells", async () => {
  const si = Array.from({ length: 400 }, (_, i) => `<si><t>s${i}</t></si>`).join("");
  const files = workbook({
    extra: {
      "xl/sharedStrings.xml": `<sst ${NS}>${si}</sst>`,
      "xl/worksheets/sheet1.xml": sheetXml("<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c></row>"),
    },
  });
  await assertRejectsWithCode(parseXlsx(makeZip(files), { maxEntrySize: 2000 }), "TOO_LARGE");
});

await test("oversize parts: an oversize styles.xml rejects", async () => {
  const files = workbook({
    extra: {
      "xl/styles.xml": `<styleSheet ${NS}><!--${"z".repeat(3000)}--></styleSheet>`,
      "xl/worksheets/sheet1.xml": sheetXml("<row r=\"1\"><c r=\"A1\"><v>1</v></c></row>"),
    },
  });
  await assertRejectsWithCode(parseXlsx(makeZip(files), { maxEntrySize: 2000 }), "TOO_LARGE");
});

await test("reports sheetsCapped separately from per-sheet truncation", async () => {
  const files = workbook({
    sheets: [["A", "a.xml"], ["B", "b.xml"]],
    extra: {
      "xl/worksheets/a.xml": sheetXml("<row r=\"1\"><c r=\"A1\"><v>1</v></c></row>"),
      "xl/worksheets/b.xml": sheetXml(Array.from({ length: MAX_ROWS + 1 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>1</v></c></row>`).join("")),
    },
  });
  const r = await parseXlsx(makeZip(files));
  assert.strictEqual(r.truncated, true);
  assert.strictEqual(r.sheetsCapped, false);
  const many = workbook({ sheets: Array.from({ length: 51 }, (_, i) => [`S${i}`, `s${i}.xml`]) });
  assert.strictEqual((await parseXlsx(makeZip(many))).sheetsCapped, true);
});

// Hostile-XML timing regressions: each input is a few hundred KB of repeated
// unterminated markup that made the old regexes quadratic.
const budget = 1000;
const timed = async (files) => {
  const zip = makeZip(files);
  const t0 = performance.now();
  await parseXlsx(zip);
  return performance.now() - t0;
};
const wbWith = (sheet, extra = {}) => workbook({ extra: { "xl/worksheets/sheet1.xml": sheet, ...extra } });

await test("hostile XML stays linear: attribute name with no '=' (workbook <sheet>)", async () => {
  const files = workbook();
  files["xl/workbook.xml"] = `<workbook ${NS}><sheets><sheet ${"a".repeat(60000)}></sheets></workbook>`;
  files["xl/worksheets/sheet1.xml"] = sheetXml("");
  assert.ok((await timed(files)) < budget);
});

await test("hostile XML stays linear: unterminated <mergeCell ", async () => {
  const files = wbWith("<worksheet><sheetData/><mergeCells>" + "<mergeCell ".repeat(15000));
  assert.ok((await timed(files)) < budget);
});

await test("hostile XML stays linear: unterminated <row ", async () => {
  const files = wbWith("<worksheet><sheetData>" + "<row ".repeat(40000));
  assert.ok((await timed(files)) < budget);
});

await test("hostile XML stays linear: unterminated <c ", async () => {
  const files = wbWith("<worksheet><sheetData><row r=\"1\">" + "<c ".repeat(60000));
  assert.ok((await timed(files)) < budget);
});

await test("hostile XML stays linear: unclosed <si>", async () => {
  const files = wbWith(sheetXml(""), { "xl/sharedStrings.xml": `<sst ${NS}>` + "<si>".repeat(60000) });
  assert.ok((await timed(files)) < budget);
});

await test("hostile XML stays linear: unclosed <rPh>", async () => {
  const files = wbWith(sheetXml(""), { "xl/sharedStrings.xml": `<sst ${NS}><si>` + "<rPh>".repeat(60000) + "</si></sst>" });
  assert.ok((await timed(files)) < budget);
});

await test("hostile XML stays linear: unclosed <t>", async () => {
  const files = wbWith(sheetXml(""), { "xl/sharedStrings.xml": `<sst ${NS}><si>` + "<t>".repeat(60000) + "</si></sst>" });
  assert.ok((await timed(files)) < budget);
});

await test("hostile XML stays linear: unclosed <v> in a cell", async () => {
  const files = wbWith("<worksheet><sheetData><row r=\"1\"><c r=\"A1\">" + "<v>".repeat(60000) + "</c></row></sheetData></worksheet>");
  assert.ok((await timed(files)) < budget);
});

await test("hostile XML: still parses normal attributes, shared strings and phonetic runs", async () => {
  const files = wbWith(sheetXml("<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"s\"><v>1</v></c></row>"), {
    "xl/sharedStrings.xml": `<sst ${NS}><si><t>base</t><rPh sb="0" eb="1"><t>ph</t></rPh></si><si/></sst>`,
  });
  const r = await parseXlsx(makeZip(files));
  assert.deepStrictEqual(r.sheets[0].rows[0].map((c) => c.text), ["base", ""]);
});

await test("clamps column widths to 0-255", async () => {
  const r = await one(
    sheetXml(
      "<row r=\"1\"><c r=\"A1\"><v>1</v></c></row>",
      "",
      "<cols><col min=\"1\" max=\"1\" width=\"99999999\"/><col min=\"2\" max=\"2\" width=\"-40\"/><col min=\"3\" max=\"3\" width=\"12.5\"/></cols>"
    )
  );
  assert.deepStrictEqual(r.sheets[0].columnWidths.slice(0, 3), [255, 0, 12.5]);
});

console.log("\n=========================================");
console.log(`🎉 XLSX Parser Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
