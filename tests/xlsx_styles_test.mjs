// tests/xlsx_styles_test.mjs
import assert from "assert";
import { makeZip } from "./helpers/zip.mjs";
import { listZipEntryNames, readZipEntryText } from "../src/shared/zipReader.js";
import { parseThemeColors, applyTint, INDEXED_COLORS, parseStyles } from "../src/viewer/spreadsheet/xlsxStyles.js";

console.log("=========================================");
console.log("🎨 Running XLSX Styles Tests");
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

const THEME = `<a:theme><a:themeElements><a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="44546A"/></a:dk2>
<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
<a:accent1><a:srgbClr val="4472C4"/></a:accent1>
<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
<a:accent4><a:srgbClr val="FFC000"/></a:accent4>
<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
<a:accent6><a:srgbClr val="70AD47"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink>
<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme></a:themeElements></a:theme>`;

const wrap = (inner) => `<styleSheet>${inner}</styleSheet>`;

// makeZip
await test("makeZip round-trips through listZipEntryNames/readZipEntryText", async () => {
  const bytes = makeZip({ "a.txt": "hello", "dir/b.xml": "<x/>" });
  assert.deepStrictEqual(await listZipEntryNames(bytes), ["a.txt", "dir/b.xml"]);
  assert.strictEqual(await readZipEntryText(bytes, "dir/b.xml"), "<x/>");
});

// parseThemeColors
await test("parseThemeColors reads dk1/lt1/accent colours (srgbClr and sysClr lastClr)", () => {
  const c = parseThemeColors(THEME);
  assert.strictEqual(c.length, 12);
  assert.strictEqual(c[0], "#ffffff"); // lt1
  assert.strictEqual(c[1], "#000000"); // dk1
  assert.strictEqual(c[2], "#e7e6e6"); // lt2
  assert.strictEqual(c[3], "#44546a"); // dk2
  assert.strictEqual(c[4], "#4472c4");
  assert.strictEqual(c[9], "#70ad47");
  assert.strictEqual(c[10], "#0563c1");
  assert.strictEqual(c[11], "#954f72");
});

