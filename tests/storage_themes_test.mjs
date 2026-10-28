// tests/storage_themes_test.mjs
import assert from "assert";

let lastError = null;
let store = {};
let failSetWhen = null;

const sync = {
  get(keys, cb) {
    let out = {};
    if (keys === null || keys === undefined) out = { ...store };
    else if (typeof keys === "string") { if (keys in store) out[keys] = store[keys]; }
    else if (Array.isArray(keys)) { for (const k of keys) if (k in store) out[k] = store[k]; }
    else { for (const [k, d] of Object.entries(keys)) out[k] = k in store ? store[k] : d; }
    out = JSON.parse(JSON.stringify(out));
    cb(out);
  },
  set(items, cb) {
    if (failSetWhen && failSetWhen(items)) {
      lastError = { message: "QUOTA_BYTES_PER_ITEM quota exceeded" };
      cb();
      lastError = null;
      return;
    }
    for (const [k, v] of Object.entries(items)) store[k] = JSON.parse(JSON.stringify(v));
    cb();
  },
  remove(keys, cb) {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
    cb && cb();
  },
  clear(cb) { store = {}; cb && cb(); },
};
globalThis.chrome = {
  storage: { sync, local: { get: (k, cb) => cb({}), set: (i, cb) => cb() } },
  runtime: { get lastError() { return lastError; } },
};

const S = await import("../src/shared/storage.js");
const { THEME_ID_PATTERN } = await import("../src/shared/constants.js");
const Themes = globalThis.ForceDarkThemes;
// The real sanitiser installed by storage.js's import of customCss.js. The test() harness
// deletes Themes.validateCss before every test, so tests that need it restore it explicitly
// and the "not available" test below covers a deliberately absent validator.
const realValidateCss = Themes.validateCss;
const useRealCss = () => { Themes.validateCss = realValidateCss; };
const UNSAFE_CSS = [
  "@import \"x\";",
  "@IMPORT 'x';",
  "@namespace x;",
  "@font-face{font-family:x}",
  "a{background:url(x)}",
  "a{background:URL( x )}",
  "a{background:ur/**/l(x)}",
  "a{background:u\\72l(x)}",
  "a{background:image-set(\"x\" 1x)}",
  "a{background:-webkit-image-set(\"x\" 1x)}",
  "a{background:image(\"x\")}",
  "a{background:src(\"x\")}",
  "a{background:cross-fade(\"a\",\"b\",5%)}",
  "a{width:expression(1)}",
  "a{behavior:x}",
  "a{-moz-binding:x}",
  "a{x:javascript:1}",
  "</style><script>",
  "/* open",
  "x".repeat(6001),
];

