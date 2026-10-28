// tests/canvas_docs_test.mjs
// Google Docs and Sheets paint the page / grid on <canvas>. On those paths only, both engines give the document
// canvases the page-level inversion (so the paper turns dark and text light), while every other canvas on every
// other site keeps today's behaviour (CSS engine: filter none; Invert engine: re-inverted back to natural colours).
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

console.log("=========================================");
console.log("📄 Running Canvas Document (Docs/Sheets) Tests");
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

// --- CSS helpers --------------------------------------------------------------------------------------------

function splitSelectors(text) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
function rules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const selectorText = m[1].trim();
    out.push({ selectorText, selectors: splitSelectors(selectorText), body: m[2] });
  }
  return out;
}
const filterOf = (rule) => (rule.body.match(/filter:\s*([^;!]+)/) || [])[1]?.trim();
const filterFor = (css, selector) => rules(css).filter((r) => r.selectors.includes(selector)).map(filterOf).filter(Boolean);

const clamp = (v) => Math.min(1, Math.max(0, v));
function hueRotate(deg, [r, g, b]) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
  return m.map((row) => clamp(row[0] * r + row[1] * g + row[2] * b));
}
function applyFilter(filter, rgb) {
  return [...filter.matchAll(/([a-z-]+)\(([^)]*)\)/g)].reduce((c, [, fn, arg]) => {
    if (fn === "invert") { const k = parseFloat(arg); return c.map((v) => clamp(k + v * (1 - 2 * k))); }
    if (fn === "hue-rotate") return hueRotate(parseFloat(arg), c);
    throw new Error(`unsupported filter function ${fn}`);
  }, rgb);
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
const DOC_SELECTORS = [".kix-page-paginated canvas", "canvas.kix-canvas-tile-content"];
const SHEET_SELECTORS = ["#waffle-grid-container canvas", ".grid-container canvas"];
const COMP = "hue-rotate(180deg) invert(1) contrast(1.1905)";
const PAGE_INVERSION = "invert(0.92) hue-rotate(180deg)";
const CANVAS_ATTR = "data-force-dark-canvas-doc";

const themes = () => load().ctx.ForceDarkThemes;

// --- 1. the helper ------------------------------------------------------------------------------------------

test("canvasDocumentKind recognises Docs and Sheets editor paths on docs.google.com", () => {
  const T = themes();
  assert.strictEqual(T.canvasDocumentKind("docs.google.com", DOC), "document");
  assert.strictEqual(T.canvasDocumentKind("docs.google.com", SHEET), "spreadsheet");
  assert.strictEqual(T.canvasDocumentKind("docs.google.com", "/document/u/1/d/abc/edit"), "document", "multi-account");
  assert.strictEqual(T.canvasDocumentKind("docs.google.com", "/a/example.org/spreadsheets/d/abc/edit"), "spreadsheet", "Workspace domain path");
  assert.strictEqual(T.canvasDocumentKind("DOCS.GOOGLE.COM", DOC), "document", "host is case-insensitive");
  assert.strictEqual(T.canvasDocumentKind("docs.google.com.", DOC), "document", "trailing dot");
});

test("canvasDocumentKind rejects other hosts and other docs.google.com paths", () => {
  const T = themes();
  const no = [
    ["docs.google.com", "/forms/d/abc/edit"],
    ["docs.google.com", "/presentation/d/abc/edit"],
    ["docs.google.com", "/drawings/d/abc/edit"],
    ["docs.google.com", "/documents/d/abc"],
    ["docs.google.com", "/document"],
    ["docs.google.com", "/"],
    ["docs.google.com", "/x/document/d/abc"],
    ["drive.google.com", DOC],
    ["sheets.google.com", SHEET],
    ["docs.google.com.evil.example", DOC],
    ["evildocs.google.com", DOC],
    ["example.com", DOC],
    ["example.com", "/game"],
    ["", ""],
    [null, null],
    [undefined, undefined],
    ["docs.google.com", 42],
  ];
  for (const [h, p] of no) assert.strictEqual(T.canvasDocumentKind(h, p), "", `${h} ${p}`);
});

