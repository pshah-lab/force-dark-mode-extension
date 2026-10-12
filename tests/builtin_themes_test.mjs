import assert from "assert";
import { loadUmd } from "./helpers/loadUmd.mjs";

const ctx = loadUmd(["src/shared/themeCore.js", "src/shared/builtinThemes.js"]);
const T = ctx.ForceDarkThemes;
const C = ctx.ForceDarkColorUtils;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log("=========================================");
console.log("🎨 Running Built-in Themes Tests");
console.log("=========================================\n");

const EXPECTED = [
  ["builtin:midnight", "Midnight", "#0f1115", "#171a20", "#e8eaed", "#b8bec7", "#8ab4f8", "#343b46", 0],
  ["builtin:oled", "OLED Black", "#000000", "#0b0b0b", "#f2f2f2", "#b5b5b5", "#7ab7ff", "#2a2a2a", 0],
  ["builtin:dracula", "Dracula", "#282a36", "#343746", "#f8f8f2", "#bfc3d9", "#8be9fd", "#44475a", 0],
  ["builtin:nord", "Nord", "#2e3440", "#3b4252", "#eceff4", "#c0c8d8", "#88c0d0", "#4c566a", 0],
  ["builtin:solarized", "Solarized Dark", "#002b36", "#073642", "#eee8d5", "#a3b1b1", "#4fa8e8", "#2a5560", 0],
  ["builtin:contrast", "High Contrast", "#000000", "#101010", "#ffffff", "#e0e0e0", "#7fd4ff", "#8a8a8a", 0],
  ["builtin:dim", "Dim", "#22252b", "#2b2f36", "#dcdfe4", "#b0b6c0", "#8fb8f0", "#444b57", 15],
  ["builtin:sepia", "Sepia Dark", "#1f1a14", "#2a231b", "#ead9bf", "#c2ae92", "#e0a85c", "#4a3d2c", 0],
];

test("every built-in passes validateTheme", () => {
  for (const t of T.getBuiltinThemes()) {
    const r = T.validateTheme(t);
    assert.strictEqual(r.ok, true, `${t.id}: ${r.error}`);
  }
});

test("every built-in has contrastIssues level ok", () => {
  for (const t of T.getBuiltinThemes()) {
    assert.strictEqual(T.contrastIssues(t).level, "ok", t.id);
  }
});

test("text, muted and link each >= 4.5:1 on background and on surface", () => {
  for (const t of T.getBuiltinThemes()) {
    const c = t.colors;
    for (const base of [c.background, c.surface]) {
      for (const key of ["text", "muted", "link"]) {
        const ratio = C.getContrastRatio(C.hexToRgb(c[key]), C.hexToRgb(base));
        assert.ok(ratio >= 4.5, `${t.id} ${key} on ${base} is ${ratio.toFixed(2)}`);
      }
    }
  }
});

test("ids are unique and match the table", () => {
  const themes = T.getBuiltinThemes();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(themes.map((t) => t.id))), EXPECTED.map((e) => e[0]));
  assert.strictEqual(new Set(themes.map((t) => t.id)).size, themes.length);
  EXPECTED.forEach(([id, name, background, surface, text, muted, link, border, imageDim], i) => {
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(themes[i])),
      { id, name, colors: { background, surface, text, muted, link, border }, imageDim }
    );
  });
});

test("getBuiltinTheme returns a theme by id and null for unknown ids", () => {
  assert.strictEqual(T.getBuiltinTheme("builtin:nord").name, "Nord");
  assert.strictEqual(T.getBuiltinTheme("builtin:nope"), null);
  assert.strictEqual(T.getBuiltinTheme("user:a"), null);
  assert.strictEqual(T.getBuiltinTheme(undefined), null);
  assert.strictEqual(T.getBuiltinTheme("constructor"), null);
});

test("returned themes are frozen copies", () => {
  const a = T.getBuiltinThemes();
  assert.ok(Object.isFrozen(a[0]));
  assert.ok(Object.isFrozen(a[0].colors));
  assert.throws(() => { "use strict"; a[0].name = "Hacked"; }, TypeError);
  assert.throws(() => { "use strict"; a[0].colors.text = "#000000"; }, TypeError);
  a.length = 0;
  const b = T.getBuiltinThemes();
  assert.strictEqual(b.length, 8);
  assert.strictEqual(b[0].name, "Midnight");
  assert.strictEqual(b[0].colors.text, "#e8eaed");
  assert.notStrictEqual(T.getBuiltinTheme("builtin:dim"), T.getBuiltinTheme("builtin:dim"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
