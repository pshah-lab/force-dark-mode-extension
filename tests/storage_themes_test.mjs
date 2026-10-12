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
  assert.strictEqual(parsed.version, "1.8.0");
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