test("isCanvasDocumentSite takes a location-like object", () => {
  const T = themes();
  assert.strictEqual(T.isCanvasDocumentSite({ hostname: "docs.google.com", pathname: DOC }), true);
  assert.strictEqual(T.isCanvasDocumentSite({ hostname: "docs.google.com", pathname: SHEET }), true);
  assert.strictEqual(T.isCanvasDocumentSite({ hostname: "docs.google.com", pathname: "/forms/d/x" }), false);
  assert.strictEqual(T.isCanvasDocumentSite({ hostname: "maps.example.com", pathname: "/" }), false);
  assert.strictEqual(T.isCanvasDocumentSite(null), false);
  assert.strictEqual(T.isCanvasDocumentSite({}), false);
});

test("canvas document selectors: canvas-only, pass the site-pack selector rules, fresh copies", () => {
  const T = themes();
  assert.deepStrictEqual([...T.canvasDocumentSelectors("document")], DOC_SELECTORS);
  assert.deepStrictEqual([...T.canvasDocumentSelectors("spreadsheet")], SHEET_SELECTORS);
  assert.deepStrictEqual([...T.canvasDocumentSelectors("")], []);
  assert.deepStrictEqual([...T.canvasDocumentSelectors("__proto__")], []);
  for (const selector of [...DOC_SELECTORS, ...SHEET_SELECTORS]) {
    assert.ok(T.validateFix({ selector, action: "invert-image" }), `${selector} passes SELECTOR_PATTERN and length cap`);
    assert.ok(/canvas$/.test(selector) || /^canvas\./.test(selector), `${selector} targets a canvas`);
    assert.notStrictEqual(selector, "canvas", "never every canvas");
    assert.ok(!/iframe|texteventtarget/i.test(selector), "never the text-event iframe");
  }
  T.canvasDocumentSelectors("document").push("iframe");
  assert.deepStrictEqual([...T.canvasDocumentSelectors("document")], DOC_SELECTORS, "callers cannot alter the table");
});

// --- 2. Invert engine ---------------------------------------------------------------------------------------

test("Invert: document canvases are not re-inverted on Docs/Sheets, in every media mode", () => {
  const f = load();
  for (const media of ["on", "dim", "off"]) {
    for (const [kind, selectors] of [["document", DOC_SELECTORS], ["spreadsheet", SHEET_SELECTORS]]) {
      const css = f.evalIn(`buildInvertCss({ media: "${media}", canvasDocument: "${kind}" })`);
      for (const selector of selectors) {
        assert.deepStrictEqual(filterFor(css, selector), ["none"], `${media}/${kind}: ${selector}`);
      }
    }
  }
});

test("Invert: other canvases keep the re-inversion, and nothing changes without a canvas document", () => {
  const f = load();
  const plain = f.evalIn('buildInvertCss({ media: "on" })');
  const docCss = f.evalIn('buildInvertCss({ media: "on", canvasDocument: "document" })');
  assert.deepStrictEqual(filterFor(docCss, "canvas"), [COMP], "generic canvas rule still restores");
  assert.deepStrictEqual(filterFor(plain, "canvas"), [COMP]);
  for (const selector of [...DOC_SELECTORS, ...SHEET_SELECTORS]) assert.deepStrictEqual(filterFor(plain, selector), []);
  assert.strictEqual(f.evalIn('buildInvertCss({ media: "on", canvasDocument: "bogus" })'), plain, "unknown kinds add nothing");
  assert.strictEqual(f.evalIn('buildInvertCss({ media: "on", canvasDocument: "__proto__" })'), plain);
});

test("Invert: the iframe rule (Docs text-event iframe) is identical with and without a canvas document", () => {
  const f = load();
  for (const media of ["on", "dim", "off"]) {
    const plain = f.evalIn(`buildInvertCss({ media: "${media}" })`);
    const docCss = f.evalIn(`buildInvertCss({ media: "${media}", canvasDocument: "document" })`);
    assert.deepStrictEqual(filterFor(docCss, "iframe"), filterFor(plain, "iframe"), media);
    assert.ok(!/texteventtarget/i.test(docCss));
  }
});

