// tests/media_test.mjs
// The Invert engine's per-site "media" setting (on / dim / off): colour-accurate compensation filters, the
// generated rules (picture, inline svg, svg images, iframes), the bounded stylesheet background-image scan,
// teardown, the no-teardown signature, backward compatibility, storage and the side panel control.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

console.log("=========================================");
console.log("🖼️  Running Invert Media Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) {
  const run = async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  };
  pending.push(run);
}

// --- a tiny CSS filter simulator (sRGB, each function clamps to [0, 1], as Chrome does) ----------------------

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
function amount(arg) {
  const s = String(arg).trim();
  return s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
}
function applyFilter(filter, rgb) {
  const fns = [...filter.matchAll(/([a-z-]+)\(([^)]*)\)/g)];
  assert.ok(fns.length > 0, `unparseable filter "${filter}"`);
  return fns.reduce((c, [, fn, arg]) => {
    if (fn === "invert") { const k = amount(arg); return c.map((v) => clamp(k + v * (1 - 2 * k))); }
    if (fn === "contrast") { const k = amount(arg); return c.map((v) => clamp(v * k + 0.5 - 0.5 * k)); }
    if (fn === "brightness") { const k = amount(arg); return c.map((v) => clamp(v * k)); }
    if (fn === "hue-rotate") return hueRotate(parseFloat(arg), c);
    throw new Error(`unsupported filter function ${fn}`);
  }, rgb);
}
const PAGE_FILTER = "invert(0.92) hue-rotate(180deg)"; // the html filter at default brightness/contrast/sepia
const maxError = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
// What the user sees for a media pixel: the element's own filter first, then the html filter on top.
const seen = (mediaFilter, rgb) => applyFilter(PAGE_FILTER, mediaFilter ? applyFilter(mediaFilter, rgb) : rgb);

// --- CSS rule parsing ---------------------------------------------------------------------------------------

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
const filterOf = (rule) => (rule.body.match(/filter:\s*([^;!]+)/) || [])[1]?.trim();
const ruleFor = (css, selector) => rules(css).filter((r) => r.selectors.includes(selector));
const filterFor = (css, selector) => ruleFor(css, selector).map(filterOf).filter(Boolean);

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

function load({ sync = {}, hostname = "example.com", idle = true } = {}) {
  const ctx = {};
  const idleQueue = [];
  const observers = [];
  const counters = { computed: 0, cancelledIdle: 0 };
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

  const computedStyle = (el) => {
    counters.computed++;
    return {
      display: "block",
      visibility: "visible",
      opacity: "1",
      color: "rgb(20, 20, 20)",
      backgroundImage: "none",
      backgroundColor: el === doc.documentElement ? "rgb(255, 255, 255)" : "rgba(0, 0, 0, 0)",
      colorScheme: "",
      ...el.computed,
    };
  };
  const area = (name, data) => ({
    get: (keys, cb) => cb(data),
    set: (obj, cb) => cb && cb(),
  });
  Object.assign(ctx, {
    console,
    document: doc,
    location: { hostname, href: `https://${hostname}/page` },
    innerWidth: 1024,
    innerHeight: 768,
    getComputedStyle: computedStyle,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (fn) => { idleQueue.push(fn); return idleQueue.length; },
    cancelAnimationFrame() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.connected = false; observers.push(this); }
      observe(target, options) { this.connected = true; this.target = target; this.options = options; }
      disconnect() { this.connected = false; }
    },
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ELEMENT: 1 },
    Element: El,
    chrome: {
      storage: {
        sync: area("sync", sync),
        local: area("local", {}),
        onChanged: { addListener: (fn) => { ctx.__onChanged = fn; } },
      },
      runtime: {
        id: "test-extension",
        onMessage: { addListener: (fn) => { ctx.__onMessage = fn; } },
        sendMessage() {},
      },
    },
  });
  if (idle) {
    ctx.requestIdleCallback = (fn) => { idleQueue.push(fn); return idleQueue.length; };
    ctx.cancelIdleCallback = () => { counters.cancelledIdle++; idleQueue.length = 0; };
  }
  Object.defineProperty(ctx, "localStorage", { get() { return { getItem: () => null, setItem() {}, removeItem() {} }; } });
  ctx.window = ctx;
  ctx.top = ctx;
  vm.createContext(ctx);
  for (const [rel, code] of SCRIPTS) vm.runInContext(code, ctx, { filename: rel });

  const deadline = { didTimeout: false, timeRemaining: () => 50 };
  const runOneTask = () => { const fn = idleQueue.shift(); if (fn) fn(deadline); return Boolean(fn); };
  const flush = (limit = 10000) => { let n = 0; while (idleQueue.length && n < limit) { runOneTask(); n++; } return n; };
  const invertStyle = () => doc.getElementById("__force_dark_invert__");
  const mediaObserver = () => observers.filter((o) => o.options && o.options.childList && !o.options.attributes).pop();
  const add = (parent, tag, computed, rect) => parent.appendChild(new El(tag, doc, computed, rect));
  const evalIn = (code) => vm.runInContext(code, ctx);
  return { ctx, doc, idleQueue, observers, counters, flush, runOneTask, invertStyle, mediaObserver, add, evalIn };
}

