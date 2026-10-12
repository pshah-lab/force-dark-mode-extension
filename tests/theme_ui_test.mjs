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

test("C1: the popup colour picker sends themeId \"default\" and switches the dropdown to Default colour", () => {
  const js = read("src/popup/popup.js");
  const start = js.indexOf("backgroundColorInput.oninput");
  assert.ok(start > -1, "colour handler exists");
  const end = js.indexOf("function sendFilterUpdate", start);
  assert.ok(end > start, "end marker found");
  const handler = js.slice(start, end);
  assert.ok(/type: "TOGGLE"/.test(handler), "handler sends TOGGLE");
  assert.ok(/themeId:\s*"default"/.test(handler), "colour change sends themeId: \"default\"");
  assert.ok(/selectTheme\("default"\)/.test(handler), "colour change shows Default colour in the dropdown");
  const opts = plain(T.buildThemeOptions([], { name: "GitHub" }));
  assert.deepStrictEqual(opts.find((o) => o.value === "default").label, "Default colour");
  // dropdown changes keep sending the chosen themeId
  const dd = js.slice(js.indexOf("themeSelect.onchange"), js.indexOf("chrome.storage.onChanged", js.indexOf("themeSelect.onchange")));
  assert.ok(/\bthemeId,/.test(dd), "dropdown handler sends the chosen themeId");
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

// ---- duplicateName counter scheme (fix round 2) ----
test("duplicateName counter: explicit cases", () => {
  assert.strictEqual(T.duplicateName("X"), "X copy");
  assert.strictEqual(T.duplicateName("X copy"), "X copy 2");
  assert.strictEqual(T.duplicateName("X copy 2"), "X copy 3");
  assert.strictEqual(T.duplicateName("X copy 9"), "X copy 10");
  assert.strictEqual(T.duplicateName("  X copy 2  "), "X copy 3");
  const long = T.duplicateName("R".repeat(40));
  assert.ok(long.length <= 40 && long.endsWith(" copy") && long.startsWith("RRR"));
  const longN = T.duplicateName("R".repeat(33) + " copy 9");
  assert.ok(longN.length <= 40 && longN.endsWith(" copy 10"), longN);
});

test("duplicateName chains never repeat, stay <= 40 and have clean spacing", () => {
  for (const start of ["a".repeat(35) + " copy", "X", "Q".repeat(40), "Pad   ", "w ".repeat(19) + "w"]) {
    const seen = new Set([start]);
    let cur = start;
    for (let i = 0; i < 60; i++) {
      const next = T.duplicateName(cur);
      assert.ok(next.length <= T.LIMITS.MAX_NAME, `len ${next.length} from ${start}`);
      assert.notStrictEqual(next, cur);
      assert.ok(!seen.has(next), `repeat ${JSON.stringify(next)} in chain from ${JSON.stringify(start)}`);
      assert.ok(!/\s{2}/.test(next) && next === next.trim(), JSON.stringify(next));
      assert.ok(T.validateTheme({ id: "user:x", name: next, colors: { background: "#101010" } }).ok);
      seen.add(next);
      cur = next;
    }
  }
});

// ----- Task 10: Custom CSS manager -----
const CT = loadUmd(["src/shared/themeCore.js", "src/shared/customCss.js"]).ForceDarkThemes;

test("options.html has the Custom CSS card markup and loads customCss.js before the module script", () => {
  const html = read("src/options/options.html");
  for (const id of ["css-card", "css-host", "css-text", "css-counter", "css-error", "css-save", "css-list", "css-empty"]) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.ok(/<textarea[^>]*id="css-text"[^>]*maxlength="6000"/.test(html) || /<textarea[^>]*maxlength="6000"[^>]*id="css-text"/.test(html), "textarea maxlength 6000");
  assert.ok(/id="css-error"[^>]*role="alert"/.test(html) || /role="alert"[^>]*id="css-error"/.test(html), "role=alert area");
  assert.ok(/cannot introduce a URL/.test(html), "note must say CSS cannot introduce a URL");
  assert.ok(!/cannot cause any (network )?request/i.test(html), "must not overclaim");
  const sites = html.indexOf('src="../shared/sitePacks.js"');
  const css = html.indexOf('src="../shared/customCss.js"');
  const mod = html.indexOf('src="options.js"');
  assert.ok(sites > -1 && css > sites && mod > css, "order: sitePacks, customCss, options.js");
});

test("the Custom CSS code never uses innerHTML and is on the egress list", () => {
  const src = read("src/options/customCssEditor.js");
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(src));
  assert.ok(read("src/options/options.js").includes("customCssEditor.js"));
  assert.ok(read("tests/privacy_security_test.mjs").includes("src/options/customCssEditor.js"));
  assert.ok(!/innerHTML/.test(read("src/options/options.html")));
});

test("popup has the Site CSS link and builds options.html#css= with encodeURIComponent", () => {
  assert.ok(/id="site-css-link"/.test(read("src/popup/popup.html")));
  const js = read("src/popup/popup.js");
  assert.ok(js.includes("site-css-link"));
  assert.ok(/getURL\("src\/options\/options\.html"\)\s*\+\s*"#css="\s*\+\s*encodeURIComponent\(host\)/.test(js));
});

test("canSaveCss: host validity, empty CSS, forbidden constructs, 6000 vs 6001", () => {
  assert.strictEqual(CT.canSaveCss("", "a{color:red}").ok, false);
  assert.strictEqual(CT.canSaveCss("   ", "").ok, false);
  assert.strictEqual(CT.canSaveCss("https://a.com", "a{color:red}").ok, false);
  assert.strictEqual(CT.canSaveCss("a.com/x", "a{color:red}").ok, false);
  assert.strictEqual(CT.canSaveCss("__proto__", "a{color:red}").ok, false);
  const good = CT.canSaveCss("  BBC.com ", "h1{color:#ff0}");
  assert.strictEqual(good.ok, true);
  assert.strictEqual(good.host, "bbc.com");
  assert.strictEqual(CT.canSaveCss("bbc.com", "").ok, true, "empty css means delete");
  const bad = CT.canSaveCss("bbc.com", "a{background:url(x)}");
  assert.strictEqual(bad.ok, false);
  assert.ok(typeof bad.error === "string" && bad.error.includes("url("));
  const ok6000 = "a{color:red}" + " ".repeat(6000 - 12);
  assert.strictEqual(CT.canSaveCss("bbc.com", ok6000).ok, true);
  assert.strictEqual(CT.canSaveCss("bbc.com", ok6000 + " ").ok, false);
  assert.strictEqual(CT.canSaveCss("local_files", "a{color:red}").ok, true);
});

test("cssSites lists __css:* string entries sorted, ignoring junk", () => {
  const all = {
    "__css:zed.com": "a{}", "__css:alpha.com": "h1{color:red}\nmore",
    "__css:__proto__": "a{}", "__css:constructor": "a{}", "__css:": "a{}", "__css:bad host": "a{}",
    "__css:num.com": 5, "__css:obj.com": { x: 1 }, "__css:empty.com": "", "__css:Up.com": "a{}",
    "example.com": { enabled: true }, "__customThemes": [], "__css": "x",
  };
  assert.deepStrictEqual(plain(CT.cssSites(all)), [{ host: "alpha.com", length: 18 }, { host: "zed.com", length: 3 }]);
  assert.deepStrictEqual(plain(CT.cssSites(null)), []);
  assert.deepStrictEqual(plain(CT.cssSites({})), []);
});

console.log(`\n🎉 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