test("Invert end to end: rule present on Docs and Sheets, absent on other hosts and paths", () => {
  const cfg = { enabled: true, engine: "invert" };
  const docF = load({ hostname: "docs.google.com", pathname: DOC, sync: { "docs.google.com": cfg } });
  assert.deepStrictEqual(filterFor(docF.invertStyle().textContent, DOC_SELECTORS[0]), ["none"]);
  const sheetF = load({ hostname: "docs.google.com", pathname: SHEET, sync: { "docs.google.com": cfg } });
  assert.deepStrictEqual(filterFor(sheetF.invertStyle().textContent, SHEET_SELECTORS[0]), ["none"]);
  const forms = load({ hostname: "docs.google.com", pathname: "/forms/d/x/edit", sync: { "docs.google.com": cfg } });
  assert.deepStrictEqual(filterFor(forms.invertStyle().textContent, DOC_SELECTORS[0]), []);
  const other = load({ hostname: "example.com", pathname: DOC, sync: { "example.com": cfg } });
  assert.deepStrictEqual(filterFor(other.invertStyle().textContent, DOC_SELECTORS[0]), []);
  assert.deepStrictEqual(filterFor(other.invertStyle().textContent, "canvas"), [COMP]);
});

// --- 3. CSS engine ------------------------------------------------------------------------------------------

test("CSS: the canvas-doc rules use the Invert engine's page inversion and darken white paper", () => {
  const f = load({ hostname: "docs.google.com", pathname: DOC, sync: { "docs.google.com": { enabled: true, engine: "css" } } });
  const css = f.cssStyle().textContent;
  const docSel = `:root[data-force-dark-mode="css"][${CANVAS_ATTR}="document"] :is(${DOC_SELECTORS.join(", ")})`;
  const sheetSel = `:root[data-force-dark-mode="css"][${CANVAS_ATTR}="spreadsheet"] :is(${SHEET_SELECTORS.join(", ")})`;
  assert.deepStrictEqual(filterFor(css, docSel), [PAGE_INVERSION]);
  assert.deepStrictEqual(filterFor(css, sheetSel), [PAGE_INVERSION]);
  assert.strictEqual(f.evalIn("PAGE_INVERT_AMOUNT"), 0.92, "same amount as the Invert engine");
  const white = applyFilter(PAGE_INVERSION, [1, 1, 1]);
  const black = applyFilter(PAGE_INVERSION, [0, 0, 0]);
  assert.ok(Math.max(...white) < 0.1, `paper becomes dark: ${white}`);
  assert.ok(Math.min(...black) > 0.9, `text becomes light: ${black}`);
  // The generic rule is unchanged: every other canvas keeps filter none.
  assert.deepStrictEqual(
    filterFor(css, ':root[data-force-dark-mode="css"] :is(img, picture, video, canvas, iframe, embed, object, svg)'),
    ["none"],
  );
});

test("CSS: the root is marked only on Docs/Sheets paths, and the mark is removed on disable", () => {
  const cfg = { enabled: true, engine: "css" };
  const docF = load({ hostname: "docs.google.com", pathname: DOC, sync: { "docs.google.com": cfg } });
  assert.strictEqual(docF.doc.documentElement.getAttribute(CANVAS_ATTR), "document");
  const sheetF = load({ hostname: "docs.google.com", pathname: SHEET, sync: { "docs.google.com": cfg } });
  assert.strictEqual(sheetF.doc.documentElement.getAttribute(CANVAS_ATTR), "spreadsheet");
  for (const [hostname, pathname] of [["docs.google.com", "/forms/d/x/edit"], ["drive.google.com", DOC], ["example.com", "/game"]]) {
    const f = load({ hostname, pathname, sync: { [hostname]: cfg } });
    assert.ok(f.cssStyle(), `${hostname} themed`);
    assert.strictEqual(f.doc.documentElement.getAttribute(CANVAS_ATTR), null, `${hostname}${pathname}`);
  }
  docF.ctx.__onChanged({ "docs.google.com": { newValue: { ...cfg, enabled: false } } }, "sync");
  assert.strictEqual(docF.doc.documentElement.getAttribute(CANVAS_ATTR), null, "disable clears the mark");
});

