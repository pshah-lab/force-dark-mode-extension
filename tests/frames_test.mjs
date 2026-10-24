// tests/frames_test.mjs
// The content script runs in every frame (all_frames). Child frames take their settings from the top frame's
// host, never answer data-returning messages, never report usage, never touch the pre-paint flag, stay inert
// when tiny, keep transparent documents transparent, and are not flipped back to light by an inverted parent.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("=========================================");
console.log("🖼️  Running Frame Tests");
console.log("=========================================\n");

const SCRIPTS = [
  "src/shared/colorUtils.js",
  "src/shared/themeCore.js",
  "src/shared/builtinThemes.js",
  "src/shared/sitePacks.js",
  "src/shared/customCss.js",
  "src/content/themeEngine/cssOverrideEngine.js",
  "src/content/themeEngine/invertEngine.js",
  "src/content/index.js",
].map((rel) => [rel, fs.readFileSync(path.join(rootDir, rel), "utf8")]);

class MockElement {
  constructor(tagName, doc) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = doc;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.textContent = "";
    this.nodeType = 1;
    this.id = "";
    this.disabled = false;
    const props = new Map();
    this.style = {
      setProperty: (k, v) => props.set(k, v),
      removeProperty: (k) => props.delete(k),
      getPropertyValue: (k) => props.get(k) || "",
    };
    this.classList = { contains: () => false };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  remove() {
    const list = this.parentElement?.children;
    if (list && list.includes(this)) list.splice(list.indexOf(this), 1);
    this.parentElement = null;
  }
  getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 50, width: 100, height: 50 }; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  matches() { return false; }
  closest() { return null; }
}

// Loads every content script into a fresh sandbox as either the top frame or a child frame.
// `top`: "self" (top frame), "cross" (child; reading window.top.location throws) or { hostname } (same-origin child).
function load({
  sync = {},
  local = {},
  top = "self",
  hostname = "example.com",
  ancestorOrigins,
  innerWidth = 800,
  innerHeight = 600,
  htmlBg = "rgb(255, 255, 255)",
  bodyBg = "rgba(0, 0, 0, 0)",
  stored = {},
} = {}) {
  const syncKeys = [];
  const sent = [];
  const intervals = [];
  const observed = [];
  let lsAccesses = 0;
  const lsData = new Map(Object.entries(stored));
  const ls = {
    getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
    setItem: (k, v) => lsData.set(k, String(v)),
    removeItem: (k) => lsData.delete(k),
  };
  const ctx = {};
  const doc = {
    readyState: "loading",
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); },
    createElement: (tag) => new MockElement(tag, doc),
    getElementById(id) {
      const find = (el) => (el.id === id ? el : el.children.map(find).find(Boolean) || null);
      return find(doc.documentElement);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createTreeWalker(root, show, filter) {
      const nodes = [];
      const walk = (el) => el.children.forEach((c) => { if (filter.acceptNode(c) === 1) nodes.push(c); walk(c); });
      walk(root);
      let i = 0;
      return { nextNode: () => nodes[i++] || null };
    },
  };
  doc.documentElement = new MockElement("html", doc);
  doc.head = doc.documentElement.appendChild(new MockElement("head", doc));
  doc.body = doc.documentElement.appendChild(new MockElement("body", doc));

  const ourStyleActive = () =>
    ["__force_dark_mode__", "__force_dark_invert__", "__force_dark_prepaint__"].some((id) => {
      const style = doc.getElementById(id);
      return style && !style.disabled;
    });
  const computed = (el) => ({
    display: "block",
    visibility: "visible",
    opacity: "1",
    color: "rgb(20, 20, 20)",
    backgroundImage: "none",
    colorScheme: "",
    backgroundColor: ourStyleActive() && (el === doc.documentElement || el === doc.body)
      ? "rgb(15, 17, 21)"
      : el === doc.documentElement ? htmlBg : el === doc.body ? bodyBg : "rgba(0, 0, 0, 0)",
  });

  const area = (name, data) => ({
    get: (keys, cb) => { if (name === "sync") syncKeys.push(keys); cb(data); },
    set: (obj, cb) => cb && cb(),
  });

  const location = { hostname, href: `https://${hostname || "blank"}/page` };
  if (ancestorOrigins) location.ancestorOrigins = ancestorOrigins;

  Object.assign(ctx, {
    console,
    document: doc,
    location,
    innerWidth,
    innerHeight,
    getComputedStyle: computed,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval() {},
    MutationObserver: class { observe(target) { observed.push(target); } disconnect() {} },
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ELEMENT: 1 },
    Element: MockElement,
    chrome: {
      storage: {
        sync: area("sync", sync),
        local: area("local", local),
        onChanged: { addListener: (fn) => { ctx.__onChanged = fn; } },
      },
      runtime: {
        id: "test-extension",
        onMessage: { addListener: (fn) => { ctx.__onMessage = fn; } },
        sendMessage: (msg) => { sent.push(msg); },
      },
    },
  });
  Object.defineProperty(ctx, "localStorage", { get() { lsAccesses += 1; return ls; } });
  ctx.window = ctx;
  if (top === "self") {
    ctx.top = ctx;
  } else if (top === "cross") {
    ctx.top = { get location() { throw new Error("SecurityError: cross-origin"); } };
  } else {
    ctx.top = { location: { hostname: top.hostname } };
  }
  vm.createContext(ctx);
  for (const [rel, code] of SCRIPTS) vm.runInContext(code, ctx, { filename: rel });

  const engineStyle = () => doc.getElementById("__force_dark_mode__");
  const invertStyle = () => doc.getElementById("__force_dark_invert__");
  const prepaintStyle = () => doc.getElementById("__force_dark_prepaint__");
  const message = (msg) => {
    const replies = [];
    ctx.__onMessage(msg, { id: "test-extension" }, (r) => replies.push(r));
    return replies;
  };
  const domReady = () => (doc.listeners.DOMContentLoaded || []).forEach((fn) => fn());
  return {
    ctx, doc, syncKeys, sent, intervals, observed, lsData, message, domReady,
    engineStyle, invertStyle, prepaintStyle, lsAccesses: () => lsAccesses,
  };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

