// tests/docs_ui_keep_test.mjs
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
console.log("📄 Running Docs UI Keep-Original Tests");
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
    this.classNames = [];
    this.classList = { contains: (c) => this.classNames.includes(c) };
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
    const attrs = String(sel).split(",").map((x) => /^\s*\[([a-z-]+)\]\s*$/.exec(x));
    if (attrs.every(Boolean)) return this.descendants().filter((e) => attrs.some((m) => e.hasAttribute(m[1])));
    if (sel === "*") return this.descendants();
    return [];
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  matches(sel) {
    return String(sel).split(",").map((s) => s.trim()).some((part) => {
      const id = /#([\w-]+)/.exec(part);
      if (id && this.id !== id[1]) return false;
      const cls = [...part.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      if (!id && !cls.length) return false;
      return cls.every((c) => this.classNames.includes(c));
    });
  }
  closest(sel) {
    for (let el = this; el; el = el.parentElement) if (el.matches(sel)) return el;
    return null;
  }
}

function load({ sync = {}, hostname = "example.com", pathname = "/page" } = {}) {
  const ctx = {};
  const idleQueue = [];
  const flush = () => { for (let n = 0; idleQueue.length && n < 200; n++) idleQueue.shift()(); };
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
  return { ctx, doc, evalIn, invertStyle, cssStyle, fire, flush };
}

const DOC = "/document/d/1AbC_xyz/edit";
const SHEET = "/spreadsheets/d/1AbC_xyz/edit#gid=0";
const ATTRS = ["data-force-dark-surface", "data-force-dark-text", "data-force-dark-border", "data-force-dark-image"];
const marked = (el) => ATTRS.filter((a) => el.hasAttribute(a));
const CSS_ON = { "docs.google.com": { enabled: true, engine: "css" } };
const LIGHT = { backgroundColor: "rgb(255, 255, 255)", color: "rgb(20, 20, 20)" };

function node(f, parent, { id = "", cls = [], computed = LIGHT } = {}) {
  const el = new El("div", f.doc, computed);
  el.id = id;
  el.classNames = cls;
  parent.appendChild(el);
  return el;
}

// Builds the verified-DOM shapes plus outside controls.
function build(f) {
  const body = f.doc.body;
  const toolbar = node(f, body, { id: "docs-toolbar" });
  const sidekick = node(f, body, { id: "docs-sidekick-button-container" });
  const sidekickRoot = node(f, node(f, sidekick), { cls: ["appsElementsSidekickEntryPointRoot"] });
  const ring = node(f, sidekickRoot, { cls: ["appsElementsSidekickEntryPointLinePurple"] });
  const inner = node(f, node(f, sidekickRoot, { cls: ["Wrapper"] }), { cls: ["InnerBackground"] });
  const share = node(f, body, { cls: ["scb-gm3", "scb-container"] });
  const arrow = node(f, share, { id: "scb-quick-actions-menu-button", cls: ["goog-flat-menu-button"] });
  const arrowDrop = node(f, arrow, { cls: ["goog-flat-menu-button-dropdown"] });
  const sibling = node(f, node(f, body));
  return { toolbar, sidekick, sidekickRoot, ring, inner, share, arrow, arrowDrop, sibling, exempt: [sidekick, sidekickRoot, ring, inner, share, arrow, arrowDrop] };
}

const scan = (f) => { f.evalIn("scheduleScan(document.documentElement)"); f.flush(); };

for (const [name, pathname] of [["Docs", DOC], ["Sheets", SHEET]]) {
  test(`${name}: exempt subtrees get no marks, other elements are still themed`, () => {
    const f = load({ hostname: "docs.google.com", pathname, sync: CSS_ON });
    const d = build(f);
    scan(f);
    for (const el of d.exempt) assert.deepStrictEqual(marked(el), [], `${el.id || el.classNames.join(".")}`);
    assert.ok(marked(d.toolbar).includes("data-force-dark-surface"), "toolbar themed");
    assert.ok(marked(d.sibling).includes("data-force-dark-surface"), "sibling themed");
  });
}

test("pre-existing marks (set before the exemption applied) are removed on the next scan", () => {
  const f = load({ hostname: "docs.google.com", pathname: DOC, sync: CSS_ON });
  const d = build(f);
  for (const el of d.exempt) for (const a of ATTRS) el.setAttribute(a, a.endsWith("image") ? "invert" : "strong");
  scan(f);
  for (const el of d.exempt) assert.deepStrictEqual(marked(el), []);
});