test("CSS: a stored canvasDocument value is ignored (only the real location decides)", () => {
  const cfg = { enabled: true, engine: "css", canvasDocument: "document" };
  const f = load({ hostname: "example.com", pathname: "/game", sync: { "example.com": cfg } });
  assert.strictEqual(f.doc.documentElement.getAttribute(CANVAS_ATTR), null);
  const g = load({ hostname: "example.com", pathname: "/game", sync: { "example.com": { ...cfg, engine: "invert" } } });
  assert.deepStrictEqual(filterFor(g.invertStyle().textContent, DOC_SELECTORS[0]), []);
});

test("CSS: no canvas-doc rule targets an iframe or a text-input overlay", () => {
  const f = load({ hostname: "docs.google.com", pathname: DOC, sync: { "docs.google.com": { enabled: true, engine: "css" } } });
  const canvasDocRules = rules(f.cssStyle().textContent).filter((r) => r.selectorText.includes(CANVAS_ATTR));
  assert.ok(canvasDocRules.length >= 2);
  for (const rule of canvasDocRules) {
    assert.ok(!/iframe|texteventtarget|input|textarea|contenteditable/i.test(rule.selectorText), rule.selectorText);
  }
});

// --- 4. Auto ------------------------------------------------------------------------------------------------

test("Auto: whichever engine Auto resolves to on Docs, the document canvas gets the inversion", () => {
  for (const pathname of [DOC, SHEET]) {
    const f = load({ hostname: "docs.google.com", pathname, sync: { "docs.google.com": { enabled: true, engine: "auto" } } });
    const kind = pathname === DOC ? "document" : "spreadsheet";
    const first = (pathname === DOC ? DOC_SELECTORS : SHEET_SELECTORS)[0];
    if (f.invertStyle()) {
      assert.deepStrictEqual(filterFor(f.invertStyle().textContent, first), ["none"]);
    } else {
      assert.ok(f.cssStyle(), "an engine applied");
      assert.strictEqual(f.doc.documentElement.getAttribute(CANVAS_ATTR), kind);
    }
  }
});

// --- 5. signature, re-evaluation ----------------------------------------------------------------------------

test("engineSignature includes the canvas document kind", () => {
  const f = load();
  const none = f.evalIn('engineSignature("css", {}, {}, false, null, "respect", "")');
  const doc = f.evalIn('engineSignature("css", {}, {}, false, null, "respect", "document")');
  const sheet = f.evalIn('engineSignature("css", {}, {}, false, null, "respect", "spreadsheet")');
  assert.notStrictEqual(none, doc);
  assert.notStrictEqual(doc, sheet);
  assert.strictEqual(f.evalIn('engineSignature("css", {}, {}, false, null, "respect")'), none, "default is none");
});

test("the path is evaluated at apply time: a path change rebuilds, an unchanged re-apply keeps the style", () => {
  const cfg = { enabled: true, engine: "invert" };
  const f = load({ hostname: "docs.google.com", pathname: "/forms/d/x/edit", sync: { "docs.google.com": cfg } });
  assert.deepStrictEqual(filterFor(f.invertStyle().textContent, DOC_SELECTORS[0]), []);
  f.ctx.location.pathname = DOC;
  f.ctx.__onChanged({ "docs.google.com": { newValue: { ...cfg } } }, "sync");
  assert.deepStrictEqual(filterFor(f.invertStyle().textContent, DOC_SELECTORS[0]), ["none"]);
  const style = f.invertStyle();
  f.ctx.__onChanged({ "docs.google.com": { newValue: { ...cfg } } }, "sync");
  assert.strictEqual(f.invertStyle(), style, "same path and config: no teardown");
});

test("pageshow (bfcache restore) re-evaluates the path", () => {
  const cfg = { enabled: true, engine: "css" };
  const f = load({ hostname: "docs.google.com", pathname: "/forms/d/x/edit", sync: { "docs.google.com": cfg } });
  assert.strictEqual(f.doc.documentElement.getAttribute(CANVAS_ATTR), null);
  f.ctx.location.pathname = SHEET;
  f.fire("pageshow", { persisted: true });
  assert.strictEqual(f.doc.documentElement.getAttribute(CANVAS_ATTR), "spreadsheet");
});

for (const run of pending) await run();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
