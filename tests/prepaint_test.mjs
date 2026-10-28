// tests/prepaint_test.mjs
// Startup flash: both storage reads go out at once, and a re-apply that resolves to what is already on the
// page keeps the engine in place instead of tearing it down and re-adding it.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("=========================================");
console.log("🌗 Running Startup / Pre-paint Tests");
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

// Loads every content script into a fresh sandbox. Storage callbacks are queued, not run, so a test decides
// when each read returns. The html canvas reads dark while any of our enabled engine styles is in the page,
// which is what Auto would misread as a natively dark site if it analysed the page with them switched on.
// `stored` seeds the page's localStorage; `storageThrows` makes every localStorage access throw, as a blocked
// or sandboxed page does. Every localStorage write is recorded in `writes`.
function loadContentScripts({ sync = {}, local = {}, bodyElements = 0, stored = {}, storageThrows = false, syncResult } = {}) {
  const calls = [];
  const timers = [];
  const writes = [];
  const lsData = new Map(Object.entries(stored));
  const ls = {
    getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
    setItem: (k, v) => { writes.push(["set", k, String(v)]); lsData.set(k, String(v)); },
    removeItem: (k) => { writes.push(["remove", k]); lsData.delete(k); },
  };
  const pending = [];
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
  for (let i = 0; i < bodyElements; i++) doc.body.appendChild(new MockElement("div", doc));

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
    backgroundColor: el === doc.documentElement
      ? (ourStyleActive() ? "rgb(15, 17, 21)" : "rgb(255, 255, 255)")
      : "rgba(0, 0, 0, 0)",
  });

  const storageArea = (name, data) => ({
    get: (keys, cb) => {
      calls.push(name);
      pending.push({ name, run: () => cb(name === "sync" && syncResult !== undefined ? syncResult : data) });
    },
    set: (obj, cb) => cb && cb(),
  });

  Object.assign(ctx, {
    console,
    document: doc,
    location: { hostname: "example.com", href: "https://example.com/" },
    innerWidth: 1024,
    innerHeight: 768,
    getComputedStyle: computed,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: () => 1, // scans never run; these tests are about engine style lifecycles
    cancelAnimationFrame() {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    MutationObserver: class { observe() {} disconnect() {} },
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ELEMENT: 1 },
    Element: MockElement,
    chrome: {
      storage: {
        sync: storageArea("sync", sync),
        local: storageArea("local", local),
        onChanged: { addListener: (fn) => { ctx.__onChanged = fn; } },
      },
      runtime: { id: "test-extension", onMessage: { addListener() {} }, sendMessage() {} },
    },
  });
  Object.defineProperty(ctx, "localStorage", {
    get() { if (storageThrows) throw new Error("SecurityError: access denied"); return ls; },
  });
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const [rel, code] of SCRIPTS) vm.runInContext(code, ctx, { filename: rel });

  const settle = () => { while (pending.length) pending.shift().run(); };
  const engineStyle = () => doc.getElementById("__force_dark_mode__");
  const invertStyle = () => doc.getElementById("__force_dark_invert__");
  const prepaintStyle = () => doc.getElementById("__force_dark_prepaint__");
  return { ctx, doc, calls, pending, settle, engineStyle, invertStyle, prepaintStyle, lsData, writes, timers };
}

