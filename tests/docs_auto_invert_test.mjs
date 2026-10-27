// tests/docs_auto_invert_test.mjs
// On Google Docs and Sheets editor pages the Auto engine resolves to Invert (the analysis itself says so, since
// the popup shows it). Explicit "css" / "invert" choices are respected; other pages and natively dark pages
// are untouched.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

console.log("=========================================");
console.log("📄 Running Docs/Sheets Auto-Invert Tests");
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

// --- harness: the content scripts in a sandbox (same shape as media_test.mjs), with a pathname -------------

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
    this.rect = rect || { width: 300, height: 200 };
    const props = new Map();
    this.style = {
      setProperty: (k, v) => props.set(k, v),
      removeProperty: (k) => props.delete(k),
      getPropertyValue: (k) => props.get(k) || "",
    };
    this.classList = { contains: () => false };
  }
  setAttribute(n, v) { this.attributes.set(n, String(v)); }
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
    const attr = /^\[([a-z-]+)\]$/.exec(sel);
    if (attr) return this.descendants().filter((e) => e.hasAttribute(attr[1]));
    if (sel === "*") return this.descendants();
    return [];
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  matches() { return false; }
  closest() { return null; }
}

function load({ sync = {}, hostname = "example.com", pathname = "/page" } = {}) {
  const ctx = {};
  const idleQueue = [];
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
  doc.documentElement = new El("html", doc, {}, { width: 1024, height: 3000 });
  doc.head = doc.documentElement.appendChild(new El("head", doc));
  doc.body = doc.documentElement.appendChild(new El("body", doc, {}, { width: 1024, height: 3000 }));

  const computedStyle = (el) => ({
    display: "block",
    visibility: "visible",
    opacity: "1",
    color: "rgb(20, 20, 20)",
    backgroundImage: "none",
    backgroundColor: el === doc.documentElement ? "rgb(255, 255, 255)" : "rgba(0, 0, 0, 0)",
    colorScheme: "",
    ...el.computed,
  });
  const area = (data) => ({ get: (keys, cb) => cb(data), set: (obj, cb) => cb && cb() });
  const windowListeners = {};
  Object.assign(ctx, {
    console,
    document: doc,
    location: { hostname, pathname, href: `https://${hostname}${pathname}` },
    innerWidth: 1024,
    innerHeight: 768,
    getComputedStyle: computedStyle,
    matchMedia: () => ({ matches: false }),
    addEventListener(t, fn) { (windowListeners[t] ||= []).push(fn); },
    removeEventListener() {},
    requestAnimationFrame: (fn) => { idleQueue.push(fn); return idleQueue.length; },
    cancelAnimationFrame() {},
    requestIdleCallback: (fn) => { idleQueue.push(fn); return idleQueue.length; },
    cancelIdleCallback() { idleQueue.length = 0; },
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
  Object.defineProperty(ctx, "localStorage", { get() { return { getItem: () => null, setItem() {}, removeItem() {} }; } });
  ctx.window = ctx;
  ctx.top = ctx;
  vm.createContext(ctx);
  for (const [rel, code] of SCRIPTS) vm.runInContext(code, ctx, { filename: rel });

  const evalIn = (code) => vm.runInContext(code, ctx);
  const invertStyle = () => doc.getElementById("__force_dark_invert__");
  const cssStyle = () => doc.getElementById("__force_dark_mode__");
  const fire = (type, event) => (windowListeners[type] || []).forEach((fn) => fn(event));
  return { ctx, doc, evalIn, invertStyle, cssStyle, fire };
}

const DOC = "/document/d/1AbC_xyz/edit";
const SHEET = "/spreadsheets/d/1AbC_xyz/edit#gid=0";
const REASON = "Google Docs/Sheets: Invert themes the canvas and the whole interface most reliably";

const analyze = (f) => f.evalIn("analyzePageForEngine()");
const pageOn = (hostname, pathname, engine, extra = {}) =>
  load({ hostname, pathname, sync: { [hostname]: { enabled: true, engine, ...extra } } });

// --- Auto on Docs / Sheets ----------------------------------------------------------------------------------

for (const [label, pathname] of [["Docs", DOC], ["Sheets", SHEET]]) {
  test(`Auto on a ${label} editor resolves to Invert and the analysis says so`, () => {
    const f = pageOn("docs.google.com", pathname, "auto");
    assert.ok(f.invertStyle(), "Invert engine style applied");
    assert.ok(!f.cssStyle(), "CSS engine not applied");
    const a = analyze(f);
    assert.strictEqual(a.engine, "invert");
    assert.strictEqual(a.confidence, "high");
    assert.strictEqual(a.reason, REASON);
    assert.strictEqual(a.nativeDark, false);
    assert.strictEqual(f.evalIn("resolveEngine({ engine: 'auto' })"), "invert");
  });

  test(`${label}: ANALYZE_PAGE (popup / side panel) reports the Docs analysis`, () => {
    const f = pageOn("docs.google.com", pathname, "auto");
    let out;
    f.ctx.__onMessage({ type: "ANALYZE_PAGE" }, { id: "test-extension" }, (r) => { out = r; });
    assert.strictEqual(out.engine, "invert");
    assert.strictEqual(out.reason, REASON);
    assert.ok(f.invertStyle(), "still themed after the suspended measurement");
  });

  test(`${label}: explicit CSS stays CSS, explicit Invert stays Invert`, () => {
    const css = pageOn("docs.google.com", pathname, "css");
    assert.ok(css.cssStyle() && !css.invertStyle(), "css");
    assert.strictEqual(css.evalIn("resolveEngine({ engine: 'css' })"), "css");
    const inv = pageOn("docs.google.com", pathname, "invert");
    assert.ok(inv.invertStyle() && !inv.cssStyle(), "invert");
  });

  test(`${label}: re-applying the same Auto config does not tear the engine down`, () => {
    const f = pageOn("docs.google.com", pathname, "auto");
    const style = f.invertStyle();
    f.ctx.__onChanged({ "docs.google.com": { newValue: { enabled: true, engine: "auto" } } }, "sync");
    assert.strictEqual(f.invertStyle(), style);
  });
}

// --- everything else is unchanged ---------------------------------------------------------------------------

test("Auto on Forms, other Google hosts and ordinary pages uses the normal analysis", () => {
  for (const [hostname, pathname] of [["docs.google.com", "/forms/d/x/edit"], ["drive.google.com", DOC], ["example.com", "/page"]]) {
    const f = pageOn(hostname, pathname, "auto");
    const a = analyze(f);
    assert.notStrictEqual(a.reason, REASON, `${hostname}${pathname}`);
    assert.strictEqual(f.evalIn("resolveEngine({ engine: 'auto' })"), a.engine, `${hostname}${pathname} follows analysis`);
  }
});

test("a natively dark page on a Docs path is still skipped and not forced to Invert", () => {
  const f = load({ hostname: "docs.google.com", pathname: DOC, sync: { "docs.google.com": { enabled: true, engine: "auto" } } });
  const DARK = "rgb(18, 18, 18)";
  f.doc.documentElement.computed = { backgroundColor: DARK, colorScheme: "dark" };
  f.doc.body.computed = { backgroundColor: DARK };
  for (let i = 0; i < 25; i++) {
    const row = f.doc.body.appendChild(new f.ctx.Element("div", f.doc, { backgroundColor: DARK, color: "rgb(230, 230, 230)" }));
    row.textContent = `A readable row of text number ${i}`;
  }
  const a = analyze(f);
  assert.strictEqual(a.nativeDark, true);
  assert.notStrictEqual(a.reason, REASON);
  assert.strictEqual(f.evalIn("resolveEngine({ engine: 'auto' })"), "", "skipped");
  assert.strictEqual(f.evalIn("resolveEngine({ engine: 'auto', nativeDark: 'force' })"), "css", "forced uses the CSS fallback");
});

for (const run of pending) await run();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
