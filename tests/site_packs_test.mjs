import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadUmd } from "./helpers/loadUmd.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

const ctx = loadUmd(["src/shared/themeCore.js", "src/shared/builtinThemes.js", "src/shared/sitePacks.js"]);
const T = ctx.ForceDarkThemes;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log("=========================================");
console.log("🌐 Running Site Packs Tests");
console.log("=========================================\n");

test("matches exact hosts, subdomains, uppercase and a trailing dot", () => {
  for (const h of ["bbc.com", "www.bbc.com", "news.bbc.co.uk", "WWW.BBC.COM", "bbc.com."]) {
    const p = T.findSitePack(h);
    assert.ok(p && p.id === "bbc", `${h} should match bbc`);
  }
  assert.strictEqual(T.findSitePack("developer.mozilla.org").id, "mdn");
  assert.strictEqual(T.findSitePack("en.wikipedia.org").id, "wikipedia");
  assert.strictEqual(T.findSitePack("news.ycombinator.com").id, "hackernews");
});

test("look-alike and invalid hosts do not match", () => {
  for (const h of ["evilbbc.com", "bbc.com.evil.io", "notbbc.co.uk", "bbc.co.uk.attacker.net", "", undefined, null, 5, {}, "bbc", ".", "..", "bbc.com..", ".bbc.com", "..bbc.com", "a..bbc.com", "evil..bbc.com", "mozilla.org", "ycombinator.com", "example.com"]) {
    assert.strictEqual(T.findSitePack(h), null, `${String(h)} must not match`);
  }
});

test("every pack's match host is found by its own pack", () => {
  for (const p of T.getSitePacks()) {
    for (const m of p.match) {
      assert.strictEqual(T.findSitePack(m).id, p.id, m);
      assert.strictEqual(T.findSitePack("sub." + m).id, p.id, "sub." + m);
    }
  }
});

test("all packs validate", () => {
  const packs = T.getSitePacks();
  assert.strictEqual(packs.length, 20);
  assert.strictEqual(new Set(packs.map((p) => p.id)).size, packs.length, "ids unique");
  for (const p of packs) {
    assert.ok(typeof p.id === "string" && p.id && typeof p.name === "string" && p.name);
    assert.ok(Array.isArray(p.match) && p.match.length > 0, p.id);
    for (const m of p.match) assert.ok(/^[a-z0-9.-]+$/.test(m) && !m.startsWith(".") && !m.endsWith("."), `${p.id} ${m}`);
    assert.strictEqual(p.themeId, "builtin:midnight");
    assert.ok(T.getBuiltinTheme(p.themeId), `${p.id} themeId resolves`);
    assert.ok(Array.isArray(p.fixes));
    for (const f of p.fixes) assert.ok(T.validateFix(f), `${p.id} fix`);
  }
  const all = packs.flatMap((p) => p.match);
  assert.strictEqual(new Set(all).size, all.length, "no host listed twice");
});

test("getSitePacks returns copies that cannot alter the shared table", () => {
  const a = T.getSitePacks();
  a[0].name = "Hacked";
  a[0].match.push("evil.com");
  a.length = 0;
  assert.strictEqual(T.getSitePacks().length, 20);
  assert.notStrictEqual(T.getSitePacks()[0].name, "Hacked");
  assert.strictEqual(T.findSitePack("evil.com"), null);
});

test("validateFix accepts good fixes and rejects bad ones", () => {
  for (const action of ["invert-image", "keep-light", "surface:strong"]) {
    assert.strictEqual(T.validateFix({ action, selector: "img.logo, .a > .b[data-x=\"1\"]" }), true, action);
  }
  const ok = (selector) => ({ action: "keep-light", selector });
  for (const bad of [
    ok("a{color:red}"), ok("a}"), ok("a;b"), ok("a\\b"), ok("<script>"), ok("@import x"), ok("x".repeat(201)), ok(""), ok(5),
    { action: "nope", selector: "img" }, { action: "keep-light" }, { selector: "img" }, {}, null, undefined, "img", 5, [],
  ]) {
    assert.strictEqual(T.validateFix(bad), false, JSON.stringify(bad));
  }
  assert.strictEqual(T.validateFix(ok("x".repeat(200))), true);
});

test("manifest content scripts load in order and popup.html loads sitePacks before popup.js", () => {
  const js = JSON.parse(read("manifest.json")).content_scripts[0].js;
  const order = ["colorUtils.js", "themeCore.js", "builtinThemes.js", "sitePacks.js", "cssOverrideEngine.js", "invertEngine.js", "index.js"];
  const idx = order.map((n) => js.findIndex((p) => p.endsWith("/" + n)));
  idx.forEach((i, k) => assert.ok(i > -1, order[k] + " present"));
  for (let k = 1; k < idx.length; k++) assert.ok(idx[k] > idx[k - 1], `${order[k]} after ${order[k - 1]}`);
  const html = read("src/popup/popup.html");
  const b = html.indexOf('src="../shared/builtinThemes.js"');
  const s = html.indexOf('src="../shared/sitePacks.js"');
  const p = html.indexOf('src="popup.js"');
  assert.ok(b > -1 && s > b && p > s, "popup order builtinThemes, sitePacks, popup");
});

test("buildThemeOptions labels Automatic with a real pack name", () => {
  const opts = T.buildThemeOptions([], T.findSitePack("www.bbc.com"));
  assert.ok(opts[0].label.includes("BBC"), opts[0].label);
  assert.strictEqual(opts[0].value, "");
});

test("sitePacks.js uses no banned APIs or URL literals and no data-built regexes", () => {
  const src = read("src/shared/sitePacks.js");
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /\beval\s*\(/, /\.innerHTML/, /new Function/, /https?:\/\//, /new RegExp/]) {
    assert.ok(!re.test(src), `prohibited ${re}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
