// tests/cell_colors_test.mjs
import assert from "assert";
import {
  hexToRgb,
  rgbToHsl,
  getRelativeLuminance,
  mixRgb,
  dimColor,
  applyContrast,
  clampColorChannel,
  clampNumber,
  hslToRgb,
  rgbToHex,
} from "../src/viewer/spreadsheet/pixelMath.js";
import { mapCellColors, contrastRatio } from "../src/viewer/spreadsheet/cellColors.js";

console.log("=========================================");
console.log("🎨 Running Cell Colour Tests");
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

// Vitest toBeCloseTo(expected, digits): |actual - expected| < 10^-digits / 2
function assertCloseTo(actual, expected, digits) {
  assert.ok(
    Math.abs(actual - expected) < Math.pow(10, -digits) / 2,
    `expected ${actual} to be close to ${expected} (${digits} digits)`,
  );
}

// ---------- pixelMath ----------

await test("hexToRgb: parses a 6-digit hex color", () => {
  assert.deepStrictEqual(hexToRgb("#0f1115"), { r: 15, g: 17, b: 21 });
});

await test("rgbToHsl: returns zero saturation for a pure gray", () => {
  const { h, s, l } = rgbToHsl({ r: 128, g: 128, b: 128 });
  assert.strictEqual(h, 0);
  assert.strictEqual(s, 0);
  assertCloseTo(l, 0.5, 1);
});

await test("rgbToHsl: detects a saturated red", () => {
  const { s } = rgbToHsl({ r: 220, g: 40, b: 40 });
  assert.ok(s > 0.5);
});

await test("getRelativeLuminance: returns 1 for white", () => {
  assertCloseTo(getRelativeLuminance({ r: 255, g: 255, b: 255 }), 1, 2);
});

await test("getRelativeLuminance: returns 0 for black", () => {
  assert.strictEqual(getRelativeLuminance({ r: 0, g: 0, b: 0 }), 0);
});

await test("mixRgb: returns colorA at amount 0", () => {
  const a = { r: 10, g: 20, b: 30 };
  const b = { r: 200, g: 200, b: 200 };
  assert.deepStrictEqual(mixRgb(a, b, 0), { r: 10, g: 20, b: 30 });
});

await test("mixRgb: returns colorB at amount 1", () => {
  const a = { r: 10, g: 20, b: 30 };
  const b = { r: 200, g: 200, b: 200 };
  assert.deepStrictEqual(mixRgb(a, b, 1), { r: 200, g: 200, b: 200 });
});

await test("mixRgb: clamps amount above 1", () => {
  const a = { r: 0, g: 0, b: 0 };
  const b = { r: 100, g: 100, b: 100 };
  assert.deepStrictEqual(mixRgb(a, b, 5), { r: 100, g: 100, b: 100 });
});

await test("dimColor: scales each channel by the given amount", () => {
  assert.deepStrictEqual(dimColor({ r: 200, g: 100, b: 50 }, 0.5), { r: 100, g: 50, b: 25 });
});

await test("applyContrast: returns the color unchanged at amount 1", () => {
  assert.deepStrictEqual(applyContrast({ r: 100, g: 150, b: 200 }, 1), { r: 100, g: 150, b: 200 });
});

await test("clampColorChannel: clamps below 0 to 0", () => {
  assert.strictEqual(clampColorChannel(-10), 0);
});

await test("clampColorChannel: clamps above 255 to 255", () => {
  assert.strictEqual(clampColorChannel(300), 255);
});

await test("clampColorChannel: rounds fractional values", () => {
  assert.strictEqual(clampColorChannel(127.6), 128);
});

await test("clampNumber: returns the fallback for non-finite input", () => {
  assert.strictEqual(clampNumber(NaN, 0, 10, 5), 5);
});

await test("clampNumber: clamps within range", () => {
  assert.strictEqual(clampNumber(50, 0, 10, 5), 10);
});

await test("hslToRgb / rgbToHex: hslToRgb inverts rgbToHsl for sample colours (round trip within 1/255)", () => {
  const samples = ["#ff0000", "#00ff00", "#0000ff", "#ffeb9c", "#808080", "#123456", "#000000", "#ffffff", "#c0392b"];
  for (const hex of samples) {
    const rgb = hexToRgb(hex);
    const back = hslToRgb(rgbToHsl(rgb));
    assert.ok(Math.abs(back.r - rgb.r) <= 1);
    assert.ok(Math.abs(back.g - rgb.g) <= 1);
    assert.ok(Math.abs(back.b - rgb.b) <= 1);
  }
});

await test("hslToRgb / rgbToHex: rgbToHex pads and clamps", () => {
  assert.strictEqual(rgbToHex({ r: 0, g: 5, b: 255 }), "#0005ff");
  assert.strictEqual(rgbToHex({ r: -10, g: 300, b: 15.6 }), "#00ff10");
});

// ---------- cellColors ----------

const palette = { backgroundColor: "#1a1a1a", textColor: "#e6e6e6" };
const hsl = (hex) => rgbToHsl(hexToRgb(hex));
const hueDistance = (a, b) => {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
};

