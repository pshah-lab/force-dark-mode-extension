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
  assert.ok(end > start, "end marker chrome.storage.onChanged found after the handler");
  const handler = js.slice(start, end);
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

// ---- Theme editor helpers ----
const ID_RE = /^user:[a-z0-9-]{1,40}$/;
const formState = (over = {}) => ({
  name: "  Dusk  ",
  colors: { background: "#101820", surface: "", text: "#E8EAED", muted: "  ", link: "#8AB4F8", border: "" },
  imageDim: 20,
  ...over,
});

test("themeFromForm trims the name, lowercases hex, omits blank optional colours, assigns no id", () => {
  const t = plain(T.themeFromForm(formState()));
  assert.deepStrictEqual(t, { name: "Dusk", colors: { background: "#101820", text: "#e8eaed", link: "#8ab4f8" }, imageDim: 20 });
  assert.ok(!("id" in t));
});

test("themeFromForm clamps imageDim to 0..MAX_IMAGE_DIM and survives junk", () => {
  assert.strictEqual(T.themeFromForm(formState({ imageDim: 999 })).imageDim, T.LIMITS.MAX_IMAGE_DIM);
  assert.strictEqual(T.themeFromForm(formState({ imageDim: -5 })).imageDim, 0);
  assert.strictEqual(T.themeFromForm(formState({ imageDim: "30" })).imageDim, 30);
  assert.strictEqual(T.themeFromForm(formState({ imageDim: "abc" })).imageDim, 0);
  assert.strictEqual(T.themeFromForm(formState({ imageDim: 12.7 })).imageDim, 13);
  const t = plain(T.themeFromForm(null));
  assert.strictEqual(t.name, "");
  assert.strictEqual(t.imageDim, 0);
});

test("themeFromForm output validates once an id is added", () => {
  const t = plain(T.themeFromForm(formState()));
  assert.ok(T.validateTheme({ ...t, id: "user:x" }).ok);
});

const file = (o) => JSON.stringify(o);
const good = { id: "user:abc", name: "Mine", colors: { background: "#101820", text: "#eeeeee" }, imageDim: 10 };

test("importThemeFile accepts a valid file and assigns a fresh user: id", () => {
  const r = T.importThemeFile(file(good));
  assert.ok(r.ok, r.error);
  assert.match(r.theme.id, ID_RE);
  assert.notStrictEqual(r.theme.id, "user:abc");
  assert.strictEqual(r.theme.name, "Mine");
  assert.notStrictEqual(T.importThemeFile(file(good)).theme.id, r.theme.id);
});

test("importThemeFile never trusts a builtin: id from the file", () => {
  const r = T.importThemeFile(file({ ...good, id: "builtin:midnight" }));
  assert.ok(r.ok, r.error);
  assert.match(r.theme.id, ID_RE);
});

test("newThemeId returns distinct ids matching the user: pattern", () => {
  const a = T.newThemeId(), b = T.newThemeId();
  assert.match(a, ID_RE);
  assert.notStrictEqual(a, b);
});

test("importThemeFile accepts a file with no id", () => {
  const { id, ...noId } = good;
  const r = T.importThemeFile(file(noId));
  assert.ok(r.ok, r.error);
  assert.match(r.theme.id, ID_RE);
});

test("importThemeFile rejects oversize, bad JSON, non-objects", () => {
  const big = file({ ...good, name: "x".repeat(T.LIMITS.MAX_IMPORT_BYTES) });
  assert.strictEqual(T.importThemeFile(big).ok, false);
  for (const bad of ["{nope", "", "[]", "null", "5", '"s"']) {
    const r = T.importThemeFile(bad);
    assert.strictEqual(r.ok, false, bad);
    assert.strictEqual(typeof r.error, "string");
  }
  assert.strictEqual(T.importThemeFile(undefined).ok, false);
  assert.strictEqual(T.importThemeFile(42).ok, false);
});

test("importThemeFile rejects __proto__, constructor and markup in names", () => {
  assert.strictEqual(T.importThemeFile('{"id":"user:a","name":"A","colors":{"background":"#101010"},"__proto__":{"x":1}}').ok, false);
  assert.strictEqual(T.importThemeFile('{"name":"A","colors":{"background":"#101010","constructor":"x"}}').ok, false);
  assert.strictEqual(T.importThemeFile(file({ ...good, name: "<img onerror=x>" })).ok, false);
  assert.strictEqual(T.importThemeFile(file({ ...good, colors: { background: "red" } })).ok, false);
});

test("importThemeFile drops unknown keys", () => {
  const r = T.importThemeFile(file({ ...good, evil: "x", css: "body{}" }));
  assert.ok(r.ok);
  assert.deepStrictEqual(Object.keys(plain(r.theme)).sort(), ["colors", "id", "imageDim", "name"]);
});

test("options.html has the theme editor markup and loads theme scripts before options.js", () => {
  const html = read("src/options/options.html");
  for (const id of ["theme-name", "theme-start-from", "theme-image-dim", "theme-contrast", "theme-save", "theme-cancel", "my-themes", "theme-import-input", "theme-import-btn"]) {
    assert.ok(new RegExp(`id="${id}"`).test(html), `missing #${id}`);
  }
  assert.ok(/<section[^>]*id="theme-preview"[^>]*aria-label="Theme preview"/.test(html) || /<section[^>]*aria-label="Theme preview"[^>]*id="theme-preview"/.test(html));
  assert.ok(/id="theme-contrast"[^>]*role="status"|role="status"[^>]*id="theme-contrast"/.test(html));
  assert.ok(/maxlength="40"/.test(html));
  const order = ["colorUtils.js", "themeCore.js", "builtinThemes.js", "sitePacks.js", "options.js"].map((f) => html.indexOf(`src="${f.startsWith("options") ? "" : "../shared/"}${f}"`));
  assert.ok(order.every((i) => i > -1), "all scripts present");
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b), "script order");
  for (const key of ["background", "surface", "text", "muted", "link", "border"]) {
    assert.ok(new RegExp(`id="theme-color-${key}"`).test(html), `missing colour ${key}`);
    assert.ok(new RegExp(`for="theme-color-${key}"`).test(html), `missing label ${key}`);
  }
});