// Wraps the engine teardown functions so a test can count them.
function countTeardowns(ctx) {
  const counts = { disableDarkMode: 0, disableInvert: 0, clearFilterVars: 0 };
  for (const name of Object.keys(counts)) {
    const original = ctx[name];
    ctx[name] = (...args) => { counts[name] += 1; return original(...args); };
  }
  return counts;
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

const enabledCss = { "example.com": { enabled: true, engine: "css" } };

test("both storage reads are issued before either callback runs", () => {
  const { calls, pending, engineStyle } = loadContentScripts({ sync: enabledCss });
  assert.deepStrictEqual([...calls].sort(), ["local", "sync"]);
  assert.strictEqual(pending.length, 2, "neither read has returned yet");
  assert.strictEqual(engineStyle(), null);
});

test("the engine applies once both reads have returned, in either order", () => {
  for (const order of [["sync", "local"], ["local", "sync"]]) {
    const { pending, engineStyle } = loadContentScripts({ sync: enabledCss });
    const first = pending.find((p) => p.name === order[0]);
    pending.splice(pending.indexOf(first), 1);
    first.run();
    assert.strictEqual(engineStyle(), null, `nothing applied after only ${order[0]} returned`);
    pending.shift().run();
    assert.ok(engineStyle(), `applied after ${order.join(" then ")}`);
  }
});

test("the schedule from storage.local still gates the first apply", () => {
  const schedule = { scheduleConfig: { mode: "system" } }; // matchMedia says light, so outside the schedule
  const { settle, engineStyle } = loadContentScripts({ sync: enabledCss, local: schedule });
  settle();
  assert.strictEqual(engineStyle(), null);
});

test("the DOMContentLoaded re-run with an unchanged config keeps the engine in place", () => {
  const { ctx, doc, settle, engineStyle } = loadContentScripts({ sync: enabledCss });
  settle();
  const style = engineStyle();
  assert.ok(style);
  const counts = countTeardowns(ctx);
  doc.listeners.DOMContentLoaded.forEach((fn) => fn());
  settle();
  assert.strictEqual(engineStyle(), style, "same style element");
  assert.deepStrictEqual(counts, { disableDarkMode: 0, disableInvert: 0, clearFilterVars: 0 });
});

test("an unrelated storage change with the same config performs no teardown", () => {
  const { ctx, settle, engineStyle } = loadContentScripts({ sync: enabledCss });
  settle();
  const style = engineStyle();
  const counts = countTeardowns(ctx);
  ctx.__onChanged({ "example.com": { newValue: { enabled: true, engine: "css" } } }, "sync");
  assert.strictEqual(engineStyle(), style);
  assert.strictEqual(counts.disableDarkMode, 0);
});

test("a changed config tears down and re-applies as before", () => {
  const { ctx, doc, settle, engineStyle, invertStyle } = loadContentScripts({ sync: enabledCss });
  settle();
  const style = engineStyle();
  const counts = countTeardowns(ctx);

  ctx.__onChanged({ "example.com": { newValue: { enabled: true, engine: "css", backgroundColor: "#000000" } } }, "sync");
  assert.strictEqual(counts.disableDarkMode, 1);
  assert.notStrictEqual(engineStyle(), style, "style rebuilt");
  assert.strictEqual(doc.documentElement.style.getPropertyValue("--force-dark-bg"), "#000000");

  ctx.__onChanged({ "example.com": { newValue: { enabled: true, engine: "css", backgroundColor: "#000000", brightness: 120 } } }, "sync");
  assert.strictEqual(counts.disableDarkMode, 2, "filter change re-applies");
  assert.strictEqual(doc.documentElement.getAttribute("data-force-dark-filter"), "true");

  ctx.__onChanged({ "example.com": { newValue: { enabled: true, engine: "invert" } } }, "sync");
  assert.strictEqual(engineStyle(), null);
  assert.ok(invertStyle());

  ctx.__onChanged({ "example.com": { newValue: { enabled: false } } }, "sync");
  assert.strictEqual(invertStyle(), null, "disabling removes the engine");
  assert.strictEqual(engineStyle(), null);
});

test("a theme change re-applies even though the site config is unchanged", () => {
  const sync = { "example.com": { enabled: true, engine: "css", themeId: "user:x" } };
  const { ctx, doc, settle } = loadContentScripts({ sync });
  settle();
  ctx.__onChanged({ __customThemes: { newValue: [{ id: "user:x", name: "X", colors: { background: "#112233" } }] } }, "sync");
  assert.strictEqual(doc.documentElement.style.getPropertyValue("--force-dark-bg"), "#112233");
});

test("re-applying after the engine style was removed externally restores it", () => {
  const { ctx, settle, engineStyle } = loadContentScripts({ sync: enabledCss });
  settle();
  engineStyle().remove();
  ctx.applyEffectiveEngine();
  assert.ok(engineStyle(), "missing style is not mistaken for an unchanged apply");
});

test("Auto re-apply analyses the page without our styles and keeps the engine", () => {
  const sync = { "example.com": { enabled: true, engine: "auto" } };
  const { ctx, doc, settle, engineStyle } = loadContentScripts({ sync, bodyElements: 30 });
  settle();
  const style = engineStyle();
  assert.ok(style, "Auto picked the CSS engine for a light page");
  const counts = countTeardowns(ctx);
  doc.listeners.DOMContentLoaded.forEach((fn) => fn());
  settle();
  assert.strictEqual(engineStyle(), style, "our dark canvas is not read as a natively dark page");
  assert.strictEqual(style.disabled, false, "the style is switched back on after the analysis");
  assert.strictEqual(counts.disableDarkMode, 0);
});

// ---- Pre-paint bridge (the `__fdm_pre` flag in the page's own localStorage) ----
const DAY = 24 * 60 * 60 * 1000;
const fresh = () => ({ __fdm_pre: "1:" + (Date.now() - DAY) });
const prepaintCss = "html{background:#0f1115!important;color-scheme:dark}";
const onlyFlagWrites = (writes) => writes.every((w) => w[1] === "__fdm_pre" && (w[0] === "remove" || /^1:\d+$/.test(w[2])));

test("a fresh dark flag paints the provisional dark canvas synchronously, before any storage read returns", () => {
  const { pending, prepaintStyle, doc } = loadContentScripts({ sync: enabledCss, stored: fresh() });
  assert.strictEqual(pending.length, 2, "no storage read has returned");
  const style = prepaintStyle();
  assert.ok(style, "provisional style injected");
  assert.strictEqual(style.parentElement, doc.head);
  assert.strictEqual(style.textContent, prepaintCss);
});

test("no provisional style on a miss, an off flag, a stale flag or a garbled flag", () => {
  for (const stored of [
    {},
    { __fdm_pre: "0" },
    { __fdm_pre: "1" },
    { __fdm_pre: "1:" + (Date.now() - 8 * DAY) },
    { __fdm_pre: "1:" + (Date.now() + DAY) },
    { __fdm_pre: "1:abc" },
    { __fdm_pre: "yes" },
    { other: "1:" + Date.now() },
  ]) {
    const { prepaintStyle } = loadContentScripts({ sync: enabledCss, stored });
    assert.strictEqual(prepaintStyle(), null, `no bridge for ${JSON.stringify(stored)}`);
  }
});

test("a throwing localStorage does not break startup", () => {
  const { settle, engineStyle, prepaintStyle } = loadContentScripts({ sync: enabledCss, storageThrows: true });
  assert.strictEqual(prepaintStyle(), null);
  settle();
  assert.ok(engineStyle(), "the engine still applies");
});

test("the provisional style is removed once the engine applies, and the flag is refreshed", () => {
  const { settle, engineStyle, prepaintStyle, lsData, writes } = loadContentScripts({ sync: enabledCss, stored: fresh() });
  settle();
  assert.ok(engineStyle());
  assert.strictEqual(prepaintStyle(), null, "bridge removed");
  const match = /^1:(\d+)$/.exec(lsData.get("__fdm_pre"));
  assert.ok(match && Date.now() - Number(match[1]) < 5000, "flag rewritten with a current timestamp");
  assert.ok(onlyFlagWrites(writes));
});

test("the flag is written when an engine applies on a page that had none", () => {
  for (const engine of ["css", "invert"]) {
    const { settle, lsData } = loadContentScripts({ sync: { "example.com": { enabled: true, engine } } });
    settle();
    assert.match(lsData.get("__fdm_pre") || "", /^1:\d+$/, `flag set for ${engine}`);
  }
});

test("off, site disabled, no config, outside the schedule or a failed read: bridge removed and flag cleared", () => {
  for (const [label, opts] of [
    ["site disabled", { sync: { "example.com": { enabled: false, engine: "css" } } }],
    ["no config for the site", { sync: {} }],
    ["outside the schedule", { sync: enabledCss, local: { scheduleConfig: { mode: "system" } } }],
    ["storage read failed", { sync: enabledCss, syncResult: null }],
  ]) {
    const { settle, prepaintStyle, engineStyle, lsData } = loadContentScripts({ ...opts, stored: fresh() });
    assert.ok(prepaintStyle(), `${label}: bridge shown first`);
    settle();
    assert.strictEqual(prepaintStyle(), null, `${label}: bridge removed`);
    assert.strictEqual(engineStyle(), null, `${label}: no engine`);
    assert.strictEqual(lsData.has("__fdm_pre"), false, `${label}: flag cleared`);
  }
});

test("turning dark mode off later clears the flag", () => {
  const { ctx, settle, lsData } = loadContentScripts({ sync: enabledCss });
  settle();
  assert.ok(lsData.has("__fdm_pre"));
  ctx.__onChanged({ "example.com": { newValue: { enabled: false } } }, "sync");
  assert.strictEqual(lsData.has("__fdm_pre"), false);
});

test("a natively dark page clears the flag and loses the bridge", () => {
  const sync = { "example.com": { enabled: true, engine: "auto" } };
  const { ctx, settle, prepaintStyle, engineStyle, lsData } = loadContentScripts({ sync, bodyElements: 30, stored: fresh() });
  ctx.getComputedStyle = (el) => ({
    display: "block", visibility: "visible", opacity: "1", color: "rgb(230, 230, 230)", backgroundImage: "none",
    colorScheme: "dark", backgroundColor: el === ctx.document.documentElement ? "rgb(10, 10, 10)" : "rgba(0, 0, 0, 0)",
  });
  settle();
  assert.strictEqual(engineStyle(), null, "natively dark: no engine");
  assert.strictEqual(prepaintStyle(), null);
  assert.strictEqual(lsData.has("__fdm_pre"), false);
});

test("Auto analysis is not fooled by the provisional dark canvas", () => {
  const sync = { "example.com": { enabled: true, engine: "auto" } };
  const { settle, engineStyle, prepaintStyle } = loadContentScripts({ sync, bodyElements: 30, stored: fresh() });
  assert.ok(prepaintStyle());
  settle();
  assert.ok(engineStyle(), "light page still gets the CSS engine");
  assert.strictEqual(prepaintStyle(), null);
});

test("a failsafe timer removes the bridge if the real state never arrives", () => {
  const { prepaintStyle, timers } = loadContentScripts({ sync: enabledCss, stored: fresh() });
  const failsafe = timers.find((t) => t.ms === 4000);
  assert.ok(failsafe, "failsafe scheduled");
  failsafe.fn();
  assert.strictEqual(prepaintStyle(), null);
});

test("only the __fdm_pre key is ever written to localStorage", () => {
  const all = [];
  for (const sync of [enabledCss, { "example.com": { enabled: true, engine: "invert" } }, { "example.com": { enabled: false } }, {}]) {
    const { ctx, settle, writes, doc } = loadContentScripts({ sync, stored: fresh(), bodyElements: 30 });
    settle();
    doc.listeners.DOMContentLoaded.forEach((fn) => fn());
    settle();
    ctx.__onChanged({ "example.com": { newValue: { enabled: true, engine: "css" } } }, "sync");
    ctx.__onChanged({ "example.com": { newValue: null } }, "sync");
    all.push(...writes);
  }
  assert.ok(all.length > 0);
  assert.ok(onlyFlagWrites(all), `unexpected write: ${JSON.stringify(all.find((w) => w[1] !== "__fdm_pre"))}`);
});

console.log("\n=========================================");
console.log(`${failed ? "❌" : "🎉"} Startup Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
