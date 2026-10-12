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

test("derivePalette output is pinned to the exact values the engine produced before the refactor", () => {
  const pinned = {
    "#0f1115": { bg: "#0f1115", surface: "#222428", surfaceSoft: "#313236", elevated: "#444548", text: "#e8eaed", muted: "#b8bec7", border: "#3f4144", link: "#8ab4f8", input: "#1b1d21", selection: "#3a4a64" },
    "#ffffff": { bg: "#ffffff", surface: "#f0f0f0", surfaceSoft: "#e6e6e6", elevated: "#dbdbdb", text: "#14171c", muted: "#4d5663", border: "#bfbfbf", link: "#174ea6", input: "#f5f5f5", selection: "#aec1e0" },
    "#000000": { bg: "#000000", surface: "#141414", surfaceSoft: "#242424", elevated: "#383838", text: "#e8eaed", muted: "#b8bec7", border: "#333333", link: "#8ab4f8", input: "#0d0d0d", selection: "#303f57" },
  };
  for (const [bg, expected] of Object.entries(pinned)) {
    assert.deepStrictEqual({ ...T.derivePalette(bg) }, expected, bg);
  }
});

test("hostFromHash accepts bare hosts and lowercases them", () => {
  assert.strictEqual(T.hostFromHash("#css=bbc.com"), "bbc.com");
  assert.strictEqual(T.hostFromHash("#css=BBC.com"), "bbc.com");
  assert.strictEqual(T.hostFromHash("#css=www.bbc.co.uk"), "www.bbc.co.uk");
  assert.strictEqual(T.hostFromHash("#css=localhost"), "localhost");
  assert.strictEqual(T.hostFromHash("#css=127.0.0.1"), "127.0.0.1");
  assert.strictEqual(T.hostFromHash("#css=local_files"), "local_files");
  assert.strictEqual(T.hostFromHash("#css=" + encodeURIComponent("bbc.com")), "bbc.com");
});

test("hostFromHash rejects everything else", () => {
  const bad = ["#css=../x", "#css=", "#x", "", undefined, null, 5, "#css=a b.com", "#css=a/b.com", "#css=https://a.com",
    "#css=a.com:80", "#css=u@a.com", "#css=a.com?x", "#css=a.com#y", "#css=.a.com", "#css=a..com", "#css=a.com.",
    "#css=a_b.com", "#css=local_files2", "#css=%2e%2e%2fx", "#css=%zz", "css=bbc.com", "#CSS=bbc.com", "#css=__proto__", "#css=constructor", "#css=prototype",
    "#css=" + "a".repeat(254), "#css=a.com&css=b.com"];
  for (const h of bad) assert.strictEqual(T.hostFromHash(h), "", String(h));
  assert.strictEqual(T.hostFromHash("#css=" + "a".repeat(63) + "." + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61)).length, 253);
  assert.strictEqual(T.hostFromHash("#css=" + "a".repeat(250) + ".com").length, 0);
});

// ----- C1: a saved non-default background colour beats the site pack theme -----
const packCtx = loadUmd(["src/shared/themeCore.js", "src/shared/builtinThemes.js", "src/shared/sitePacks.js"]);
const P = packCtx.ForceDarkThemes;

test("resolveTheme: pack host + saved non-default colour + no themeId skips the pack theme but keeps the pack", () => {
  for (const config of [
    { enabled: true, engine: "css", backgroundColor: "#000000" },
    { enabled: true, engine: "css", backgroundColor: "#FFFFFF", themeId: "" },
    { backgroundColor: "#123456" },
  ]) {
    const r = P.resolveTheme({ config, host: "github.com", userThemes: [] });
    assert.strictEqual(r.theme, null, JSON.stringify(config));
    assert.strictEqual(r.source, "default", JSON.stringify(config));
    assert.ok(r.pack && r.pack.id === "github", "pack still returned");
  }
  const npr = P.resolveTheme({ config: { backgroundColor: "#000000" }, host: "www.npr.org", userThemes: [] });
  assert.strictEqual(npr.theme, null);
  assert.strictEqual(npr.pack.id, "npr");
  assert.ok(npr.pack.fixes.length > 0, "the pack's fixes are still returned");
});

test("resolveTheme: pack host + default or missing colour + no themeId still gets the pack theme", () => {
  for (const config of [
    { enabled: true, engine: "css", backgroundColor: "#0f1115" },
    { backgroundColor: "#0F1115" },
    { enabled: true, engine: "css" },
    { backgroundColor: "not-a-colour" },
    null,
  ]) {
    const r = P.resolveTheme({ config, host: "github.com", userThemes: [] });
    assert.strictEqual(r.source, "pack", JSON.stringify(config));
    assert.strictEqual(r.theme.id, "builtin:midnight", JSON.stringify(config));
  }
});

test("resolveTheme: an explicit themeId beats a saved colour and the pack", () => {
  const a = P.resolveTheme({ config: { backgroundColor: "#000000", themeId: "builtin:dracula" }, host: "github.com", userThemes: [] });
  assert.strictEqual(a.source, "builtin");
  assert.strictEqual(a.theme.id, "builtin:dracula");
  const b = P.resolveTheme({ config: { backgroundColor: "#0f1115", themeId: "default" }, host: "github.com", userThemes: [] });
  assert.deepStrictEqual([b.theme, b.source, b.pack.id], [null, "default", "github"]);
  const c = P.resolveTheme({ config: { backgroundColor: "#000000" }, host: "example.org", userThemes: [] });
  assert.deepStrictEqual([c.theme, c.source, c.pack], [null, "default", null]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