const topCss = { "top.example": { enabled: true, engine: "css" } };
const flatKeys = (keys) => keys.flat();

// --- manifest -----------------------------------------------------------------------------------------------

test("manifest injects the content script into every frame, including about:blank/srcdoc, with permissions unchanged", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  assert.strictEqual(manifest.content_scripts.length, 1);
  const cs = manifest.content_scripts[0];
  assert.strictEqual(cs.all_frames, true);
  assert.strictEqual(cs.match_about_blank, true);
  assert.strictEqual(cs.match_origin_as_fallback, true);
  assert.deepStrictEqual(cs.matches, ["<all_urls>"], "match_origin_as_fallback needs a wildcard path; <all_urls> is unchanged");
  assert.strictEqual(cs.run_at, "document_start");
  assert.deepStrictEqual(manifest.permissions, ["storage", "activeTab", "contextMenus", "sidePanel"]);
  for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions"]) {
    assert.ok(!(key in manifest), `no ${key}`);
  }
});

// --- host resolution ----------------------------------------------------------------------------------------

test("a cross-origin child frame reads and applies the top frame's site config, not its own host's", () => {
  const f = load({ top: "cross", hostname: "ads.other.net", ancestorOrigins: ["https://mid.example", "https://top.example"], sync: topCss });
  const keys = flatKeys(f.syncKeys);
  assert.ok(keys.includes("top.example"), "reads the top host");
  assert.ok(keys.includes("__css:top.example"), "custom CSS keyed by the top host");
  assert.ok(!keys.includes("ads.other.net"), "never reads its own host");
  assert.ok(f.engineStyle(), "the top host's enabled config applies in the frame");
});

test("an about:blank child frame (no hostname of its own) uses the top host", () => {
  const f = load({ top: "cross", hostname: "", ancestorOrigins: ["https://top.example:8443"], sync: topCss });
  assert.ok(flatKeys(f.syncKeys).includes("top.example"));
  assert.ok(f.engineStyle());
});

test("a child frame whose top is a local file uses the same local_files key as the top frame", () => {
  const f = load({ top: "cross", hostname: "", ancestorOrigins: ["file://"] });
  assert.ok(flatKeys(f.syncKeys).includes("local_files"));
});

test("without ancestorOrigins a same-origin child reads the top host, a cross-origin one falls back to its own", () => {
  const same = load({ top: { hostname: "top.example" }, hostname: "", sync: topCss });
  assert.ok(flatKeys(same.syncKeys).includes("top.example"));
  const cross = load({ top: "cross", hostname: "frame.example" });
  assert.ok(flatKeys(cross.syncKeys).includes("frame.example"));
});

test("the top frame keys config by its own host", () => {
  const f = load({ hostname: "example.com", ancestorOrigins: [] });
  const keys = flatKeys(f.syncKeys);
  assert.ok(keys.includes("example.com"));
  assert.ok(keys.includes("__css:example.com"));
});

// --- messages ------------------------------------------------------------------------------------------------

test("a child frame answers no data-returning message (ANALYZE_PAGE, PAGE_INFO)", () => {
  const f = load({ top: "cross", hostname: "frame.example", ancestorOrigins: ["https://top.example"] });
  assert.deepStrictEqual(f.message({ type: "ANALYZE_PAGE" }), []);
  assert.deepStrictEqual(f.message({ type: "PAGE_INFO" }), []);
});

