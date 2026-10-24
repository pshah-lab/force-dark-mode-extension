// tests/native_dark_test.mjs
// Natively dark pages: the broadened detection signals (attributes, class tokens, root containers) and their
// false-positive guards, the per-site `nativeDark` override ("respect" | "force") across the Auto, CSS and Invert
// engines, the no-teardown signature, the pre-paint flag, storage and the side panel notice.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

console.log("=========================================");
console.log("🌙 Running Native Dark Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) {
  pending.push(async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  });
}

// --- harness: the content scripts in a sandbox with a small, tree-shaped DOM --------------------------------

const SCRIPTS = [
  "src/shared/colorUtils.js",
  "src/shared/themeCore.js",
  "src/shared/builtinThemes.js",
  "src/shared/sitePacks.js",
  "src/shared/customCss.js",
  "src/content/themeEngine/cssOverrideEngine.js",
  "src/content/themeEngine/invertEngine.js",
  "src/content/index.js",
].map((rel) => [rel, read(rel)]);

const VIEWPORT = { width: 1024, height: 768 };

// One simple selector: tag, #id, [attr] or [attr=value] (what the detection code queries).
function matchesSimple(el, sel) {
  const s = sel.trim();
  if (!s) return false;
  if (s === "*") return true;
  if (s.startsWith("#")) return el.id === s.slice(1);
  const attr = /^\[([a-z-]+)(?:=["']?([^"'\]]*)["']?)?\]$/i.exec(s);
  if (attr) return attr[2] === undefined ? el.hasAttribute(attr[1]) : el.getAttribute(attr[1]) === attr[2];
  return /^[a-z][a-z0-9-]*$/i.test(s) && el.tagName.toLowerCase() === s.toLowerCase();
}