const fills = [
  "#ffffff", "#000000", "#808080", "#ffeb9c", "#c6efce", "#ffc7ce", "#9bc2e6",
  "#ff0000", "#00b050", "#0070c0", "#7030a0", "#f4b084", "#404040", "#d9d9d9",
];
const texts = ["#ff0000", "#00b050", "#0070c0", "#ffff00", "#7f7f7f", "#9c0006", "#ffffff"];
const modes = ["smart", "invert", "sepia"];

await test("contrastRatio: is 21 for black on white and 1 for identical colours", () => {
  assertCloseTo(contrastRatio("#000000", "#ffffff"), 21, 1);
  assertCloseTo(contrastRatio("#123456", "#123456"), 1, 5);
});

await test("mapCellColors: no fill maps to palette background; absent or default-dark text maps to palette text", () => {
  for (const mode of modes) {
    const absent = mapCellColors({}, "smart", palette);
    assert.deepStrictEqual(absent, { background: "#1a1a1a", color: "#e6e6e6" });
    const parsed = mapCellColors({ color: "#000000" }, "smart", palette);
    assert.strictEqual(parsed.color, "#e6e6e6");
    assert.strictEqual(
      mapCellColors({ color: "#0a0a0a" }, mode, palette).color,
      mapCellColors({}, mode, palette).color,
    );
  }
});

await test("mapCellColors: near-black threshold (luminance < 0.05): #333333 is default text, #595959 is a real grey", () => {
  assert.strictEqual(mapCellColors({ color: "#333333" }, "smart", palette).color, "#e6e6e6");
  const grey = mapCellColors({ color: "#595959" }, "smart", palette).color;
  assert.notStrictEqual(grey, "#e6e6e6");
  assert.ok(contrastRatio(grey, "#1a1a1a") >= 4.5);
});

await test("mapCellColors: smart: light yellow fill stays yellowish and becomes dark", () => {
  const { background } = mapCellColors({ fill: "#ffeb9c" }, "smart", palette);
  const out = hsl(background);
  assert.ok(hueDistance(out.h, hsl("#ffeb9c").h) < 0.05);
  assert.ok(out.l < 0.35);
});

await test("mapCellColors: smart: relative lightness order of two fills is preserved", () => {
  const a = mapCellColors({ fill: "#c6efce" }, "smart", palette).background;
  const b = mapCellColors({ fill: "#548235" }, "smart", palette).background;
  assert.ok(hsl(a).l > hsl(b).l);
});

await test("mapCellColors: smart: coloured text keeps hue and reaches contrast 4.5 against its own fill", () => {
  const out = mapCellColors({ fill: "#ffeb9c", color: "#0070c0" }, "smart", palette);
  assert.ok(hueDistance(hsl(out.color).h, hsl("#0070c0").h) < 0.05);
  assert.ok(contrastRatio(out.color, out.background) >= 4.5);
});

await test("mapCellColors: invert and sepia: contrast >= 4.5 for a grid of fills x text colours", () => {
  for (const mode of ["invert", "sepia"]) {
    for (const fill of fills) {
      for (const color of texts) {
        const out = mapCellColors({ fill, color }, mode, palette);
        assert.ok(contrastRatio(out.color, out.background) >= 4.5, `${mode} ${fill} ${color}`);
      }
    }
  }
});

await test("mapCellColors: smart: every fill x text colour gives contrast >= 4.5 (including mid-grey fills)", () => {
  for (const fill of [...fills, "#7f7f7f", "#888888", "#777777", undefined]) {
    for (const color of [...texts, "#000000", undefined]) {
      const out = mapCellColors({ fill, color }, "smart", palette);
      assert.ok(contrastRatio(out.color, out.background) >= 4.5, `smart ${fill} ${color}`);
    }
  }
});

await test("mapCellColors: mid-grey fill falls back to darkening the text", () => {
  const out = mapCellColors({ fill: "#808080", color: "#ffffff" }, "invert", palette);
  assert.ok(contrastRatio(out.color, out.background) >= 4.5);
});

await test("mapCellColors: original returns the file's own colours with defaults #ffffff / #000000", () => {
  assert.deepStrictEqual(mapCellColors({ fill: "#FFEB9C", color: "#9C0006" }, "original", palette), {
    background: "#ffeb9c",
    color: "#9c0006",
  });
  assert.deepStrictEqual(mapCellColors({}, "original", palette), { background: "#ffffff", color: "#000000" });
});

await test("mapCellColors: invalid hex input falls back to palette without throwing", () => {
  for (const mode of [...modes, "original"]) {
    assert.doesNotThrow(() => mapCellColors({ fill: "nope", color: "#12" }, mode, palette));
    assert.doesNotThrow(() => mapCellColors({ fill: 5, color: null }, mode, palette));
    assert.doesNotThrow(() => mapCellColors(undefined, mode, undefined));
  }
  assert.deepStrictEqual(mapCellColors({ fill: "nope", color: "zzz" }, "smart", palette), {
    background: "#1a1a1a",
    color: "#e6e6e6",
  });
  assert.strictEqual(mapCellColors({ fill: "nope" }, "original", palette).background, "#ffffff");
});

console.log("\n=========================================");
console.log(`🎉 Cell Colour Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