test("nodes added later inside an exempt subtree stay unmarked", () => {
  const f = load({ hostname: "docs.google.com", pathname: DOC, sync: CSS_ON });
  const d = build(f);
  scan(f);
  const late = node(f, d.sidekickRoot);
  const lateShare = node(f, d.share);
  const lateOutside = node(f, d.toolbar);
  for (const el of [late, lateShare]) { el.setAttribute("data-force-dark-border", "true"); f.evalIn("0"); }
  f.ctx.__late = [late, lateShare, lateOutside];
  f.evalIn("__late.forEach((e) => scheduleScan(e))");
  f.flush();
  assert.deepStrictEqual(marked(late), []);
  assert.deepStrictEqual(marked(lateShare), []);
  assert.ok(marked(lateOutside).includes("data-force-dark-surface"), "outside still themed");
});

test("non-Docs pages with the same class names are themed as before", () => {
  for (const [hostname, pathname] of [["example.com", "/page"], ["docs.google.com", "/forms/d/x/edit"], ["docs.google.com", "/presentation/d/x/edit"]]) {
    const f = load({ hostname, pathname, sync: { [hostname]: { enabled: true, engine: "css" } } });
    const d = build(f);
    scan(f);
    for (const el of d.exempt) assert.ok(marked(el).includes("data-force-dark-surface"), `${hostname}${pathname}: ${el.id || el.classNames.join(".")}`);
  }
});

test("the generated stylesheet has no unconditional rule painting these widgets", () => {
  const f = load({ hostname: "docs.google.com", pathname: DOC, sync: CSS_ON });
  const css = f.cssStyle().textContent;
  assert.ok(!/sidekick|scb-gm3|scb-container/i.test(css), "no widget-specific selectors");
  for (const rule of rules(css)) {
    if (!/background/.test(rule.body)) continue;
    assert.ok(rule.selectors.every((s) => /data-force-dark-|:root\[data-force-dark-mode="css"\]\s*(,|$|body|html)|^(:root|html|body)/.test(s) || /data-force-dark/.test(s)), rule.selectorText.slice(0, 80));
  }
});

test("selector list is SELECTOR_PATTERN-safe and scoped to Docs/Sheets kinds", () => {
  const T = load().ctx.ForceDarkThemes;
  assert.deepStrictEqual([...T.docsUiKeepOriginalSelectors("document")], ["#docs-sidekick-button-container", ".scb-gm3.scb-container"]);
  assert.deepStrictEqual([...T.docsUiKeepOriginalSelectors("spreadsheet")], ["#docs-sidekick-button-container", ".scb-gm3.scb-container"]);
  assert.deepStrictEqual([...T.docsUiKeepOriginalSelectors("")], []);
  assert.deepStrictEqual([...T.docsUiKeepOriginalSelectors("__proto__")], []);
  for (const selector of T.docsUiKeepOriginalSelectors("document")) assert.ok(T.validateFix({ selector, action: "keep-light" }), selector);
});

test("disabling dark mode clears everything as before and resets the exemption", () => {
  const f = load({ hostname: "docs.google.com", pathname: DOC, sync: CSS_ON });
  const d = build(f);
  scan(f);
  assert.ok(marked(d.toolbar).length);
  f.evalIn("disableDarkMode()");
  for (const el of [d.toolbar, d.sibling, ...d.exempt]) assert.deepStrictEqual(marked(el), []);
  assert.strictEqual(f.evalIn("docsUiKeepSelector"), "");
});

test("the path kind drives the exemption: kind change re-evaluates, same config keeps the style", () => {
  const f = load({ hostname: "docs.google.com", pathname: "/forms/d/x/edit", sync: CSS_ON });
  assert.strictEqual(f.evalIn("docsUiKeepSelector"), "");
  f.ctx.location.pathname = DOC;
  f.ctx.__onChanged({ "docs.google.com": { newValue: { ...CSS_ON["docs.google.com"] } } }, "sync");
  assert.ok(f.evalIn("docsUiKeepSelector").includes("#docs-sidekick-button-container"));
  const style = f.cssStyle();
  f.ctx.__onChanged({ "docs.google.com": { newValue: { ...CSS_ON["docs.google.com"] } } }, "sync");
  assert.strictEqual(f.cssStyle(), style, "no teardown on an identical re-apply");
});

for (const run of pending) await run();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