const PHOTO = { backgroundImage: 'url("https://example.com/photo.jpg")' };
const COMP = "hue-rotate(180deg) invert(1) contrast(1.1905)";
const SVG_IMAGE_SELECTORS = ['img[src$=".svg" i]', 'img[src*=".svg?" i]', 'img[src^="data:image/svg" i]'];

// --- 1. filter strings and their maths ----------------------------------------------------------------------

test("compensation filter is exactly the inverse of the page's invert(0.92) hue-rotate(180deg)", () => {
  const f = load();
  assert.strictEqual(f.evalIn("invertCompensationFilter()"), COMP);
  // contrast(1 / (2 * 0.92 - 1)) after invert(1) maps y to (0.92 - y) / 0.84, the inverse of invert(0.92).
  assert.strictEqual(f.evalIn("invertCompensationFilter(0.8)"), "hue-rotate(180deg) invert(1) contrast(1.6667)");
});

test("filter string per media mode: on, dim (percentage, default 20) and off", () => {
  const f = load();
  assert.strictEqual(f.evalIn('mediaRestoreFilter("on")'), COMP);
  assert.strictEqual(f.evalIn('mediaRestoreFilter("dim")'), `brightness(0.8) ${COMP}`);
  assert.strictEqual(f.evalIn('mediaRestoreFilter("dim", 35)'), `brightness(0.65) ${COMP}`);
  assert.strictEqual(f.evalIn('mediaRestoreFilter("off")'), "");
  assert.strictEqual(f.evalIn('mediaRestoreFilter("bogus")'), COMP, "unknown modes behave as on");
});

test("restored photos are colour-accurate: net effect is identity on 8%..92% (old filter was ~6% off)", () => {
  const f = load();
  const restore = f.evalIn('mediaRestoreFilter("on")');
  for (let v = 0.08; v <= 0.92; v += 0.04) {
    const out = seen(restore, [v, v, v]);
    assert.ok(maxError(out, [v, v, v]) < 0.002, `grey ${v.toFixed(2)} -> ${out.map((x) => x.toFixed(3))}`);
  }
  for (const rgb of [[0.3, 0.5, 0.7], [0.6, 0.45, 0.35], [0.2, 0.6, 0.3], [0.85, 0.75, 0.6]]) {
    const out = seen(restore, rgb);
    assert.ok(maxError(out, rgb) < 0.005, `colour ${rgb} -> ${out.map((x) => x.toFixed(3))}`);
  }
  // The previous invert(1) hue-rotate(180deg) lifted shadows and dulled highlights.
  assert.ok(maxError(seen("invert(1) hue-rotate(180deg)", [0.9, 0.9, 0.9]), [0.9, 0.9, 0.9]) > 0.05);
  assert.ok(maxError(seen("invert(1) hue-rotate(180deg)", [0.1, 0.1, 0.1]), [0.1, 0.1, 0.1]) > 0.05);
});

test("dim mode darkens restored photos by the percentage; off leaves them inverted like the page", () => {
  const f = load();
  const dim = f.evalIn('mediaRestoreFilter("dim", 20)');
  const out = seen(dim, [0.5, 0.5, 0.5]);
  assert.ok(maxError(out, [0.4, 0.4, 0.4]) < 0.002, `dimmed grey -> ${out}`);
  const offOut = seen("", [0.9, 0.9, 0.9]);
  assert.ok(offOut[0] < 0.2, "off: a light photo pixel is shown dark (inverted)");
});