await test("parseThemeColors: missing theme gives the default palette without throwing", () => {
  for (const t of [null, "", "<nope/>"]) {
    const c = parseThemeColors(t);
    assert.strictEqual(c.length, 12);
    assert.strictEqual(c.every((h) => /^#[0-9a-f]{6}$/.test(h)), true);
  }
});

// applyTint
await test("applyTint lightens with positive tint and darkens with negative", () => {
  assert.strictEqual(applyTint("#808080", 0.5), "#c0c0c0");
  assert.strictEqual(applyTint("#808080", -0.5), "#404040");
  assert.strictEqual(applyTint("#123456", 0), "#123456");
});

// INDEXED_COLORS
await test("INDEXED_COLORS has the 64 standard entries", () => {
  assert.strictEqual(INDEXED_COLORS.length, 64);
  assert.strictEqual(INDEXED_COLORS[2], "#ff0000");
  assert.strictEqual(INDEXED_COLORS[63], "#333333");
});

// parseStyles
const theme = parseThemeColors(THEME);
const fillStyle = (fill) =>
  parseStyles(
    wrap(`<fills count="1">${fill}</fills><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0"/></cellXfs>`),
    theme,
  ).cellStyles[0];

await test("parseStyles resolves a solid fill rgb (ARGB)", () => {
  assert.strictEqual(fillStyle("<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFFF0000\"/></patternFill></fill>").fill, "#ff0000");
});

await test("parseStyles resolves a theme fill with tint", () => {
  const s = fillStyle("<fill><patternFill patternType=\"solid\"><fgColor theme=\"1\" tint=\"0.5\"/></patternFill></fill>");
  assert.strictEqual(s.fill, applyTint("#000000", 0.5));
  assert.strictEqual(s.fill, "#808080");
});

await test("parseStyles resolves indexed colour 10 to #ff0000", () => {
  assert.strictEqual(fillStyle("<fill><patternFill patternType=\"solid\"><fgColor indexed=\"10\"/></patternFill></fill>").fill, "#ff0000");
});

await test("parseStyles ignores gradient, none and non-solid fills", () => {
  assert.strictEqual(fillStyle("<fill><gradientFill><stop position=\"0\"><color rgb=\"FFFF0000\"/></stop></gradientFill></fill>").fill, undefined);
  assert.strictEqual(fillStyle("<fill><patternFill patternType=\"none\"/></fill>").fill, undefined);
  assert.strictEqual(fillStyle("<fill><patternFill patternType=\"gray125\"><fgColor rgb=\"FFFF0000\"/></patternFill></fill>").fill, undefined);
});

await test("parseStyles reads font bold/italic/color", () => {
  const xml = wrap(
    "<fonts count=\"2\"><font><sz val=\"11\"/></font><font><b/><i val=\"1\"/><color rgb=\"FF00FF00\"/></font></fonts>" +
      "<cellXfs count=\"2\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\"/><xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\"/></cellXfs>",
  );
  const [a, b] = parseStyles(xml, theme).cellStyles;
  assert.strictEqual(a.bold, false);
  assert.strictEqual(a.italic, false);
  assert.strictEqual(a.color, undefined);
  assert.strictEqual(b.bold, true);
  assert.strictEqual(b.italic, true);
  assert.strictEqual(b.color, "#00ff00");
});

await test("parseStyles: b val=0 is not bold", () => {
  const xml = wrap("<fonts><font><b val=\"0\"/></font></fonts><cellXfs><xf fontId=\"0\" numFmtId=\"0\"/></cellXfs>");
  assert.strictEqual(parseStyles(xml, theme).cellStyles[0].bold, false);
});

await test("parseStyles uses custom numFmt code for id >= 164, built-in otherwise", () => {
  const xml = wrap(
    "<numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"0.0&quot;x&quot;\"/></numFmts>" +
      "<cellXfs count=\"2\"><xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\"/><xf numFmtId=\"9\" fontId=\"0\" fillId=\"0\"/></cellXfs>",
  );
  const { cellStyles, numFmts } = parseStyles(xml, theme);
  assert.strictEqual(numFmts[164], "0.0\"x\"");
  assert.strictEqual(cellStyles[0].formatCode, "0.0\"x\"");
  assert.strictEqual(cellStyles[1].formatCode, "0%");
});

await test("parseStyles reads alignment horizontal", () => {
  const xml = wrap(
    "<cellXfs count=\"3\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"center\"/></xf>" +
      "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\"><alignment horizontal=\"right\" vertical=\"top\"/></xf>" +
      "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\"><alignment horizontal=\"general\"/></xf></cellXfs>",
  );
  const s = parseStyles(xml, theme).cellStyles;
  assert.strictEqual(s[0].align, "center");
  assert.strictEqual(s[1].align, "right");
  assert.strictEqual(s[2].align, undefined);
});

await test("parseStyles only counts xf entries inside cellXfs", () => {
  const xml = wrap("<cellStyleXfs><xf numFmtId=\"0\"/><xf numFmtId=\"0\"/></cellStyleXfs><cellXfs><xf numFmtId=\"0\"/></cellXfs>");
  assert.strictEqual(parseStyles(xml, theme).cellStyles.length, 1);
});

await test("parseStyles: missing sections give empty results without throwing", () => {
  assert.deepStrictEqual(parseStyles(wrap(""), theme), { cellStyles: [], numFmts: {} });
  assert.deepStrictEqual(parseStyles("", theme), { cellStyles: [], numFmts: {} });
});

// hostile styles XML stays linear
const timed = (fn) => {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
};

await test("hostile styles XML stays linear: unclosed <xf", () => {
  assert.ok(timed(() => parseStyles("<cellXfs>" + "<xf ".repeat(60000) + "</cellXfs>")) < 1000);
});

await test("hostile styles XML stays linear: unclosed <xf> with attribute-less tags", () => {
  assert.ok(timed(() => parseStyles("<cellXfs>" + "<xf>".repeat(60000) + "</cellXfs>")) < 1000);
});

await test("hostile styles XML stays linear: attribute name with no '=' inside an xf", () => {
  assert.ok(timed(() => parseStyles("<cellXfs><xf " + "a".repeat(60000) + "/></cellXfs>")) < 1000);
});

await test("hostile styles XML stays linear: unclosed <patternFill and <b ", () => {
  const xml = "<fills><fill>" + "<patternFill ".repeat(30000) + "</fill></fills><fonts><font>" + "<b ".repeat(60000) + "</font></fonts>";
  assert.ok(timed(() => parseStyles(xml)) < 1000);
});

await test("hostile styles XML stays linear: unclosed theme element", () => {
  assert.ok(timed(() => parseThemeColors("<a:dk1>".repeat(60000))) < 1000);
});

await test("hostile styles XML stays linear: unclosed section", () => {
  assert.ok(timed(() => parseStyles("<fonts>".repeat(60000))) < 1000);
});

// entity decoding
await test("styles entity decoding: invalid numeric entities decode to U+FFFD instead of throwing", () => {
  const xml = "<numFmts><numFmt numFmtId=\"164\" formatCode=\"0&#99999999;0&#xD800;\"/></numFmts>";
  assert.strictEqual(parseStyles(xml).numFmts[164], "0�0�");
});

console.log("\n=========================================");
console.log(`🎉 XLSX Styles Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
