import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadUmd } from "./helpers/loadUmd.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
const ctx = loadUmd(["src/shared/themeCore.js", "src/shared/builtinThemes.js"]);
const T = ctx.ForceDarkThemes;
// vm results are cross-realm; round-trip through JSON so deepStrictEqual compares plain data.
const plain = (v) => JSON.parse(JSON.stringify(v));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log("=========================================");
console.log("🎨 Running Theme UI Tests");
console.log("=========================================\n");

const userTheme = (id, name) => ({ id, name, colors: { background: "#101820" }, imageDim: 0 });

test("popup.html declares #theme-select and loads the theme scripts before popup.js", () => {
  const html = read("src/popup/popup.html");
  assert.ok(/<select[^>]*id="theme-select"/.test(html), "missing #theme-select");
  const core = html.indexOf('src="../shared/themeCore.js"');
  const builtin = html.indexOf('src="../shared/builtinThemes.js"');
  const popup = html.indexOf('src="popup.js"');
  assert.ok(core > -1 && builtin > core && popup > builtin, "script order must be themeCore, builtinThemes, popup");
});

test("popup.js sends themeId in TOGGLE and writes option text with textContent", () => {
  const js = read("src/popup/popup.js");
  assert.ok(/theme-select/.test(js));
  const start = js.indexOf("themeSelect.onchange");
  assert.ok(start > -1, "themeSelect change handler exists");
  const end = js.indexOf("chrome.storage.onChanged", start);
  const handler = js.slice(start, end > -1 ? end : undefined);
  assert.ok(/type: "TOGGLE"/.test(handler), "handler sends TOGGLE");
  assert.ok(/\bthemeId\b/.test(handler), "handler sends themeId");
  assert.ok(/\bforceEnabled\b/.test(handler), "handler sends forceEnabled");
  assert.ok(/buildThemeOptions/.test(js));
  assert.ok(/\.textContent\s*=/.test(js));
  assert.ok(/__customThemes/.test(js));
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /\beval\s*\(/, /\.innerHTML/, /https?:\/\/(?!chromewebstore|darkmode)/]) {
    assert.ok(!re.test(js), `prohibited ${re}`);
  }
});

test("buildThemeOptions: empty user themes gives no My themes group", () => {
  const opts = plain(T.buildThemeOptions([], null));
  assert.deepStrictEqual(opts.slice(0, 2).map((o) => [o.value, o.label, o.group]), [
    ["", "Automatic", ""],
    ["default", "Default colour", ""],
  ]);
  assert.strictEqual(opts.filter((o) => o.group === "Built-in").length, 8);
  assert.strictEqual(opts.filter((o) => o.group === "My themes").length, 0);
});

test("buildThemeOptions: pack name appears in the Automatic label", () => {
  const opts = T.buildThemeOptions([], { name: "BBC", themeId: "builtin:x" });
  assert.strictEqual(opts[0].label, "Automatic (BBC theme)");
  assert.strictEqual(opts[0].value, "");
});

test("buildThemeOptions: user themes are listed after built-ins as plain text", () => {
  const evil = userTheme("user:a", "x");
  evil.name = "<img onerror>";
  const opts = plain(T.buildThemeOptions([userTheme("user:b", "Mine"), evil, { id: "builtin:evil", name: "no" }], null));
  const mine = opts.filter((o) => o.group === "My themes");
  assert.deepStrictEqual(mine.map((o) => [o.value, o.label]), [["user:b", "Mine"], ["user:a", "<img onerror>"]]);
  assert.strictEqual(opts[opts.length - 1].value, "user:a");
});

test("buildThemeOptions keeps a pack name containing markup as plain text", () => {
  const opts = T.buildThemeOptions([], { name: "<img onerror>", themeId: "builtin:x" });
  assert.strictEqual(opts[0].label, "Automatic (<img onerror> theme)");
});

test("buildThemeOptions does not throw on corrupt user themes", () => {
  for (const bad of ["x", [null, 5, {}], null, undefined, 7, { length: 3 }]) {
    const opts = T.buildThemeOptions(bad, null);
    assert.strictEqual(opts.filter((o) => o.group === "My themes").length, 0);
    assert.strictEqual(opts.length, 10);
  }
});

console.log(`\n🎉 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