test("normalizeMediaMode / normalizeMediaDim: missing or bad values fall back to on / 20", () => {
  const f = load();
  assert.strictEqual(f.evalIn("normalizeMediaMode(undefined)"), "on");
  assert.strictEqual(f.evalIn('normalizeMediaMode("dim")'), "dim");
  assert.strictEqual(f.evalIn('normalizeMediaMode("off")'), "off");
  assert.strictEqual(f.evalIn('normalizeMediaMode("__proto__")'), "on");
  assert.strictEqual(f.evalIn("normalizeMediaDim(undefined)"), 20);
  assert.strictEqual(f.evalIn("normalizeMediaDim(500)"), 80);
  assert.strictEqual(f.evalIn("normalizeMediaDim(-5)"), 0);
  assert.strictEqual(f.evalIn('normalizeMediaDim("x")'), 20);
});

// --- 2. generated rules -------------------------------------------------------------------------------------

test("on: img/video/canvas/embed/object and background-image elements get the compensation", () => {
  const f = load();
  const css = f.evalIn('buildInvertCss({ media: "on" })');
  for (const sel of ["img", "video", "canvas", "embed", "object", '[style*="background-image"]', "[data-force-dark-bg]"]) {
    assert.deepStrictEqual(filterFor(css, sel), [COMP], `${sel} restored`);
  }
  assert.ok(/html\s*\{[^}]*filter:\s*invert\(0\.92\) hue-rotate\(180deg\) brightness\(var\(--force-dark-brightness/.test(css),
    "page filter (with the user's brightness/contrast/sepia) is unchanged and applies once to everything");
  for (const r of rules(css)) {
    if (r.selectors.some((s) => /\b(img|video|canvas)\b/.test(s))) {
      assert.ok(!/--force-dark-(brightness|contrast|sepia)/.test(r.body), "media never get the user adjustments twice");
    }
  }
});

test("picture: never filtered itself; its <img> gets the compensation once and is never set to none", () => {
  const f = load();
  for (const media of ["on", "dim", "off"]) {
    const css = f.evalIn(`buildInvertCss({ media: "${media}" })`);
    for (const r of rules(css)) {
      for (const s of r.selectors) {
        assert.ok(!/\bpicture\b/.test(s), `${media}: no rule targets picture (${s}); picture may be inline or display:contents`);
      }
    }
  }
  const css = f.evalIn('buildInvertCss({ media: "on" })');
  assert.deepStrictEqual(filterFor(css, "img"), [COMP], "picture > img matches the img rule: restored, not a negative");
});

test("nested media under a restored ancestor are not compensated twice", () => {
  const f = load();
  const css = f.evalIn('buildInvertCss({ media: "on" })');
  const nested = rules(css).find((r) => /^:is\(.*\)\s+:is\(.*\)$/.test(r.selectorText));
  assert.ok(nested, "a descendant rule exists");
  assert.strictEqual(filterOf(nested), "none");
  for (const s of ["img", "[data-force-dark-bg]", '[style*="background-image"]', "iframe"]) {
    assert.ok(nested.selectorText.split(/\)\s+:is\(/).every((half) => half.includes(s)), `${s} on both sides`);
  }
});

test("svg: inline <svg> stays inverted (no rule); svg images are restored in on, restored undimmed in dim", () => {
  const f = load();
  for (const media of ["on", "dim", "off"]) {
    const css = f.evalIn(`buildInvertCss({ media: "${media}" })`);
    for (const r of rules(css)) {
      for (const s of r.selectors) assert.ok(!/(^|[\s>+~(,])svg\b/.test(s), `${media}: inline svg untouched (${s})`);
    }
  }
  const on = f.evalIn('buildInvertCss({ media: "on" })');
  assert.deepStrictEqual(filterFor(on, "img"), [COMP], "on: svg images match img and are restored");
  const dim = f.evalIn('buildInvertCss({ media: "dim", mediaDim: 30 })');
  assert.deepStrictEqual(filterFor(dim, "img"), [`brightness(0.7) ${COMP}`]);
  for (const sel of SVG_IMAGE_SELECTORS) assert.deepStrictEqual(filterFor(dim, sel), [COMP], `dim: ${sel} not dimmed`);
  const off = f.evalIn('buildInvertCss({ media: "off" })');
  for (const sel of SVG_IMAGE_SELECTORS) assert.deepStrictEqual(filterFor(off, sel), [], `off: ${sel} not restored`);
});

test("off: no media rule at all, but iframes keep their compensation (each frame themes itself)", () => {
  const f = load();
  const css = f.evalIn('buildInvertCss({ media: "off" })');
  for (const sel of ["img", "video", "canvas", "embed", "object", '[style*="background-image"]', "[data-force-dark-bg]"]) {
    assert.deepStrictEqual(filterFor(css, sel), [], `${sel} not restored in off`);
  }
  assert.deepStrictEqual(filterFor(css, "iframe"), [COMP]);
  assert.deepStrictEqual(filterFor(f.evalIn('buildInvertCss({ media: "dim" })'), "iframe"), [COMP], "iframes never dimmed");
});

test("missing media field = on (backward compatibility)", () => {
  const f = load();
  assert.strictEqual(f.evalIn("buildInvertCss()"), f.evalIn('buildInvertCss({ media: "on", mediaDim: 20 })'));
  assert.strictEqual(f.evalIn("buildInvertCss({})"), f.evalIn('buildInvertCss({ media: "on" })'));
  const legacy = load({ sync: { "example.com": { enabled: true, engine: "invert" } } });
  assert.deepStrictEqual(filterFor(legacy.invertStyle().textContent, "img"), [COMP], "stored config without media");
});

// --- 3. the stylesheet background-image scan ----------------------------------------------------------------

test("scan marks elements whose computed background has a url(); skips gradients, tiny, hidden, html/body", () => {
  const f = load();
  const { doc } = f;
  doc.body.computed = PHOTO; // a page background: restoring it would undo the whole dark mode
  const hero = f.add(doc.body, "section", PHOTO, { width: 1024, height: 500 });
  const gradient = f.add(doc.body, "div", { backgroundImage: "linear-gradient(red, blue)" });
  const mixed = f.add(doc.body, "div", { backgroundImage: 'linear-gradient(red, blue), url("a.png")' });
  const icon = f.add(doc.body, "span", PHOTO, { width: 16, height: 16 });
  const hidden = f.add(doc.body, "div", { display: "none" });
  const insideHidden = f.add(hidden, "div", PHOTO);
  const invisible = f.add(doc.body, "div", { ...PHOTO, visibility: "hidden" });
  const wrapper = f.add(doc.body, "div", PHOTO, { width: 1024, height: 2600 });
  const deep = f.add(f.add(doc.body, "div"), "div", PHOTO);
  const img = f.add(doc.body, "img", PHOTO);

  f.evalIn('enableInvert({ media: "on" })');
  f.flush();
  const marked = (el) => el.hasAttribute("data-force-dark-bg");
  assert.ok(marked(hero), "hero photo marked");
  assert.ok(marked(mixed), "url() next to a gradient marked");
  assert.ok(marked(deep), "nested element marked");
  assert.ok(!marked(gradient), "gradient-only skipped");
  assert.ok(!marked(icon), "tiny skipped");
  assert.ok(!marked(hidden) && !marked(insideHidden), "display:none subtree skipped");
  assert.ok(!marked(invisible), "visibility:hidden skipped");
  assert.ok(!marked(wrapper), "page-sized wrapper skipped");
  assert.ok(!marked(doc.body) && !marked(doc.documentElement), "html/body never marked");
  assert.ok(!marked(img), "img already handled by its own rule");
});

test("scan is bounded: at most MEDIA_SCAN_BATCH elements per task and MEDIA_SCAN_MAX in total", () => {
  const f = load();
  const batch = f.evalIn("MEDIA_SCAN_BATCH");
  const max = f.evalIn("MEDIA_SCAN_MAX");
  assert.ok(batch > 0 && batch <= 300, `batch ${batch}`);
  assert.ok(max >= batch && max <= 20000, `max ${max}`);
  for (let i = 0; i < max + 500; i++) f.add(f.doc.body, "div");

  f.evalIn('enableInvert({ media: "on" })');
  f.counters.computed = 0;
  f.runOneTask();
  assert.ok(f.counters.computed <= batch, `one task read ${f.counters.computed} styles`);
  assert.ok(f.idleQueue.length > 0, "the rest is scheduled for later tasks");
  f.flush();
  assert.ok(f.counters.computed <= max + 2, `total ${f.counters.computed} <= ${max}`);
});

test("scan falls back to requestAnimationFrame when requestIdleCallback is missing", () => {
  const f = load({ idle: false });
  const hero = f.add(f.doc.body, "div", PHOTO);
  f.evalIn('enableInvert({ media: "on" })');
  f.flush();
  assert.ok(hero.hasAttribute("data-force-dark-bg"));
});

test("observer watches added nodes only and scans what is added", () => {
  const f = load();
  f.evalIn('enableInvert({ media: "dim" })');
  f.flush();
  const obs = f.mediaObserver();
  assert.ok(obs && obs.connected, "observer connected");
  assert.strictEqual(obs.options.childList, true);
  assert.strictEqual(obs.options.subtree, true);
  assert.ok(!obs.options.attributes && !obs.options.characterData, "added nodes only");

  const card = f.add(f.doc.body, "div");
  const thumb = f.add(card, "div", PHOTO);
  obs.cb([{ type: "childList", addedNodes: [card, { nodeType: 3 }], removedNodes: [] }]);
  f.flush();
  assert.ok(thumb.hasAttribute("data-force-dark-bg"), "descendant of an added node marked");
});

test("off mode runs no scan and no observer", () => {
  const f = load();
  f.add(f.doc.body, "div", PHOTO);
  f.evalIn('enableInvert({ media: "off" })');
  f.flush();
  assert.ok(!f.mediaObserver() || !f.mediaObserver().connected);
  assert.strictEqual(f.doc.body.children[0].hasAttribute("data-force-dark-bg"), false);
});

test("disableInvert disconnects the observer, cancels pending work and removes the marks", () => {
  const f = load();
  const hero = f.add(f.doc.body, "div", PHOTO);
  for (let i = 0; i < 1000; i++) f.add(f.doc.body, "div");
  f.evalIn('enableInvert({ media: "on" })');
  f.runOneTask();
  assert.ok(hero.hasAttribute("data-force-dark-bg"));
  const obs = f.mediaObserver();
  f.evalIn("disableInvert()");
  assert.strictEqual(obs.connected, false, "observer disconnected");
  assert.ok(f.counters.cancelledIdle > 0, "pending idle work cancelled");
  assert.strictEqual(hero.hasAttribute("data-force-dark-bg"), false, "marks removed");
  assert.strictEqual(f.invertStyle(), null);
  const before = f.counters.computed;
  f.flush();
  assert.strictEqual(f.counters.computed, before, "nothing scanned after disable");
});

// --- 4. index.js: signature, re-apply, frames ---------------------------------------------------------------

test("a media change rebuilds the Invert style; an unchanged config keeps it (no teardown)", () => {
  const cfg = { enabled: true, engine: "invert" };
  const f = load({ sync: { "example.com": cfg } });
  const first = f.invertStyle();
  assert.ok(first);
  f.ctx.__onChanged({ "example.com": { newValue: { ...cfg } } }, "sync");
  assert.strictEqual(f.invertStyle(), first, "same config: same style element");
  f.ctx.__onChanged({ "example.com": { newValue: { ...cfg, media: "on" } } }, "sync");
  assert.strictEqual(f.invertStyle(), first, "missing media and media on are the same thing");

  f.ctx.__onChanged({ "example.com": { newValue: { ...cfg, media: "dim" } } }, "sync");
  assert.notStrictEqual(f.invertStyle(), first, "dim rebuilds");
  assert.deepStrictEqual(filterFor(f.invertStyle().textContent, "img"), [`brightness(0.8) ${COMP}`]);

  const dimStyle = f.invertStyle();
  f.ctx.__onChanged({ "example.com": { newValue: { ...cfg, media: "dim", mediaDim: 40 } } }, "sync");
  assert.notStrictEqual(f.invertStyle(), dimStyle, "a new dim percentage rebuilds");

  f.ctx.__onMessage({ type: "APPLY_CONFIG", config: { ...cfg, media: "off" } }, { id: "test-extension" }, () => {});
  assert.deepStrictEqual(filterFor(f.invertStyle().textContent, "img"), [], "APPLY_CONFIG applies off");
});

test("engineSignature includes the media options", () => {
  const f = load();
  const a = f.evalIn('engineSignature("invert", {}, null, false, { media: "on", mediaDim: 20 })');
  const b = f.evalIn('engineSignature("invert", {}, null, false, { media: "dim", mediaDim: 20 })');
  const c = f.evalIn('engineSignature("invert", {}, null, false, { media: "dim", mediaDim: 30 })');
  assert.notStrictEqual(a, b);
  assert.notStrictEqual(b, c);
});

test("the CSS engine is not rebuilt by a media change", () => {
  const cfg = { enabled: true, engine: "css" };
  const f = load({ sync: { "example.com": cfg } });
  const style = f.doc.getElementById("__force_dark_mode__");
  assert.ok(style);
  f.ctx.__onChanged({ "example.com": { newValue: { ...cfg, media: "off" } } }, "sync");
  assert.strictEqual(f.doc.getElementById("__force_dark_mode__"), style);
});

// --- 5. storage, service worker and the side panel ----------------------------------------------------------

test("constants: normalizeMediaMode, media range and mediaFieldsFor (keeps the stored value)", async () => {
  const c = await import("../src/shared/constants.js");
  assert.deepStrictEqual([...c.VALID_MEDIA_MODES], ["on", "dim", "off"]);
  assert.strictEqual(c.DEFAULT_MEDIA_MODE, "on");
  assert.deepStrictEqual(c.FILTER_RANGES.mediaDim, { min: 0, max: 80, default: 20 });
  assert.deepStrictEqual(c.mediaFieldsFor({ media: "dim" }, {}), { media: "dim" });
  assert.deepStrictEqual(c.mediaFieldsFor({}, { media: "off", mediaDim: 35 }), { media: "off", mediaDim: 35 });
  assert.deepStrictEqual(c.mediaFieldsFor({ media: "nope" }, undefined), {}, "nothing stored: field stays missing (= on)");
  assert.deepStrictEqual(c.mediaFieldsFor({ mediaDim: 999 }, { media: "dim" }), { media: "dim", mediaDim: 80 });
});

test("setSiteConfig and import keep a valid media setting and drop an invalid one", async () => {
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
  await storage.setSiteConfig("a.com", { enabled: true, engine: "invert", media: "dim", mediaDim: 30 });
  assert.strictEqual(data["a.com"].media, "dim");
  assert.strictEqual(data["a.com"].mediaDim, 30);
  await storage.setSiteConfig("b.com", { enabled: true, engine: "invert", media: "<script>" });
  assert.ok(!("media" in data["b.com"]), "invalid media dropped");
  await storage.setSiteConfig("c.com", { enabled: true });
  assert.ok(!("media" in data["c.com"]) && !("mediaDim" in data["c.com"]), "old shape unchanged");
  await storage.importSettingsJson(JSON.stringify({ settings: { "d.com": { enabled: true, engine: "invert", media: "off" } } }));
  assert.strictEqual(data["d.com"].media, "off");
});

test("service worker keeps media across every TOGGLE (theme, filters, engine changes)", () => {
  const sw = read("src/background/serviceWorker.js");
  assert.ok(/mediaFieldsFor\(msg, currentConfig\)/.test(sw), "TOGGLE merges media fields from the message or the stored config");
});

test("side panel: Photos & media control (On / Dim / Off), labelled, shown only for Invert", () => {
  const html = read("src/popup/popup.html");
  const group = (html.match(/<fieldset[^>]*id="media-control"[\s\S]*?<\/fieldset>/) || [])[0];
  assert.ok(group, "a fieldset#media-control exists");
  assert.ok(/<legend[^>]*>\s*Photos &amp; media\s*<\/legend>/.test(group), "legend gives the accessible name");
  assert.ok(/\bhidden\b/.test(group.split(">")[0]), "hidden until the Invert engine is in use");
  for (const v of ["on", "dim", "off"]) {
    assert.ok(new RegExp(`<input[^>]*type="radio"[^>]*name="media"[^>]*value="${v}"`).test(group), `radio ${v}`);
  }
  const js = read("src/popup/popup.js");
  const start = js.indexOf("mediaRadios.forEach");
  assert.ok(start > -1, "media radios have a handler");
  const handler = js.slice(start, js.indexOf("});\n  });", start));
  assert.ok(/type: "TOGGLE"/.test(handler) && /media: radio\.value/.test(handler) && /forceEnabled/.test(handler),
    "the handler writes media through TOGGLE without changing enabled");
  assert.ok(/function updateMediaVisibility/.test(js), "visibility follows the engine");
  const vis = js.slice(js.indexOf("function updateMediaVisibility"), js.indexOf("}", js.indexOf("function updateMediaVisibility") + 200) + 1);
  assert.ok(/"invert"/.test(vis) && /lastAnalysis/.test(vis), "shown for Invert, or Auto that picked Invert");
});

for (const run of pending) await run();

console.log("\n=========================================");
console.log(`${failed ? "❌" : "🎉"} Media Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");
if (failed > 0) process.exit(1);