test("options editor code avoids innerHTML and writes theme text with textContent", () => {
  for (const f of ["src/options/options.js", "src/options/themeEditor.js"]) {
    const js = read(f);
    for (const re of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /\bfetch\s*\(/, /\beval\s*\(/, /https?:\/\//]) assert.ok(!re.test(js), `${f} has ${re}`);
  }
  const ed = read("src/options/themeEditor.js");
  assert.ok(/textContent/.test(ed));
  assert.ok(/revokeObjectURL/.test(ed));
  assert.ok(/confirm\(/.test(ed));
  assert.ok(!/\.style\.cssText|setAttribute\("style"/.test(ed), "no style strings");
});

test("options.js import message mentions sites, themes and custom CSS", () => {
  const js = read("src/options/options.js");
  assert.ok(/items \(sites, themes and custom CSS\)/.test(js));
  assert.ok(!/configuration entries/.test(js));
});

// ---- Editor pure helpers (fix round 1) ----
test("duplicateName always differs, fits 40 chars and ends with ' copy'", () => {
  for (const n of [1, 5, 30, 35, 36, 37, 38, 39, 40]) {
    const name = "a".repeat(n);
    const d = T.duplicateName(name);
    assert.ok(d.length <= 40, `len ${n}`);
    assert.notStrictEqual(d, name, `differs ${n}`);
    assert.ok(d.endsWith(" copy"), `suffix ${n}`);
    assert.ok(T.validateTheme({ id: "user:x", name: d, colors: { background: "#101010" } }).ok);
  }
  assert.strictEqual(T.duplicateName("Dusk"), "Dusk copy");
  const spaced = T.duplicateName(("ab ").repeat(14));
  assert.ok(!/\s{2}copy$/.test(spaced) && spaced.length <= 40);
  assert.strictEqual(T.duplicateName("x".repeat(500)).length, 40);
  assert.strictEqual(T.duplicateName(""), "copy");
  assert.strictEqual(T.duplicateName(undefined), "copy");
});

test("templateName appends ' custom' within 40 chars", () => {
  assert.strictEqual(T.templateName("Midnight"), "Midnight custom");
  for (const n of [34, 35, 38, 40, 100]) {
    const d = T.templateName("b".repeat(n));
    assert.ok(d.length <= 40 && d.endsWith(" custom"), `len ${n}`);
  }
});

test("safeFileName sanitises traversal, control chars, empties and long names", () => {
  const ok = (n) => /^themeswitcher-theme-[a-z0-9-]+\.json$/.test(n);
  for (const input of ["Dusk", "../../etc/passwd", "a\nb\u0000c\u0007", "", "@@@###", "x".repeat(500), "..\\..\\win", undefined, "Ünï"]) {
    const f = T.safeFileName(input);
    assert.ok(ok(f), `${JSON.stringify(input)} -> ${f}`);
    assert.ok(!f.includes("/") && !f.includes("\\") && !f.includes(".."));
    assert.ok(f.length <= 70);
  }
  assert.strictEqual(T.safeFileName("My Theme!"), "themeswitcher-theme-my-theme.json");
  assert.strictEqual(T.safeFileName("@@@"), "themeswitcher-theme-theme.json");
});

test("decision helpers: canSaveTheme refuses blocked contrast and blank names", () => {
  const good = { name: "A", colors: { background: "#101820" }, imageDim: 0 };
  assert.strictEqual(T.canSaveTheme(good), true);
  assert.strictEqual(T.canSaveTheme({ ...good, name: "" }), false);
  assert.strictEqual(T.canSaveTheme({ ...good, colors: { background: "#101820", text: "#101820" } }), false);
  assert.strictEqual(T.canSaveTheme({ ...good, colors: { background: "#101820", text: "#6b7480" } }), true); // warn still saves
});

test("decision helpers: importFileTooLarge guards on size before reading", () => {
  assert.strictEqual(T.importFileTooLarge({ size: T.LIMITS.MAX_IMPORT_BYTES + 1 }), true);
  assert.strictEqual(T.importFileTooLarge({ size: T.LIMITS.MAX_IMPORT_BYTES }), false);
  assert.strictEqual(T.importFileTooLarge(null), true);
});

test("themeEditor.js uses the guards, resets editingId on start-from, no live preview anchor", () => {
  const ed = read("src/options/themeEditor.js");
  assert.ok(/importFileTooLarge\(file\)/.test(ed));
  assert.ok(/canSaveTheme\(/.test(ed));
  assert.ok(/duplicateName\(/.test(ed) && /templateName\(/.test(ed) && /safeFileName\(/.test(ed));
  const h = ed.slice(ed.indexOf('startFrom.addEventListener("change"'));
  assert.ok(/editingId = null/.test(h.slice(0, 400)), "start-from resets editingId");
  assert.ok(!/<a\b/.test(read("src/options/options.html").match(/id="theme-preview"[\s\S]*?<\/section>/)[0]));
});

console.log(`\n🎉 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
