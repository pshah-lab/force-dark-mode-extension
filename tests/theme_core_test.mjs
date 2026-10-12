import assert from "assert";
import vm from "vm";
import { loadUmd } from "./helpers/loadUmd.mjs";

const ctx = loadUmd(["src/shared/themeCore.js"]);
const T = ctx.ForceDarkThemes;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log("=========================================");
console.log("🎨 Running Theme Core Tests");
console.log("=========================================\n");

test("validateTheme accepts a minimal theme", () => {
  const r = T.validateTheme({ id: "user:a", name: "A", colors: { background: "#101010" } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.theme.imageDim, 0);
  const up = T.validateTheme({ id: "user:a", name: "A", colors: { background: "#ABCDEF" } });
  assert.strictEqual(up.theme.colors.background, "#abcdef");
});

test("validateTheme drops unknown keys and rejects markup in names", () => {
  const r = T.validateTheme({ id: "builtin:x", name: " N ", extra: 1, colors: { background: "#000000", bogus: "#111111" } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.theme.name, "N");
  assert.strictEqual("extra" in r.theme, false);
  assert.strictEqual("bogus" in r.theme.colors, false);
  assert.strictEqual(T.validateTheme({ id: "user:a", name: "<b>x</b>", colors: { background: "#000000" } }).ok, false);
});

test("validateTheme rejects hostile input", () => {
  const good = { id: "user:a", name: "A", colors: { background: "#000000" } };
  const bad = [
    JSON.parse('{"__proto__":{"x":1},"id":"user:a","name":"A","colors":{"background":"#000000"}}'),
    JSON.parse('{"id":"user:a","name":"A","colors":{"background":"#000000","constructor":"#000000"}}'),
    [], null, "str", undefined, 5,
    { ...good, colors: { background: "#12345g" } },
    { ...good, imageDim: 99 },
    { ...good, imageDim: 1.5 },
    { ...good, name: "x".repeat(41) },
    { ...good, name: "" },
    { ...good, id: "evil:a" },
    { ...good, colors: {} },
  ];
  for (const b of bad) assert.strictEqual(T.validateTheme(b).ok, false, JSON.stringify(b));
  assert.strictEqual(vm.runInContext("Object.prototype.x", ctx), undefined);
  assert.strictEqual(({}).x, undefined);
});

test("derivePalette matches the engine maths", () => {
  const p = T.derivePalette("#0f1115");
  assert.strictEqual(p.bg, "#0f1115");
  assert.strictEqual(p.text, "#e8eaed");
  assert.strictEqual(p.link, "#8ab4f8");
  assert.strictEqual(p.muted, "#b8bec7");
  for (const k of ["surface", "surfaceSoft", "elevated", "border", "input", "selection"]) {
    assert.match(p[k], /^#[0-9a-f]{6}$/, k);
  }
  const light = T.derivePalette("#ffffff");
  assert.strictEqual(light.text, "#14171c");
  assert.strictEqual(light.link, "#174ea6");
});

test("paletteFromTheme overrides only supplied colours", () => {
  const base = T.derivePalette("#0f1115");
  const p = T.paletteFromTheme({ colors: { background: "#0f1115", text: "#ffffff", link: "#ff0000" } });
  assert.strictEqual(p.text, "#ffffff");
  assert.strictEqual(p.link, "#ff0000");
  assert.strictEqual(p.surface, base.surface);
  assert.strictEqual(p.border, base.border);
  assert.strictEqual(p.muted, base.muted);
});

test("contrastIssues classifies ok / warn / block", () => {
  assert.strictEqual(T.contrastIssues({ colors: { background: "#0f1115", text: "#e8eaed" } }).level, "ok");
  const blocked = T.contrastIssues({ colors: { background: "#000000", text: "#3a3a3a" } });
  assert.strictEqual(blocked.level, "block");
  assert.ok(blocked.messages.length > 0);
  const warn = T.contrastIssues({ colors: { background: "#ffffff", text: "#8a8a8a" } });
  assert.strictEqual(warn.level, "warn");
  assert.ok(warn.messages.length > 0);
  const link = T.contrastIssues({ colors: { background: "#000000", link: "#202020" } });
  assert.strictEqual(link.level, "block");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