test("the top frame still answers ANALYZE_PAGE and PAGE_INFO", () => {
  const f = load({ hostname: "example.com" });
  const analysis = f.message({ type: "ANALYZE_PAGE" });
  assert.strictEqual(analysis.length, 1);
  assert.ok(typeof analysis[0].engine === "string");
  assert.strictEqual(JSON.stringify(f.message({ type: "PAGE_INFO" })), JSON.stringify([{ href: "https://example.com/page" }]));
});

test("APPLY_CONFIG is a broadcast and applies in child frames too", () => {
  const f = load({ top: "cross", hostname: "frame.example", ancestorOrigins: ["https://top.example"] });
  assert.strictEqual(f.engineStyle(), null);
  f.message({ type: "APPLY_CONFIG", config: { enabled: true, engine: "css" } });
  assert.ok(f.engineStyle());
});

test("the popup / side panel address data requests to the top frame only", () => {
  const popup = fs.readFileSync(path.join(rootDir, "src/popup/popup.js"), "utf8");
  assert.ok(/sendMessage\(tabId, \{ type: "PAGE_INFO" \}, \{ frameId: 0 \},/.test(popup), "PAGE_INFO goes to frame 0");
  assert.ok(/sendMessage\(tab\.id, \{ type: "ANALYZE_PAGE" \}, \{ frameId: 0 \},/.test(popup), "ANALYZE_PAGE goes to frame 0");
});

// --- usage report ---------------------------------------------------------------------------------------------

test("DARK_APPLIED is reported once by the top frame and never by a child frame", () => {
  const topFrame = load({ hostname: "top.example", sync: topCss });
  topFrame.domReady();
  topFrame.ctx.__onChanged({ "top.example": { newValue: { enabled: true, engine: "css", backgroundColor: "#000000" } } }, "sync");
  assert.deepStrictEqual(topFrame.sent.filter((m) => m.type === "DARK_APPLIED").length, 1);

  const child = load({ top: "cross", hostname: "frame.example", ancestorOrigins: ["https://top.example"], sync: topCss });
  child.domReady();
  assert.ok(child.engineStyle(), "the child is themed");
  assert.strictEqual(child.sent.filter((m) => m.type === "DARK_APPLIED").length, 0);
});

// --- pre-paint flag ----------------------------------------------------------------------------------------

test("a child frame never reads or writes the pre-paint flag and never paints the bridge", () => {
  for (const sync of [topCss, {}]) {
    const f = load({
      top: "cross", hostname: "top.example", ancestorOrigins: ["https://top.example"], sync,
      stored: { __fdm_pre: "1:" + Date.now() },
    });
    assert.strictEqual(f.prepaintStyle(), null, "no bridge in a child frame");
    f.domReady();
    f.ctx.__onChanged({ "top.example": { newValue: null } }, "sync");
    assert.strictEqual(f.lsAccesses(), 0, "localStorage never touched");
    assert.ok(f.lsData.has("__fdm_pre"), "the top frame's flag is left alone");
  }
});

test("the top frame still uses the pre-paint flag", () => {
  const f = load({ hostname: "top.example", sync: topCss });
  assert.ok(f.lsAccesses() > 0);
  assert.ok(f.lsData.has("__fdm_pre"));
});

// --- timers / performance --------------------------------------------------------------------------------------

test("a child frame's schedule check re-runs the engine only when the schedule state flips", () => {
  const f = load({
    top: "cross", hostname: "frame.example", ancestorOrigins: ["https://top.example"], sync: topCss,
    local: { scheduleConfig: { mode: "system" } },
  });
  assert.strictEqual(f.intervals.length, 1);
  let analyses = 0;
  const original = f.ctx.applyEffectiveEngine;
  f.ctx.applyEffectiveEngine = (...a) => { analyses += 1; return original(...a); };
  f.intervals[0].fn();
  assert.strictEqual(analyses, 0, "unchanged schedule state: no re-apply");
  f.ctx.matchMedia = () => ({ matches: true });
  f.intervals[0].fn();
  assert.strictEqual(analyses, 1, "state flipped: re-apply");
  assert.ok(f.engineStyle());
});

test("a tiny (tracker-sized) child frame stays inert: no engine, no observer, no timer", () => {
  const f = load({
    top: "cross", hostname: "px.tracker.net", ancestorOrigins: ["https://top.example"], sync: topCss,
    innerWidth: 1, innerHeight: 1, local: { scheduleConfig: { mode: "system" } },
  });
  f.domReady();
  assert.strictEqual(f.engineStyle(), null);
  assert.strictEqual(f.invertStyle(), null);
  assert.strictEqual(f.observed.length, 0);
  assert.strictEqual(f.intervals.length, 0);
});

test("a tiny top-level window is still themed (the size gate is for child frames only)", () => {
  const f = load({ hostname: "top.example", sync: topCss, innerWidth: 1, innerHeight: 1 });
  assert.ok(f.engineStyle());
});

// --- transparent frames --------------------------------------------------------------------------------------

const TRANSPARENT = 'data-force-dark-frame="transparent"';

function rootBackgroundRule(cssText, valueNeedle) {
  return cssText.split("}").find((block) => block.includes(valueNeedle) && /:root|html/.test(block.split("{")[0]));
}

test("a transparent child frame is marked and the engines do not give it an opaque background", () => {
  const f = load({
    top: "cross", hostname: "frame.example", ancestorOrigins: ["https://top.example"], sync: topCss,
    htmlBg: "rgba(0, 0, 0, 0)", bodyBg: "rgba(0, 0, 0, 0)",
  });
  assert.ok(f.engineStyle());
  assert.strictEqual(f.doc.documentElement.getAttribute("data-force-dark-frame"), "transparent");
  const rule = rootBackgroundRule(f.engineStyle().textContent, "var(--force-dark-bg)");
  assert.ok(rule, "root background rule found");
  const selectors = rule.split("{")[0];
  for (const part of selectors.split(",")) {
    assert.ok(part.includes(`:not([${TRANSPARENT}])`), `root/body background is skipped in transparent frames: ${part.trim()}`);
  }

  f.ctx.__onChanged({ "top.example": { newValue: { enabled: true, engine: "invert" } } }, "sync");
  assert.ok(f.invertStyle());
  const invertRule = rootBackgroundRule(f.invertStyle().textContent, "#121212");
  assert.ok(invertRule.split("{")[0].includes(`:not([${TRANSPARENT}])`), "invert's html background skips transparent frames");
  assert.strictEqual(f.doc.documentElement.getAttribute("data-force-dark-frame"), "transparent");
});

test("a child frame that paints its own background is not marked transparent", () => {
  const f = load({
    top: "cross", hostname: "frame.example", ancestorOrigins: ["https://top.example"], sync: topCss,
    htmlBg: "rgba(0, 0, 0, 0)", bodyBg: "rgb(255, 255, 255)",
  });
  assert.ok(f.engineStyle());
  assert.strictEqual(f.doc.documentElement.getAttribute("data-force-dark-frame"), null);
});

test("the top frame is never marked transparent, and the marker is removed when dark mode turns off", () => {
  const topFrame = load({ hostname: "top.example", sync: topCss, htmlBg: "rgba(0, 0, 0, 0)" });
  assert.strictEqual(topFrame.doc.documentElement.getAttribute("data-force-dark-frame"), null);

  const child = load({
    top: "cross", hostname: "frame.example", ancestorOrigins: ["https://top.example"], sync: topCss,
    htmlBg: "rgba(0, 0, 0, 0)",
  });
  child.ctx.__onChanged({ "top.example": { newValue: null } }, "sync");
  assert.strictEqual(child.engineStyle(), null);
  assert.strictEqual(child.doc.documentElement.getAttribute("data-force-dark-frame"), null);
});

// --- double inversion ---------------------------------------------------------------------------------------

test("no double inversion: an inverted parent cancels its filter on iframes, each frame themes itself", () => {
  const f = load({ hostname: "top.example", sync: { "top.example": { enabled: true, engine: "invert" } } });
  const css = f.invertStyle().textContent;
  const reinvert = css.split("}").find((b) => b.includes("filter: invert(1) hue-rotate(180deg)"));
  const selectors = reinvert.split("{")[0].split(",").map((s) => s.trim());
  assert.ok(selectors.includes("iframe"), "iframe elements are re-inverted so the parent's invert is cancelled");

  // The child frame under it applies its own engine (it would otherwise be inverted back to light).
  const child = load({
    top: "cross", hostname: "frame.example", ancestorOrigins: ["https://top.example"],
    sync: { "top.example": { enabled: true, engine: "invert" } },
  });
  assert.ok(child.invertStyle(), "the child inverts its own content");
});

test("the CSS engine still leaves iframe elements unfiltered", () => {
  const f = load({ hostname: "top.example", sync: topCss });
  assert.ok(/:is\(img, picture, video, canvas, iframe, embed, object, svg\) \{\s*filter: none !important;/.test(f.engineStyle().textContent));
});

console.log("\n=========================================");
console.log(`${failed ? "❌" : "🎉"} Frame Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
