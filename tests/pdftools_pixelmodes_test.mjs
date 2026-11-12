// tests/pdftools_pixelmodes_test.mjs - dark / sepia / gray pixel conversion (pure)
import assert from "assert";
import { convertPixels, PIXEL_MODES } from "../src/viewer/pdftools/pixelModes.js";
import { getRelativeLuminance, rgbToHsl } from "../src/viewer/spreadsheet/pixelMath.js";

const px = (...rgba) => new Uint8ClampedArray(rgba);
const run = (mode, ...rgba) => { const a = px(...rgba); convertPixels(a, mode); return [...a]; };

assert.deepStrictEqual([...PIXEL_MODES], ["dark", "sepia", "gray"]);

// dark: white page -> near black (viewer default background #0f1115)
let [r, g, b, a] = run("dark", 255, 255, 255, 255);
assert.deepStrictEqual([r, g, b, a], [15, 17, 21, 255], "white -> viewer background");
assert.ok(getRelativeLuminance({ r, g, b }) < 0.02, "white becomes near black");

// dark: black text -> light (viewer text #e8eaed side)
[r, g, b] = run("dark", 0, 0, 0, 255);
assert.ok(getRelativeLuminance({ r, g, b }) > 0.6, "black text becomes light");

// dark: pure red keeps its hue family (saturation-aware, dimmed like the viewer)
[r, g, b] = run("dark", 255, 0, 0, 255);
assert.deepStrictEqual([r, g, b], [213, 0, 0], "red dimmed by 0.82 with contrast 1.05, as the viewer");
const hsl = rgbToHsl({ r, g, b });
assert.ok(hsl.h < 0.05 || hsl.h > 0.95, "still red");
assert.ok(hsl.s > 0.9, "still saturated");

// gray: r = g = b
for (const c of [[255, 0, 0], [12, 200, 90], [255, 255, 255], [0, 0, 0], [128, 64, 32]]) {
  const out = run("gray", ...c, 255);
  assert.strictEqual(out[0], out[1]);
  assert.strictEqual(out[1], out[2]);
}
assert.deepStrictEqual(run("gray", 255, 255, 255, 255), [255, 255, 255, 255]);
assert.deepStrictEqual(run("gray", 0, 0, 0, 255), [0, 0, 0, 255]);

// sepia: warm (r > g > b) for neutral input, same palette as the viewer
for (const v of [255, 200, 128, 40, 0]) {
  const [sr, sg, sb] = run("sepia", v, v, v, 255);
  assert.ok(sr > sg && sg > sb, `sepia warm for gray ${v}: ${sr},${sg},${sb}`);
}
assert.deepStrictEqual(run("sepia", 255, 255, 255, 255), [36, 30, 23, 255], "white -> viewer sepia background");

// alpha untouched in every mode; multi-pixel buffers processed
for (const mode of PIXEL_MODES) {
  const buf = px(255, 255, 255, 0, 10, 20, 30, 77, 255, 0, 0, 200);
  convertPixels(buf, mode);
  assert.deepStrictEqual([buf[3], buf[7], buf[11]], [0, 77, 200], `alpha kept in ${mode}`);
  assert.strictEqual(buf[8] === buf[9] && buf[9] === buf[10], mode === "gray", `third pixel converted in ${mode}`);
}

// returns undefined (in place); unknown mode / bad buffer throw readable errors
assert.strictEqual(convertPixels(px(1, 2, 3, 4), "dark"), undefined);
assert.throws(() => convertPixels(px(1, 2, 3, 4), "neon"), /Unknown color mode/);
assert.throws(() => convertPixels([1, 2, 3, 4], "dark"), /pixel data/i);
assert.throws(() => convertPixels(px(1, 2, 3), "dark"), /pixel data/i);

console.log("pdftools_pixelmodes_test: ok");