class El {
  constructor(tag, doc, computed = {}, rect) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.textContent = "";
    this.nodeType = 1;
    this.id = "";
    this.disabled = false;
    this.computed = computed;
    this.rect = rect || { width: 300, height: 40 };
    const props = new Map();
    this.style = {
      setProperty: (k, v) => props.set(k, v),
      removeProperty: (k) => props.delete(k),
      getPropertyValue: (k) => props.get(k) || "",
    };
    const tokens = () => String(this.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    this.classList = { contains: (c) => tokens().includes(c) };
  }
  setAttribute(n, v) { this.attributes.set(n, String(v)); if (n === "id") this.id = String(v); }
  getAttribute(n) { return this.attributes.has(n) ? this.attributes.get(n) : null; }
  removeAttribute(n) { this.attributes.delete(n); }
  hasAttribute(n) { return this.attributes.has(n); }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  remove() {
    const list = this.parentElement?.children;
    if (list && list.includes(this)) list.splice(list.indexOf(this), 1);
    this.parentElement = null;
  }
  getBoundingClientRect() {
    const { width, height } = this.rect;
    return { left: 0, top: 0, right: width, bottom: height, width, height };
  }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  querySelectorAll(sel) {
    const parts = String(sel).split(",");
    return this.descendants().filter((e) => parts.some((p) => matchesSimple(e, p)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  matches(sel) { return String(sel).split(",").some((p) => matchesSimple(this, p)); }
  closest() { return null; }
}

// engineDarkens: while the CSS engine style is present and enabled, every element computes as dark (as it
// does in a real browser), so an analysis that does not suspend our styles would see a "natively dark" page.
function load({ sync = {}, hostname = "example.com", osDark = false, prepaint = null, engineDarkens = false } = {}) {
  const ctx = {};
  const storageLog = [];
  const local = new Map(prepaint ? [["__fdm_pre", prepaint]] : []);
  const doc = {
    readyState: "complete",
    listeners: {},
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
    createElement: (tag) => new El(tag, doc),
    getElementById(id) {
      const find = (el) => (el.id === id ? el : el.children.map(find).find(Boolean) || null);
      return find(doc.documentElement);
    },
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    createTreeWalker(root, show, filter) {
      const nodes = [];
      const walk = (el) => el.children.forEach((c) => { if (filter.acceptNode(c) === 1) nodes.push(c); walk(c); });
      walk(root);
      let i = 0;
      return { nextNode: () => nodes[i++] || null };
    },
  };
  doc.documentElement = new El("html", doc, {}, { width: VIEWPORT.width, height: 3000 });
  doc.head = doc.documentElement.appendChild(new El("head", doc));
  doc.body = doc.documentElement.appendChild(new El("body", doc, {}, { width: VIEWPORT.width, height: 3000 }));

  const computedStyle = (el) => {
    const base = {
      display: "block",
      visibility: "visible",
      opacity: "1",
      color: "rgb(20, 20, 20)",
      backgroundImage: "none",
      backgroundColor: el === doc.documentElement ? "rgb(255, 255, 255)" : "rgba(0, 0, 0, 0)",
      colorScheme: "",
      ...el.computed,
    };
    const ours = doc.getElementById("__force_dark_mode__");
    if (engineDarkens && ours && !ours.disabled) {
      base.backgroundColor = "rgb(18, 18, 18)";
      base.color = "rgb(230, 230, 230)";
    }
    return base;
  };
  const area = (data) => ({ get: (keys, cb) => cb(data), set: (obj, cb) => cb && cb() });
  Object.assign(ctx, {
    console,
    document: doc,
    location: { hostname, href: `https://${hostname}/page` },
    innerWidth: VIEWPORT.width,
    innerHeight: VIEWPORT.height,
    getComputedStyle: computedStyle,
    matchMedia: (q) => ({ matches: osDark && /dark/.test(q) }),
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    requestIdleCallback: () => 1,
    cancelIdleCallback() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    MutationObserver: class { observe() {} disconnect() {} },
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ELEMENT: 1 },
    Element: El,
    chrome: {
      storage: {
        sync: area(sync),
        local: area({}),
        onChanged: { addListener: (fn) => { ctx.__onChanged = fn; } },
      },
      runtime: {
        id: "test-extension",
        onMessage: { addListener: (fn) => { ctx.__onMessage = fn; } },
        sendMessage() {},
      },
    },
  });
  const localStorage = {
    getItem: (k) => (local.has(k) ? local.get(k) : null),
    setItem: (k, v) => { storageLog.push(["set", k]); local.set(k, String(v)); },
    removeItem: (k) => { storageLog.push(["remove", k]); local.delete(k); },
  };
  Object.defineProperty(ctx, "localStorage", { get: () => localStorage });
  ctx.window = ctx;
  ctx.top = ctx;
  vm.createContext(ctx);
  const evalIn = (code) => vm.runInContext(code, ctx);
  const add = (parent, tag, computed, rect, attrs = {}) => {
    const el = parent.appendChild(new El(tag, doc, computed, rect));
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  // Build the page before the scripts run, so the first apply sees it.
  const f = { ctx, doc, local, storageLog, evalIn, add };
  f.boot = () => {
    for (const [rel, code] of SCRIPTS) vm.runInContext(code, ctx, { filename: rel });
    return f;
  };
  f.analyze = () => evalIn("analyzePageForEngine()");
  f.cssStyle = () => doc.getElementById("__force_dark_mode__");
  f.invertStyle = () => doc.getElementById("__force_dark_invert__");
  f.change = (cfg) => ctx.__onChanged({ [hostname]: { newValue: cfg } }, "sync");
  f.ask = (type) => { let out; ctx.__onMessage({ type }, { id: "test-extension" }, (r) => { out = r; }); return out; };
  return f;
}

const DARK = "rgb(18, 18, 18)";
const WHITE = "rgb(255, 255, 255)";
const CLEAR = "rgba(0, 0, 0, 0)";
const LIGHT_TEXT = "rgb(230, 230, 230)";

// A page whose html and body paint nothing (transparent) and whose 25 text rows paint nothing either: no
// colour signal at all, so the attribute / class signals alone decide.
function neutralPage(f, { html = {}, body = {} } = {}) {
  f.doc.documentElement.computed = { backgroundColor: CLEAR };
  f.doc.body.computed = { backgroundColor: CLEAR };
  for (const [k, v] of Object.entries(html)) f.doc.documentElement.setAttribute(k, v);
  for (const [k, v] of Object.entries(body)) f.doc.body.setAttribute(k, v);
  rows(f, f.doc.body, { backgroundColor: CLEAR, color: LIGHT_TEXT });
  return f;
}

function rows(f, parent, computed, n = 25) {
  for (let i = 0; i < n; i++) {
    const row = f.add(parent, "div", computed);
    row.textContent = `A readable row of text number ${i}`;
  }
}

// A page painted dark (html and body), with dark rows: what YouTube, GitHub dark etc. compute to.
function darkPage(f) {
  f.doc.documentElement.computed = { backgroundColor: DARK, colorScheme: "dark" };
  f.doc.body.computed = { backgroundColor: DARK };
  rows(f, f.doc.body, { backgroundColor: DARK, color: LIGHT_TEXT });
  return f;
}

function lightPage(f) {
  f.doc.documentElement.computed = { backgroundColor: WHITE };
  f.doc.body.computed = { backgroundColor: WHITE };
  rows(f, f.doc.body, { backgroundColor: WHITE, color: "rgb(20, 20, 20)" });
  return f;
}

const nativeDarkWith = (opts) => neutralPage(load(), opts).boot().analyze().nativeDark;

// --- 1. detection: attribute signals ------------------------------------------------------------------------

test("baseline: a page with no colour and no dark signal is not natively dark", () => {
  assert.strictEqual(nativeDarkWith({}), false);
});

test('data-bs-theme="dark" (Bootstrap 5.3) on html or body is a dark signal; "light" is not', () => {
  assert.strictEqual(nativeDarkWith({ html: { "data-bs-theme": "dark" } }), true, "html");
  assert.strictEqual(nativeDarkWith({ body: { "data-bs-theme": "dark" } }), true, "body");
  assert.strictEqual(nativeDarkWith({ html: { "data-bs-theme": "light" } }), false, "light");
  assert.strictEqual(nativeDarkWith({ html: { "data-bs-theme": "auto" } }), false, "auto");
});

test("data-theme / data-color-mode / data-color-scheme / data-mode with a dark token on html and body", () => {
  for (const attr of ["data-theme", "data-color-mode", "data-color-scheme", "data-mode"]) {
    assert.strictEqual(nativeDarkWith({ html: { [attr]: "dark" } }), true, `${attr}=dark on html`);
    assert.strictEqual(nativeDarkWith({ body: { [attr]: "dark" } }), true, `${attr}=dark on body`);
    assert.strictEqual(nativeDarkWith({ html: { [attr]: "light" } }), false, `${attr}=light`);
  }
  assert.strictEqual(nativeDarkWith({ html: { "data-theme": "github-dark" } }), true, "github-dark");
  assert.strictEqual(nativeDarkWith({ html: { "data-theme": "dark_dimmed" } }), true, "dark_dimmed");
  assert.strictEqual(nativeDarkWith({ html: { "data-theme": "Dark" } }), true, "case-insensitive");
  assert.strictEqual(nativeDarkWith({ html: { "data-theme": "night" } }), true, "night");
});

test("attribute values are matched by token, so darkroom / darken / nightingale are not dark", () => {
  assert.strictEqual(nativeDarkWith({ html: { "data-theme": "darkroom" } }), false);
  assert.strictEqual(nativeDarkWith({ html: { "data-mode": "darken" } }), false);
  assert.strictEqual(nativeDarkWith({ body: { "data-theme": "nightingale" } }), false);
  assert.strictEqual(nativeDarkWith({ html: { "data-color-scheme": "light dark" } }), false,
    "'light dark' declares support for both, not a dark render");
});

test('data-color-mode="auto" (GitHub) follows the OS preference', () => {
  const page = (osDark) => neutralPage(load({ osDark }), { html: { "data-color-mode": "auto" } }).boot().analyze().nativeDark;
  assert.strictEqual(page(true), true, "OS prefers dark");
  assert.strictEqual(page(false), false, "OS prefers light");
});

test("the existing signals still count: the dark attribute and the dark / dark-theme / theme-dark classes", () => {
  assert.strictEqual(nativeDarkWith({ html: { dark: "" } }), true);
  for (const cls of ["dark", "dark-theme", "theme-dark"]) {
    assert.strictEqual(nativeDarkWith({ html: { class: cls } }), true, `html.${cls}`);
    assert.strictEqual(nativeDarkWith({ body: { class: cls } }), true, `body.${cls}`);
  }
});

// --- 2. detection: class tokens -----------------------------------------------------------------------------

test("class tokens dark-mode / darkmode / night / night-mode / theme--dark are dark signals", () => {
  for (const cls of ["dark-mode", "darkmode", "night", "night-mode", "theme--dark", "is-dark"]) {
    assert.strictEqual(nativeDarkWith({ html: { class: `js ${cls} loaded` } }), true, `html.${cls}`);
    assert.strictEqual(nativeDarkWith({ body: { class: cls } }), true, `body.${cls}`);
  }
});

test("class names that merely contain 'dark' or 'night' are not dark signals", () => {
  for (const cls of ["dark-blue-header", "darkroom", "has-dark-footer", "nightlife", "no-dark", "header--dark-text"]) {
    assert.strictEqual(nativeDarkWith({ html: { class: cls } }), false, `html.${cls}`);
    assert.strictEqual(nativeDarkWith({ body: { class: cls } }), false, `body.${cls}`);
  }
});

test("signals on the root app container (#app, #root, #__next, main, [role=main]) count too", () => {
  for (const [tag, attrs] of [["div", { id: "app" }], ["div", { id: "root" }], ["div", { id: "__next" }], ["main", {}], ["div", { role: "main" }]]) {
    const f = load();
    f.doc.documentElement.computed = { backgroundColor: CLEAR };
    f.doc.body.computed = { backgroundColor: CLEAR };
    const container = f.add(f.doc.body, tag, { backgroundColor: CLEAR }, { width: 1024, height: 2000 }, { ...attrs, "data-theme": "dark" });
    rows(f, container, { backgroundColor: CLEAR, color: LIGHT_TEXT });
    assert.strictEqual(f.boot().analyze().nativeDark, true, `${tag} ${JSON.stringify(attrs)}`);
  }
  // A dark-themed widget deep in the page is not the root container.
  const f = load();
  f.doc.documentElement.computed = { backgroundColor: CLEAR };
  f.doc.body.computed = { backgroundColor: CLEAR };
  rows(f, f.doc.body, { backgroundColor: CLEAR, color: LIGHT_TEXT });
  f.add(f.doc.body, "div", {}, { width: 200, height: 100 }, { class: "widget", "data-theme": "dark" });
  assert.strictEqual(f.boot().analyze().nativeDark, false, "a widget's data-theme does not count");
});

test("a dark signal never wins over an opaque light canvas (the existing guard)", () => {
  for (const attrs of [{ "data-bs-theme": "dark" }, { class: "dark-mode" }, { "data-theme": "dark" }]) {
    const f = load();
    lightPage(f);
    for (const [k, v] of Object.entries(attrs)) f.doc.documentElement.setAttribute(k, v);
    assert.strictEqual(f.boot().analyze().nativeDark, false, JSON.stringify(attrs));
  }
  const f = load();
  neutralPage(f, { html: { "data-bs-theme": "dark" } });
  f.doc.body.computed = { backgroundColor: WHITE };
  assert.strictEqual(f.boot().analyze().nativeDark, false, "body paints white under a transparent html");
});

// --- 3. detection: a dark app container in a bright body ----------------------------------------------------

test("a transparent #root wrapping a dark full-viewport main is found (largest opaque container wins)", () => {
  const f = load();
  f.doc.documentElement.computed = { backgroundColor: WHITE };
  f.doc.body.computed = { backgroundColor: WHITE };
  const root = f.add(f.doc.body, "div", { backgroundColor: CLEAR }, { width: 1024, height: 3000 }, { id: "root" });
  const main = f.add(root, "main", { backgroundColor: DARK }, { width: 1024, height: 3000 });
  rows(f, main, { backgroundColor: CLEAR, color: LIGHT_TEXT });
  const analysis = f.boot().analyze();
  assert.strictEqual(analysis.nativeDark, true, "a dark app filling the viewport is dark even though body is white");
});

test("a small dark main in a white body is not natively dark", () => {
  const f = load();
  f.doc.documentElement.computed = { backgroundColor: WHITE };
  f.doc.body.computed = { backgroundColor: WHITE };
  const main = f.add(f.doc.body, "main", { backgroundColor: DARK }, { width: 400, height: 300 });
  rows(f, main, { backgroundColor: CLEAR, color: "rgb(20, 20, 20)" });
  assert.strictEqual(f.boot().analyze().nativeDark, false);
});

test("a dark full-viewport container with many light cards is not natively dark", () => {
  const f = load();
  f.doc.documentElement.computed = { backgroundColor: WHITE };
  f.doc.body.computed = { backgroundColor: WHITE };
  const app = f.add(f.doc.body, "div", { backgroundColor: DARK }, { width: 1024, height: 3000 }, { id: "app" });
  rows(f, app, { backgroundColor: WHITE, color: "rgb(20, 20, 20)" });
  assert.strictEqual(f.boot().analyze().nativeDark, false);
});

test("a light page and a 'light dark' page under a dark OS stay not natively dark", () => {
  assert.strictEqual(lightPage(load()).boot().analyze().nativeDark, false);
  const f = load({ osDark: true });
  lightPage(f);
  f.doc.documentElement.computed.colorScheme = "light dark";
  assert.strictEqual(f.boot().analyze().nativeDark, false);
});

// --- 4. the nativeDark override across engines --------------------------------------------------------------

const dark = (cfg, opts) => darkPage(load({ sync: { "example.com": cfg }, ...opts })).boot();

test("respect (and a missing field): Auto and Invert leave a natively dark page alone", () => {
  for (const cfg of [{ enabled: true, engine: "auto" }, { enabled: true, engine: "auto", nativeDark: "respect" }]) {
    const f = dark(cfg);
    assert.strictEqual(f.cssStyle(), null, `Auto: ${JSON.stringify(cfg)}`);
    assert.strictEqual(f.invertStyle(), null);
  }
  for (const cfg of [{ enabled: true, engine: "invert" }, { enabled: true, engine: "invert", nativeDark: "respect" }]) {
    const f = dark(cfg);
    assert.strictEqual(f.invertStyle(), null, `Invert: ${JSON.stringify(cfg)}`);
  }
});

test("force: Auto themes a natively dark page with the CSS engine", () => {
  const f = dark({ enabled: true, engine: "auto", nativeDark: "force" });
  assert.ok(f.cssStyle(), "CSS engine applied");
  assert.strictEqual(f.invertStyle(), null, "Auto falls back to CSS, never Invert, on a dark page");
});

test("force: Invert inverts a natively dark page when Invert is selected", () => {
  const f = dark({ enabled: true, engine: "invert", nativeDark: "force" });
  assert.ok(f.invertStyle(), "Invert applied");
  assert.strictEqual(f.cssStyle(), null);
});

test("CSS engine: applies on a natively dark page with force, and (as before) with respect", () => {
  assert.ok(dark({ enabled: true, engine: "css", nativeDark: "force" }).cssStyle());
  assert.ok(dark({ enabled: true, engine: "css" }).cssStyle(), "unchanged behaviour: CSS never skipped dark pages");
});

test("force does nothing while dark mode is off for the site", () => {
  const f = dark({ enabled: false, engine: "auto", nativeDark: "force" });
  assert.strictEqual(f.cssStyle(), null);
  assert.strictEqual(f.invertStyle(), null);
});

test("force on a light page changes nothing: Auto still picks its usual engine", () => {
  const f = lightPage(load({ sync: { "example.com": { enabled: true, engine: "auto", nativeDark: "force" } } })).boot();
  assert.ok(f.cssStyle());
});

test("an unknown nativeDark value behaves as respect", () => {
  const f = dark({ enabled: true, engine: "auto", nativeDark: "always" });
  assert.strictEqual(f.cssStyle(), null);
});

// --- 5. re-apply, signature and pre-paint -------------------------------------------------------------------

test("engineSignature includes nativeDark (missing and respect are the same)", () => {
  const f = load().boot();
  const sig = (v) => f.evalIn(`engineSignature("css", {}, {}, false, null, ${JSON.stringify(v)})`);
  assert.notStrictEqual(sig("respect"), sig("force"));
  const base = f.evalIn('engineSignature("css", {}, {}, false, null)');
  assert.strictEqual(base, sig("respect"));
});

test("switching respect -> force applies, force -> respect tears down, unchanged force keeps the style", () => {
  const cfg = { enabled: true, engine: "invert" };
  const f = dark(cfg);
  assert.strictEqual(f.invertStyle(), null);
  f.change({ ...cfg, nativeDark: "force" });
  const style = f.invertStyle();
  assert.ok(style, "force applies");
  f.change({ ...cfg, nativeDark: "force" });
  assert.strictEqual(f.invertStyle(), style, "same config: no teardown");
  f.change({ ...cfg, nativeDark: "respect" });
  assert.strictEqual(f.invertStyle(), null, "respect removes it");
});

test("Auto + force: the CSS style is kept across an unchanged re-apply", () => {
  const cfg = { enabled: true, engine: "auto", nativeDark: "force" };
  const f = dark(cfg);
  const style = f.cssStyle();
  f.change({ ...cfg });
  assert.strictEqual(f.cssStyle(), style);
});

test("pre-paint flag: written for a forced natively dark page, removed when respected", () => {
  const forced = dark({ enabled: true, engine: "auto", nativeDark: "force" });
  assert.match(forced.local.get("__fdm_pre") || "", /^1:\d+$/, "forced page counts as dark-applied");
  const respected = dark({ enabled: true, engine: "auto" }, { prepaint: `1:${Date.now()}` });
  assert.strictEqual(respected.local.has("__fdm_pre"), false, "a skipped page leaves no flag");
  for (const [, key] of [...forced.storageLog, ...respected.storageLog]) assert.strictEqual(key, "__fdm_pre");
});

// --- 6. the panel's analysis ignores our own styles ---------------------------------------------------------

test("ANALYZE_PAGE suspends our engine styles, so a themed light page is not reported as natively dark", () => {
  const f = lightPage(load({ sync: { "example.com": { enabled: true, engine: "css" } }, engineDarkens: true })).boot();
  const style = f.cssStyle();
  assert.ok(style, "CSS engine applied on the light page");
  assert.strictEqual(f.analyze().nativeDark, true, "harness check: with our styles on, the page computes dark");
  const reply = f.ask("ANALYZE_PAGE");
  assert.strictEqual(reply.nativeDark, false, "the panel sees the page's own colours");
  assert.strictEqual(style.disabled, false, "our style is switched back on afterwards");
});

test("ANALYZE_PAGE on a forced dark page still reports nativeDark, so the panel can offer to undo", () => {
  const f = dark({ enabled: true, engine: "auto", nativeDark: "force" }, { engineDarkens: true });
  assert.strictEqual(f.ask("ANALYZE_PAGE").nativeDark, true);
});

// --- 7. storage and the service worker ----------------------------------------------------------------------

test("constants: VALID_NATIVE_DARK_MODES and nativeDarkFieldsFor (message wins, stored kept, invalid dropped)", async () => {
  const c = await import("../src/shared/constants.js");
  assert.deepStrictEqual([...c.VALID_NATIVE_DARK_MODES], ["respect", "force"]);
  assert.strictEqual(c.DEFAULT_NATIVE_DARK_MODE, "respect");
  assert.deepStrictEqual(c.nativeDarkFieldsFor({ nativeDark: "force" }, {}), { nativeDark: "force" });
  assert.deepStrictEqual(c.nativeDarkFieldsFor({}, { nativeDark: "force" }), { nativeDark: "force" });
  assert.deepStrictEqual(c.nativeDarkFieldsFor({ nativeDark: "respect" }, { nativeDark: "force" }), { nativeDark: "respect" });
  assert.deepStrictEqual(c.nativeDarkFieldsFor({ nativeDark: "<x>" }, undefined), {}, "nothing valid: field stays missing");
  assert.deepStrictEqual(c.nativeDarkFieldsFor({ nativeDark: "__proto__" }, { nativeDark: "toString" }), {});
});

test("setSiteConfig and import keep a valid nativeDark and drop an invalid one; old shapes unchanged", async () => {
  const data = {};
  globalThis.chrome = {
    runtime: { lastError: null, id: "t" },
    storage: {
      sync: {
        get: (key, cb) => cb(key === null ? { ...data } : typeof key === "string" ? { [key]: data[key] } : {}),
        set: (items, cb) => { Object.assign(data, items); cb && cb(); },
      },
      local: { get: (k, cb) => cb({}), set: (i, cb) => cb && cb() },
    },
  };
  const storage = await import("../src/shared/storage.js");
  await storage.setSiteConfig("a.com", { enabled: true, engine: "auto", nativeDark: "force" });
  assert.strictEqual(data["a.com"].nativeDark, "force");
  await storage.setSiteConfig("b.com", { enabled: true, nativeDark: "always" });
  assert.ok(!("nativeDark" in data["b.com"]), "invalid dropped");
  await storage.setSiteConfig("c.com", { enabled: true });
  assert.ok(!("nativeDark" in data["c.com"]), "old shape unchanged (missing = respect)");
  await storage.importSettingsJson(JSON.stringify({ settings: { "d.com": { enabled: true, nativeDark: "force" } } }));
  assert.strictEqual(data["d.com"].nativeDark, "force");
});

test("service worker keeps nativeDark across every TOGGLE", () => {
  const sw = read("src/background/serviceWorker.js");
  assert.ok(/nativeDarkFieldsFor\(msg, currentConfig\)/.test(sw));
});

// --- 8. the side panel notice -------------------------------------------------------------------------------

function loadPopupScript() {
  const ctx = { document: { addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(read("src/popup/popup.js"), ctx, { filename: "popup.js" });
  return ctx;
}

test("panel notice state: shown only when the page is natively dark; the button flips the setting", () => {
  const { nativeDarkNotice } = loadPopupScript();
  assert.strictEqual(typeof nativeDarkNotice, "function");
  assert.strictEqual(nativeDarkNotice(null, undefined).visible, false, "no analysis yet");
  assert.strictEqual(nativeDarkNotice({ nativeDark: false }, "force").visible, false, "light page");
  const respect = nativeDarkNotice({ nativeDark: true }, undefined);
  assert.strictEqual(respect.visible, true);
  assert.strictEqual(respect.text, "This site is already dark");
  assert.strictEqual(respect.button, "Theme it anyway");
  assert.strictEqual(respect.next, "force");
  const forced = nativeDarkNotice({ nativeDark: true }, "force");
  assert.strictEqual(forced.visible, true);
  assert.strictEqual(forced.button, "Respect site's dark theme");
  assert.strictEqual(forced.next, "respect");
  assert.strictEqual(nativeDarkNotice({ nativeDark: true }, "bogus").next, "force", "unknown = respect");
});

test("panel markup: a hidden, labelled notice with a real button", () => {
  const html = read("src/popup/popup.html");
  const block = (html.match(/<div[^>]*id="native-dark"[\s\S]*?<\/div>/) || [])[0];
  assert.ok(block, "a div#native-dark exists");
  assert.ok(/\bhidden\b/.test(block.split(">")[0]), "hidden until the page is natively dark");
  assert.ok(/role="status"/.test(block.split(">")[0]), "announced politely");
  assert.ok(/id="native-dark-text"[^>]*>\s*This site is already dark\s*</.test(block));
  assert.ok(/<button[^>]*type="button"[^>]*id="native-dark-toggle"[^>]*>\s*Theme it anyway\s*<\/button>/.test(block));
});

test("panel wiring: the button writes nativeDark through TOGGLE; analysis and storage refresh the notice", () => {
  const js = read("src/popup/popup.js");
  const start = js.indexOf("nativeDarkToggle.onclick");
  assert.ok(start > -1, "the button has a handler");
  const handler = js.slice(start, js.indexOf("};\n", start));
  assert.ok(/type: "TOGGLE"/.test(handler) && /nativeDark: /.test(handler) && /forceEnabled/.test(handler), handler);
  assert.ok(/function updateNativeDarkNotice/.test(js));
  const rec = js.slice(js.indexOf("function requestRecommendation"), js.indexOf("function updateSelectedEngine"));
  assert.ok(/updateNativeDarkNotice\(\)/.test(rec), "refreshed when the analysis arrives");
  const changed = js.slice(js.indexOf("chrome.storage.onChanged.addListener"), js.indexOf("function updateUI"));
  assert.ok(/config\.nativeDark/.test(changed), "refreshed when the site config changes");
  const css = read("src/popup/popup.css");
  assert.ok(/\.native-dark\[hidden\]\s*\{\s*display:\s*none/.test(css), "hidden really hides it");
});

for (const run of pending) await run();

console.log("\n=========================================");
console.log(`${failed ? "❌" : "🎉"} Native Dark Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");
if (failed > 0) process.exit(1);