let passed = 0, failed = 0;
async function test(name, fn) {
  store = {}; lastError = null; failSetWhen = null;
  delete Themes.validateCss;
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.stack}`); failed++; }
}
const mkTheme = (n, bg = "#101820") => ({ id: `user:t-${n}`, name: `Theme ${n}`, colors: { background: bg } });
const stubCss = () => { Themes.validateCss = (css) => ({ ok: true, css }); };

console.log("Storage themes suite");

await test("themeId round-trips and invalid values become \"\"", async () => {
  assert.ok(THEME_ID_PATTERN.test("user:ok-1"));
  await S.setSiteConfig("a.com", { enabled: true, themeId: "user:ok-1" });
  assert.strictEqual((await S.getSiteConfig("a.com")).themeId, "user:ok-1");
  for (const bad of ["../x", "builtin:", 42]) {
    await S.setSiteConfig("a.com", { enabled: true, themeId: bad });
    assert.strictEqual((await S.getSiteConfig("a.com")).themeId, "");
  }
  await S.setSiteConfig("a.com", { enabled: true, themeId: "default" });
  assert.strictEqual((await S.getSiteConfig("a.com")).themeId, "default");
});

await test("existing configs without themeId are unchanged", async () => {
  const legacy = { enabled: true, engine: "css", backgroundColor: "#0f1115", brightness: 100, contrast: 100, sepia: 0 };
  store["old.com"] = { ...legacy };
  assert.deepStrictEqual(await S.getSiteConfig("old.com"), legacy);
  await S.setSiteConfig("new.com", legacy);
  assert.deepStrictEqual(await S.getSiteConfig("new.com"), legacy);
});

await test("saveCustomTheme enforces the 20-theme cap and unique ids", async () => {
  for (let i = 0; i < 20; i++) assert.strictEqual((await S.saveCustomTheme(mkTheme(i))).ok, true);
  const over = await S.saveCustomTheme(mkTheme(99));
  assert.strictEqual(over.ok, false);
  assert.ok(typeof over.error === "string" && over.error.length > 0);
  // same id updates in place, even at the cap
  const upd = await S.saveCustomTheme({ ...mkTheme(3), name: "Renamed" });
  assert.strictEqual(upd.ok, true);
  const all = await S.getCustomThemes();
  assert.strictEqual(all.length, 20);
  assert.strictEqual(all.filter((t) => t.id === "user:t-3").length, 1);
  assert.strictEqual(all.find((t) => t.id === "user:t-3").name, "Renamed");
  assert.strictEqual((await S.saveCustomTheme({ id: "bad", name: "x" })).ok, false);
});

await test("saveCustomTheme surfaces quota errors without losing earlier themes", async () => {
  await S.saveCustomTheme(mkTheme(1));
  await S.saveCustomTheme(mkTheme(2));
  failSetWhen = () => true;
  const r = await S.saveCustomTheme(mkTheme(3));
  assert.strictEqual(r.ok, false);
  assert.ok(/storage|space|full|quota/i.test(r.error));
  failSetWhen = null;
  const ids = (await S.getCustomThemes()).map((t) => t.id);
  assert.deepStrictEqual(ids, ["user:t-1", "user:t-2"]);
});

await test("deleteCustomTheme removes one theme", async () => {
  await S.saveCustomTheme(mkTheme(1));
  await S.saveCustomTheme(mkTheme(2));
  await S.deleteCustomTheme("user:t-1");
  assert.deepStrictEqual((await S.getCustomThemes()).map((t) => t.id), ["user:t-2"]);
});

await test("getCustomThemes returns [] for corrupt storage", async () => {
  for (const junk of ["oops", { a: 1 }, [1, null, "x", { id: "nope" }], 7]) {
    store.__customThemes = junk;
    assert.deepStrictEqual(await S.getCustomThemes(), []);
  }
});

await test("import rejects hostile payloads", async () => {
  const before = Object.getOwnPropertyNames(Object.prototype).sort();
  const hostile = '{"__proto__":{"polluted":true},"settings":{"a.com":{"enabled":true},"__proto__":{"enabled":true},"constructor":{"x":1}},"themes":' +
    JSON.stringify(Array.from({ length: 500 }, (_, i) => mkTheme(i))) + "}";
  const n = await S.importSettingsJson(hostile);
  assert.ok(n >= 1);
  assert.strictEqual((await S.getCustomThemes()).length, 20);
  assert.strictEqual({}.polluted, undefined);
  assert.deepStrictEqual(Object.getOwnPropertyNames(Object.prototype).sort(), before);
  assert.ok(!("__proto__" in store && Object.prototype.hasOwnProperty.call(store, "__proto__")));
  // wrong types: nothing stored, no crash
  store = {};
  await S.importSettingsJson(JSON.stringify({ settings: { "b.com": { enabled: true } }, themes: "nope", customCss: [1, 2] }));
  assert.deepStrictEqual(await S.getCustomThemes(), []);
  assert.deepStrictEqual(Object.keys(store), ["b.com"]);
  await S.importSettingsJson(JSON.stringify({ settings: { "b.com": { enabled: true } }, themes: { x: 1 }, customCss: "x" }));
  // hostile theme entries dropped
  store = {};
  await S.importSettingsJson(JSON.stringify({
    settings: { "c.com": { enabled: true, themeId: "../x" } },
    themes: [{ id: "user:evil", name: "e", colors: { background: "#000000" }, __proto__x: 1, constructor: { a: 1 } }, mkTheme(1), 5, null],
  }));
  assert.deepStrictEqual((await S.getCustomThemes()).map((t) => t.id), ["user:t-1"]);
  assert.strictEqual((await S.getSiteConfig("c.com")).themeId, "");
  // nothing valid at all still throws
  await assert.rejects(() => S.importSettingsJson("{}"));
});

await test("builtin: ids are never stored as custom themes", async () => {
  const builtin = { id: "builtin:midnight", name: "Fake", colors: { background: "#000000" } };
  await S.importSettingsJson(JSON.stringify({
    settings: { "z.com": { enabled: true }, "__customThemes": { enabled: true }, "__css:x": { enabled: true } },
    themes: [builtin, mkTheme(1)],
  }));
  assert.deepStrictEqual((await S.getCustomThemes()).map((t) => t.id), ["user:t-1"]);
  assert.deepStrictEqual(Object.keys(store).filter((k) => !k.startsWith("__")), ["z.com"]);
  assert.ok(Array.isArray(store.__customThemes));
  assert.strictEqual(store["__css:x"], undefined);
  store.__customThemes = [builtin, mkTheme(2)];
  assert.deepStrictEqual((await S.getCustomThemes()).map((t) => t.id), ["user:t-2"]);
  store = {};
  await assert.rejects(() => S.importSettingsJson(JSON.stringify({ themes: [builtin] })));
  assert.strictEqual(store.__customThemes, undefined);
});

await test("import with quota failure stores nothing partially", async () => {
  await S.saveCustomTheme(mkTheme(1));
  failSetWhen = () => true;
  await assert.rejects(() => S.importSettingsJson(JSON.stringify({ settings: { "d.com": { enabled: true } }, themes: [mkTheme(2)] })));
  failSetWhen = null;
  assert.deepStrictEqual((await S.getCustomThemes()).map((t) => t.id), ["user:t-1"]);
  assert.strictEqual(await S.getSiteConfig("d.com"), null);
});

await test("export then import round-trips themes, css and configs", async () => {
  stubCss();
  await S.setSiteConfig("e.com", { enabled: true, themeId: "user:t-1" });
  await S.saveCustomTheme(mkTheme(1));
  assert.deepStrictEqual(await S.setCustomCss("e.com", "body{color:red}"), { ok: true });
  const json = await S.exportSettingsJson();
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.version, "2.2.0");
  assert.strictEqual(parsed.themes.length, 1);
  assert.deepStrictEqual(parsed.customCss, { "e.com": "body{color:red}" });
  assert.deepStrictEqual(Object.keys(parsed.settings), ["e.com"]);
  await S.clearAllConfigs();
  await S.importSettingsJson(json);
  assert.strictEqual((await S.getSiteConfig("e.com")).themeId, "user:t-1");
  assert.strictEqual((await S.getCustomThemes()).length, 1);
  assert.strictEqual(await S.getCustomCss("e.com"), "body{color:red}");
  const sites = Object.keys(await S.getAllConfigs()).filter((k) => !k.startsWith("__"));
  assert.deepStrictEqual(sites, ["e.com"]);
});

await test("clearAllConfigs removes themes and custom CSS", async () => {
  stubCss();
  await S.saveCustomTheme(mkTheme(1));
  await S.setCustomCss("f.com", "a{b:c}");
  await S.clearAllConfigs();
  assert.deepStrictEqual(await S.getCustomThemes(), []);
  assert.strictEqual(await S.getCustomCss("f.com"), "");
});

await test("setCustomCss rejects unsafe host keys and over-limit sites", async () => {
  stubCss();
  assert.strictEqual((await S.setCustomCss("__proto__", "a{}")).ok, false);
  assert.strictEqual((await S.setCustomCss("", "a{}")).ok, false);
  for (let i = 0; i < Themes.LIMITS.MAX_CSS_SITES; i++) {
    assert.strictEqual((await S.setCustomCss(`s${i}.com`, "a{}")).ok, true);
  }
  assert.strictEqual((await S.setCustomCss("extra.com", "a{}")).ok, false);
  assert.strictEqual((await S.setCustomCss("s1.com", "b{}")).ok, true);
  assert.strictEqual(await S.getCustomCss("s1.com"), "b{}");
  assert.deepStrictEqual(await S.setCustomCss("s1.com", ""), { ok: true });
  assert.strictEqual(await S.getCustomCss("s1.com"), "");
  assert.strictEqual((await S.setCustomCss("extra.com", "a{}")).ok, true);
});

// validateCss is deleted by the harness here, so this covers a deliberately absent validator.
await test("setCustomCss reports not available while validateCss is undefined", async () => {
  assert.deepStrictEqual(await S.setCustomCss("g.com", "a{}"), { ok: false, error: "Custom CSS is not available yet." });
  assert.strictEqual(await S.getCustomCss("g.com"), "");
});

await test("setCustomCss surfaces quota errors", async () => {
  stubCss();
  failSetWhen = () => true;
  const r = await S.setCustomCss("h.com", "a{}");
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.length > 0);
});

await test("importing storage.js installs the real validateCss from customCss.js", async () => {
  assert.strictEqual(typeof realValidateCss, "function");
  assert.strictEqual(realValidateCss("a{background:url(x)}").ok, false);
  assert.deepStrictEqual(realValidateCss("a{color:red}"), { ok: true, css: "a{color:red}" });
});

await test("setCustomCss with the real validator stores valid CSS unchanged", async () => {
  useRealCss();
  const css = "/* mine */ body{font-family:Inter,sans-serif !important} pre{border-radius:12px}";
  assert.deepStrictEqual(await S.setCustomCss("v.com", css), { ok: true });
  assert.strictEqual(await S.getCustomCss("v.com"), css);
  assert.strictEqual(store["__css:v.com"], css);
});

await test("setCustomCss with the real validator rejects every unsafe construct and stores nothing", async () => {
  useRealCss();
  for (const css of UNSAFE_CSS) {
    const r = await S.setCustomCss("w.com", css);
    assert.strictEqual(r.ok, false, css.slice(0, 40));
    assert.strictEqual(r.error, realValidateCss(css).error, "the sanitiser's sentence is surfaced");
    assert.ok(typeof r.error === "string" && r.error.length > 0);
    assert.strictEqual(await S.getCustomCss("w.com"), "");
    assert.ok(!Object.keys(store).some((k) => k.startsWith("__css:")), "nothing stored");
  }
});

await test("a rejected update keeps the previously saved CSS", async () => {
  useRealCss();
  assert.deepStrictEqual(await S.setCustomCss("k.com", "a{color:red}"), { ok: true });
  assert.strictEqual((await S.setCustomCss("k.com", "a{background:url(x)}")).ok, false);
  assert.strictEqual(await S.getCustomCss("k.com"), "a{color:red}");
});

await test("import with the real validator keeps safe CSS and drops unsafe CSS", async () => {
  useRealCss();
  const customCss = { "ok.com": "a{color:red}" };
  UNSAFE_CSS.forEach((css, i) => { customCss[`bad${i}.com`] = css; });
  await S.importSettingsJson(JSON.stringify({ settings: { "ok.com": { enabled: true } }, customCss }));
  assert.strictEqual(await S.getCustomCss("ok.com"), "a{color:red}");
  const cssKeys = Object.keys(store).filter((k) => k.startsWith("__css:"));
  assert.deepStrictEqual(cssKeys, ["__css:ok.com"]);
});

// ----- M1: global defaults survive export and import -----
const GLOBAL = "__global_defaults__";
const globalDefaults = { enabled: true, engine: "css", backgroundColor: "#000000", brightness: 90, contrast: 110, sepia: 5 };

await test("M1: export includes __global_defaults__ and import restores it", async () => {
  await S.setSiteConfig(GLOBAL, globalDefaults);
  await S.setSiteConfig("e.com", { enabled: true });
  const parsed = JSON.parse(await S.exportSettingsJson());
  assert.deepStrictEqual(parsed.settings[GLOBAL], globalDefaults);
  await S.clearAllConfigs();
  await S.importSettingsJson(JSON.stringify(parsed));
  assert.deepStrictEqual(await S.getSiteConfig(GLOBAL), globalDefaults);
  assert.ok(await S.getSiteConfig("e.com"));
});

await test("M1: an old export containing only __global_defaults__ imports (wrapped and flat)", async () => {
  const old = { version: "1.8.0", exportDate: "2026-01-01T00:00:00.000Z", generator: "ThemeSwitcher - Force Dark Mode", settings: { [GLOBAL]: { ...globalDefaults, extra: "x", brightness: 999 } } };
  assert.strictEqual(await S.importSettingsJson(JSON.stringify(old)), 1);
  assert.deepStrictEqual(await S.getSiteConfig(GLOBAL), { ...globalDefaults, brightness: 150 }, "validated like a site config, unknown keys dropped");
  store = {};
  assert.strictEqual(await S.importSettingsJson(JSON.stringify({ [GLOBAL]: globalDefaults })), 1);
  assert.deepStrictEqual(await S.getSiteConfig(GLOBAL), globalDefaults);
  // other "__" keys are still never imported as settings
  store = {};
  await assert.rejects(() => S.importSettingsJson(JSON.stringify({ settings: { __other__: globalDefaults, [GLOBAL]: "x" } })));
  assert.deepStrictEqual(Object.keys(store), []);
});

// ----- M2: total custom CSS cap and per-item size message -----
await test("M2: LIMITS.MAX_CSS_TOTAL_CHARS is 40000 and fits sync storage", async () => {
  assert.strictEqual(Themes.LIMITS.MAX_CSS_TOTAL_CHARS, 40000);
  assert.ok(Themes.LIMITS.MAX_CSS_TOTAL_CHARS < 102400 / 2, "leaves room for site settings and themes");
});

await test("M2: setCustomCss refuses CSS that would push the total over the cap, in plain language", async () => {
  stubCss();
  const chunk = "a{color:red}".padEnd(5000, " ");
  for (let i = 0; i < 8; i++) assert.deepStrictEqual(await S.setCustomCss(`t${i}.com`, chunk), { ok: true }, `site ${i}`);
  const over = await S.setCustomCss("t8.com", "b{color:red}");
  assert.strictEqual(over.ok, false);
  assert.ok(/40,000 characters/.test(over.error) && !/QUOTA/.test(over.error), over.error);
  assert.strictEqual(store["__css:t8.com"], undefined, "nothing written");
  // replacing an existing site's CSS counts only the new text
  assert.deepStrictEqual(await S.setCustomCss("t0.com", "c{color:red}"), { ok: true });
  assert.deepStrictEqual(await S.setCustomCss("t8.com", "b{color:red}"), { ok: true });
});

await test("M2: import refuses custom CSS that would push the total over the cap and stores nothing", async () => {
  stubCss();
  const chunk = "a{color:red}".padEnd(5000, " ");
  for (let i = 0; i < 6; i++) await S.setCustomCss(`u${i}.com`, chunk);
  const before = JSON.stringify(store);
  const customCss = { "v1.com": chunk, "v2.com": chunk, "v3.com": chunk };
  await assert.rejects(
    () => S.importSettingsJson(JSON.stringify({ settings: { "w.com": { enabled: true } }, customCss })),
    (e) => /40,000 characters/.test(e.message) && /Nothing was imported/.test(e.message)
  );
  assert.strictEqual(JSON.stringify(store), before, "nothing partially stored");
  // re-importing the same sites replaces them, so it fits
  const same = {}; for (let i = 0; i < 6; i++) same[`u${i}.com`] = chunk;
  assert.ok(await S.importSettingsJson(JSON.stringify({ customCss: same })) >= 6);
});

await test("M2: an item over 8,192 bytes says too large for one item, not storage full", async () => {
  useRealCss();
  const css = "/* " + "é".repeat(5000) + " */ a{color:red}"; // under 6000 chars, over 8192 UTF-8 bytes
  assert.ok(css.length <= Themes.LIMITS.MAX_CSS_CHARS);
  assert.strictEqual(realValidateCss(css).ok, true);
  let writes = 0;
  failSetWhen = () => { writes++; return false; };
  const r = await S.setCustomCss("x.com", css);
  assert.strictEqual(r.ok, false);
  assert.ok(/too large for one item/.test(r.error), r.error);
  assert.ok(!/storage is full/i.test(r.error));
  assert.strictEqual(writes, 0, "decided before writing");
  assert.strictEqual(await S.getCustomCss("x.com"), "");
  // a quota failure on a small item still says storage is full
  failSetWhen = () => true;
  const q = await S.setCustomCss("y.com", "a{color:red}");
  assert.ok(/storage is full/i.test(q.error), q.error);
});

// ----- M3: imported custom CSS hosts must be clean hostnames -----
await test("M3: import skips custom CSS whose host is not a clean hostname", async () => {
  useRealCss();
  const customCss = { "Example.COM": "a{color:red}", "a b/c": "a{color:red}", " x.com": "a{color:red}", "y.com.": "a{color:red}", "ok.com": "a{color:red}", "local_files": "a{color:blue}" };
  await S.importSettingsJson(JSON.stringify({ customCss }));
  assert.deepStrictEqual(Object.keys(store).filter((k) => k.startsWith("__css:")).sort(), ["__css:local_files", "__css:ok.com"]);
  store = {};
  await assert.rejects(() => S.importSettingsJson(JSON.stringify({ customCss: { "Bad Host": "a{color:red}" } })));
  assert.deepStrictEqual(Object.keys(store), []);
});

// ----- T8: deleteCustomTheme reports write failures -----
await test("T8: deleteCustomTheme returns {ok:true} and {ok:false} on quota failure leaving the theme in place", async () => {
  await S.saveCustomTheme(mkTheme(1));
  await S.saveCustomTheme(mkTheme(2));
  failSetWhen = () => true;
  const r = await S.deleteCustomTheme("user:t-1");
  assert.strictEqual(r.ok, false);
  assert.ok(typeof r.error === "string" && r.error.length > 0);
  failSetWhen = null;
  assert.deepStrictEqual((await S.getCustomThemes()).map((t) => t.id), ["user:t-1", "user:t-2"]);
  assert.deepStrictEqual(await S.deleteCustomTheme("user:t-1"), { ok: true });
  assert.deepStrictEqual((await S.getCustomThemes()).map((t) => t.id), ["user:t-2"]);
  assert.deepStrictEqual(await S.deleteCustomTheme("user:gone"), { ok: true });
});

// ----- T3: a storage error during import gets a plain-language message -----
await test("T3: a storage error during import says nothing was imported, in plain language", async () => {
  await S.saveCustomTheme(mkTheme(1));
  const before = JSON.stringify(store);
  failSetWhen = () => true;
  await assert.rejects(
    () => S.importSettingsJson(JSON.stringify({ settings: { "d.com": { enabled: true } }, themes: [mkTheme(2)] })),
    (e) => e.message === "Import failed: the data is too large for browser sync storage. Nothing was imported."
  );
  failSetWhen = null;
  assert.strictEqual(JSON.stringify(store), before);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
