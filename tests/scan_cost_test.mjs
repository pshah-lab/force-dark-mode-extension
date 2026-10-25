// tests/scan_cost_test.mjs
// Back/forward cache restores (pageshow with persisted) and the CSS engine's scan cost: chunked scans,
// coalesced scan roots, conditional late rescans, mutation filtering and full cancellation on disable.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("=========================================");
console.log("🧮 Running bfcache / Scan Cost Tests");
console.log("=========================================\n");

const read = (rel) => [rel, fs.readFileSync(path.join(rootDir, rel), "utf8")];
const ALL_SCRIPTS = [
  "src/shared/colorUtils.js",
  "src/shared/themeCore.js",
  "src/shared/builtinThemes.js",
  "src/shared/sitePacks.js",
  "src/shared/customCss.js",
  "src/content/themeEngine/cssOverrideEngine.js",
  "src/content/themeEngine/invertEngine.js",
  "src/content/index.js",
].map(read);
const ENGINE_SCRIPTS = ["src/shared/colorUtils.js", "src/content/themeEngine/cssOverrideEngine.js"].map(read);

const TRANSPARENT = "rgba(0, 0, 0, 0)";

class MockElement {
  constructor(tagName, env) {
    this.tagName = tagName.toUpperCase();
    this.env = env;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.textContent = "";
    this.nodeType = 1;
    this.id = "";
    this.disabled = false;
    this.computed = { backgroundColor: TRANSPARENT, color: "rgb(232, 234, 237)" };
    const props = new Map();
    this.style = {
      setProperty: (k, v) => props.set(k, v),
      removeProperty: (k) => props.delete(k),
      getPropertyValue: (k) => props.get(k) || "",
    };
    this.classList = { contains: () => false };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); this.env.attrWrites.push([this, name]); }
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
  descendants() {
    const out = [];
    const walk = (el) => el.children.forEach((c) => { out.push(c); walk(c); });
    walk(this);
    return out;
  }
  querySelectorAll(selector) {
    this.env.queries.push([this, selector]);
    const all = this.descendants();
    if (selector === "*") return all;
    const parts = selector.split(",").map((s) => s.trim());
    if (selector.includes("[")) {
      const names = parts.map((s) => s.replace(/[[\]]/g, "").trim());
      return all.filter((el) => names.some((n) => el.hasAttribute(n)));
    }
    return all.filter((el) => parts.includes(el.tagName.toLowerCase()));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  matches(selector) { return selector.split(",").some((s) => s.trim().toLowerCase() === this.tagName.toLowerCase()); }
  closest() { return null; }
}

// A page in a fresh sandbox. rAF, idle callbacks and timers are queued so each test decides when they run.
// Storage callbacks are queued too (`settle` runs them). `idle: false` leaves requestIdleCallback undefined.
function createPage({ scripts = ENGINE_SCRIPTS, sync = {}, local = {}, child = false, idle = true, stored = {} } = {}) {
  const env = { attrWrites: [], queries: [] };
  const frames = [];
  const idles = [];
  const timers = [];
  const cancelled = { frames: [], idles: [], timers: [] };
  const reads = [];
  const calls = [];
  const pending = [];
  const writes = [];
  let clock = 0;
  let timerId = 0;
  let observerCallback = null;
  const observers = [];
  const lsData = new Map(Object.entries(stored));
  const ls = {
    getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
    setItem: (k, v) => { writes.push(["set", k]); lsData.set(k, String(v)); },
    removeItem: (k) => { writes.push(["remove", k]); lsData.delete(k); },
  };

  const doc = {
    readyState: "interactive",
    listeners: {},
    styleSheets: [],
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); },
    createElement: (tag) => new MockElement(tag, env),
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
  doc.documentElement = new MockElement("html", env);
  doc.head = doc.documentElement.appendChild(new MockElement("head", env));
  doc.body = doc.documentElement.appendChild(new MockElement("body", env));
  doc.documentElement.computed = { backgroundColor: "rgb(255, 255, 255)", color: "rgb(20, 20, 20)" };

  const winListeners = {};
  const ctx = {
    console,
    document: doc,
    location: child
      ? { hostname: "embed.example.net", href: "https://embed.example.net/", ancestorOrigins: ["https://example.com"] }
      : { hostname: "example.com", href: "https://example.com/" },
    innerWidth: 1024,
    innerHeight: 768,
    performance: { now: () => clock },
    getComputedStyle: (el) => {
      reads.push(el);
      if (env.onRead) env.onRead(el);
      const c = el.computed || {};
      return {
        display: "block", visibility: "visible", opacity: "1", backgroundImage: "none", colorScheme: "",
        backgroundColor: c.backgroundColor || TRANSPARENT,
        color: c.color || "rgb(232, 234, 237)",
        fill: c.fill || "",
        borderTopColor: TRANSPARENT, borderRightColor: TRANSPARENT, borderBottomColor: TRANSPARENT,
        borderLeftColor: TRANSPARENT, outlineColor: TRANSPARENT,
      };
    },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { winListeners[type] = (winListeners[type] || []).filter((f) => f !== fn); },
    requestAnimationFrame: (fn) => { frames.push({ id: ++timerId, fn }); return timerId; },
    cancelAnimationFrame: (id) => { cancelled.frames.push(id); const i = frames.findIndex((f) => f.id === id); if (i >= 0) frames.splice(i, 1); },
    setTimeout: (fn, ms = 0) => { timers.push({ id: ++timerId, fn, ms }); return timerId; },
    clearTimeout: (id) => { cancelled.timers.push(id); const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: () => 1,
    clearInterval() {},
    MutationObserver: class {
      constructor(cb) { observerCallback = cb; this.connected = false; observers.push(this); }
      observe(target, options) { this.connected = true; this.target = target; this.options = options; }
      disconnect() { this.connected = false; }
    },
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ELEMENT: 1 },
    Element: MockElement,
    chrome: {
      storage: {
        sync: { get: (keys, cb) => { calls.push("sync"); pending.push({ name: "sync", run: () => cb(sync) }); }, set: (o, cb) => cb && cb() },
        local: { get: (keys, cb) => { calls.push("local"); pending.push({ name: "local", run: () => cb(local) }); }, set: (o, cb) => cb && cb() },
        onChanged: { addListener: (fn) => { ctx.__onChanged = fn; } },
      },
      runtime: { id: "test-extension", onMessage: { addListener() {} }, sendMessage() {} },
    },
  };
  if (child) ctx.top = { notTheSameWindow: true };
  if (idle) {
    ctx.requestIdleCallback = (fn, opts) => { idles.push({ id: ++timerId, fn, opts }); return timerId; };
    ctx.cancelIdleCallback = (id) => { cancelled.idles.push(id); const i = idles.findIndex((t) => t.id === id); if (i >= 0) idles.splice(i, 1); };
  }
  Object.defineProperty(ctx, "localStorage", { get() { return ls; } });
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const [rel, code] of scripts) vm.runInContext(code, ctx, { filename: rel });

  const settle = () => { while (pending.length) pending.shift().run(); };
  const runFrame = () => { const f = frames.shift(); if (f) f.fn(clock); return Boolean(f); };
  const runIdle = (timeRemaining = 50) => {
    const t = idles.shift();
    if (t) t.fn({ didTimeout: false, timeRemaining: () => timeRemaining });
    return Boolean(t);
  };
  // Runs the earliest-due timer (by delay, then insertion order).
  const runTimer = (filter = () => true) => {
    const due = timers.filter(filter).sort((a, b) => a.ms - b.ms || a.id - b.id)[0];
    if (!due) return false;
    timers.splice(timers.indexOf(due), 1);
    due.fn();
    return true;
  };
  // Drains scan work only (frames, idle slices and zero-delay continuation timers), not the late timers.
  const flushScans = () => {
    let slices = 0;
    for (let guard = 0; guard < 10000; guard++) {
      if (runFrame() || runIdle() || runTimer((t) => t.ms <= 16)) { slices++; continue; }
      break;
    }
    return slices;
  };
  const addDivs = (parent, n, computed) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const el = parent.appendChild(new MockElement("div", env));
      if (computed) el.computed = { ...computed };
      out.push(el);
    }
    return out;
  };
  const mutate = (records) => observerCallback && observerCallback(records, observers[0]);
  return {
    ctx, doc, env, frames, idles, timers, cancelled, reads, calls, pending, writes, lsData, observers,
    settle, runFrame, runIdle, runTimer, flushScans, addDivs, mutate,
    winListeners,
    advance: (ms) => { clock += ms; },
    engineStyle: () => doc.getElementById("__force_dark_mode__"),
    get: (name) => vm.runInContext(name, ctx),
  };
}

const WHITE = { backgroundColor: "rgb(255, 255, 255)", color: "rgb(20, 20, 20)" };
const SURFACE = "data-force-dark-surface";

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

function countTeardowns(ctx) {
  const counts = { disableDarkMode: 0, disableInvert: 0, clearFilterVars: 0 };
  for (const name of Object.keys(counts)) {
    const original = ctx[name];
    ctx[name] = (...args) => { counts[name] += 1; return original(...args); };
  }
  return counts;
}

const firePageshow = (page, persisted) => (page.winListeners.pageshow || []).forEach((fn) => fn({ type: "pageshow", persisted }));
const enabledCss = () => ({ "example.com": { enabled: true, engine: "css" } });

// ---- Task A: back/forward cache restore -------------------------------------------------------------------

console.log("bfcache restore (pageshow)");

test("a pageshow handler is registered", () => {
  const page = createPage({ scripts: ALL_SCRIPTS, sync: enabledCss() });
  assert.ok((page.winListeners.pageshow || []).length >= 1);
});

test("pageshow with persisted re-reads the schedule and the site config in parallel and re-applies", () => {
  const page = createPage({ scripts: ALL_SCRIPTS, sync: enabledCss() });
  page.settle();
  assert.ok(page.engineStyle(), "applied at startup");
  page.calls.length = 0;
  firePageshow(page, true);
  assert.deepStrictEqual([...page.calls].sort(), ["local", "sync"], "both reads issued");
  assert.strictEqual(page.pending.length, 2, "both reads outstanding at once (parallel)");
  page.settle();
  assert.ok(page.engineStyle(), "still applied");
});

test("pageshow without persisted (a normal load) does nothing", () => {
  const page = createPage({ scripts: ALL_SCRIPTS, sync: enabledCss() });
  page.settle();
  page.calls.length = 0;
  firePageshow(page, false);
  firePageshow(page, undefined);
  assert.deepStrictEqual(page.calls, []);
  assert.strictEqual(page.pending.length, 0);
});

test("stale state: dark mode turned off while the page was frozen is applied on restore", () => {
  const sync = enabledCss();
  const page = createPage({ scripts: ALL_SCRIPTS, sync });
  page.settle();
  assert.ok(page.engineStyle());
  assert.ok(page.lsData.has("__fdm_pre"), "flag set while dark");
  // The user switched dark mode off in another tab; the onChanged event was missed while frozen.
  sync["example.com"] = { enabled: false, engine: "css" };
  firePageshow(page, true);
  page.settle();
  assert.strictEqual(page.engineStyle(), null, "engine removed after restore");
  assert.strictEqual(page.doc.documentElement.getAttribute("data-force-dark-mode"), null);
  assert.ok(!page.lsData.has("__fdm_pre"), "pre-paint flag settled to off");
});

test("stale schedule: a schedule set while frozen is re-read on restore", () => {
  const local = {};
  const page = createPage({ scripts: ALL_SCRIPTS, sync: enabledCss(), local });
  page.settle();
  assert.ok(page.engineStyle());
  local.scheduleConfig = { mode: "system" }; // matchMedia says light: outside the schedule
  firePageshow(page, true);
  page.settle();
  assert.strictEqual(page.engineStyle(), null);
});

test("restore with unchanged state performs no teardown and re-settles the flag", () => {
  const page = createPage({ scripts: ALL_SCRIPTS, sync: enabledCss() });
  page.settle();
  const style = page.engineStyle();
  const counts = countTeardowns(page.ctx);
  page.writes.length = 0;
  page.lsData.delete("__fdm_pre"); // e.g. cleared by another tab of this origin
  firePageshow(page, true);
  page.settle();
  assert.strictEqual(page.engineStyle(), style, "same style element");
  assert.deepStrictEqual(counts, { disableDarkMode: 0, disableInvert: 0, clearFilterVars: 0 });
  assert.ok(page.lsData.has("__fdm_pre"), "flag written again");
});

test("a child frame re-applies on restore but never touches the pre-paint flag", () => {
  const sync = enabledCss();
  const page = createPage({ scripts: ALL_SCRIPTS, sync, child: true, stored: { __fdm_pre: "1:" + Date.now() } });
  page.settle();
  assert.ok(page.engineStyle(), "child frame themed");
  page.calls.length = 0;
  sync["example.com"] = { enabled: false };
  firePageshow(page, true);
  assert.deepStrictEqual([...page.calls].sort(), ["local", "sync"]);
  page.settle();
  assert.strictEqual(page.engineStyle(), null, "turned off in the child frame too");
  assert.deepStrictEqual(page.writes, [], "no localStorage writes from a child frame");
  assert.ok(page.lsData.has("__fdm_pre"), "the top frame's flag is left alone");
});

// ---- Task B: scan cost ------------------------------------------------------------------------------------

console.log("\nCSS engine scan cost");

test("a large scan is processed in slices and yields between them, then finishes", () => {
  const page = createPage();
  const divs = page.addDivs(page.doc.body, 2000, WHITE);
  page.ctx.enableDarkMode({});
  assert.strictEqual(page.frames.length, 1, "first slice waits for a frame");
  page.runFrame();
  const firstSlice = page.reads.length;
  assert.ok(firstSlice > 0 && firstSlice <= 400, `first slice bounded (read ${firstSlice})`);
  assert.strictEqual(page.idles.length, 1, "the rest is continued in an idle callback");
  assert.strictEqual(divs[1999].getAttribute(SURFACE), null, "not all done in one slice");
  const slices = page.flushScans();
  assert.ok(slices >= 4, `several slices (${slices + 1})`);
  assert.ok(divs.every((d) => d.getAttribute(SURFACE) === "strong"), "every element classified");
  assert.ok(page.reads.length <= 2000 + 3 + 5, `each element read about once (${page.reads.length})`);
});

test("writes in a slice happen only after that slice's reads (read-then-write split)", () => {
  const page = createPage();
  page.addDivs(page.doc.body, 600, WHITE);
  const order = [];
  page.env.onRead = () => order.push("r");
  page.ctx.enableDarkMode({});
  page.env.attrWrites.length = 0;
  const origPush = page.env.attrWrites.push.bind(page.env.attrWrites);
  page.env.attrWrites.push = (x) => { order.push("w"); return origPush(x); };
  page.runFrame();
  const firstW = order.indexOf("w");
  assert.ok(firstW > 0, "there were writes");
  assert.ok(!order.slice(firstW).includes("r"), "no read after the first write in a slice");
});

test("a slice also stops on its time budget", () => {
  const page = createPage();
  page.addDivs(page.doc.body, 1000, WHITE);
  page.env.onRead = () => page.advance(1); // 1 ms per element
  page.ctx.enableDarkMode({});
  page.runFrame();
  assert.ok(page.reads.length < 100, `time budget respected (read ${page.reads.length})`);
  page.flushScans();
  assert.ok(page.doc.body.children.every((d) => d.getAttribute(SURFACE) === "strong"));
});

test("without requestIdleCallback the continuation falls back to setTimeout", () => {
  const page = createPage({ idle: false });
  const divs = page.addDivs(page.doc.body, 1500, WHITE);
  page.ctx.enableDarkMode({});
  page.runFrame();
  assert.ok(page.timers.some((t) => t.ms <= 16), "a short timer continues the scan");
  page.flushScans();
  assert.ok(divs.every((d) => d.getAttribute(SURFACE) === "strong"));
});

test("scan roots are coalesced: descendants of a queued ancestor are dropped, each element read once", () => {
  const page = createPage();
  const [parent] = page.addDivs(page.doc.body, 1, WHITE);
  const kids = page.addDivs(parent, 10, WHITE);
  const grandkids = page.addDivs(kids[0], 10, WHITE);
  page.ctx.enableDarkMode({});
  page.flushScans();
  page.reads.length = 0;
  page.ctx.scheduleScan(grandkids[3]);
  page.ctx.scheduleScan(kids[0]);
  page.ctx.scheduleScan(parent);
  page.ctx.scheduleScan(kids[0]);
  page.flushScans();
  assert.strictEqual(page.reads.length, 1 + 10 + 10, `parent subtree read once (${page.reads.length})`);
  assert.strictEqual(new Set(page.reads).size, page.reads.length, "no element read twice");
});

test("late rescans do not run once the document stopped growing (and the 6000 ms one is dropped)", () => {
  const page = createPage();
  page.addDivs(page.doc.body, 50, WHITE);
  page.ctx.enableDarkMode({});
  page.flushScans();
  (page.winListeners.load || []).forEach((fn) => fn({}));
  // 150 ms after-load rescan always runs.
  page.reads.length = 0;
  page.runTimer((t) => t.ms === 150);
  page.flushScans();
  assert.ok(page.reads.length >= 50, "the 150 ms rescan stays");
  page.reads.length = 0;
  while (page.runTimer((t) => t.ms > 150)) page.flushScans();
  assert.strictEqual(page.reads.length, 0, "no late full rescans for a settled document");
  assert.ok(!page.timers.some((t) => t.ms === 6000), "6000 ms rescan not pending");
});

test("late rescans run while the document is still growing (elements or CSSOM rules)", () => {
  const page = createPage();
  page.addDivs(page.doc.body, 50, WHITE);
  page.ctx.enableDarkMode({});
  page.flushScans();
  (page.winListeners.load || []).forEach((fn) => fn({}));
  page.runTimer((t) => t.ms === 150);
  page.flushScans();

  // Hydration adds elements (no observer in this mock delivers them): the 800 ms rescan picks them up.
  const late = page.addDivs(page.doc.body, 5, WHITE);
  page.runTimer((t) => t.ms === 800);
  page.flushScans();
  assert.ok(late.every((d) => d.getAttribute(SURFACE) === "strong"), "800 ms rescan ran");

  // A CSS-in-JS library inserts a rule (no DOM mutation): the 2500 ms rescan sees the CSSOM grew.
  const target = page.doc.body.children[0];
  target.computed = { backgroundColor: "rgb(240, 240, 240)", color: "rgb(20, 20, 20)" };
  target.removeAttribute(SURFACE);
  page.doc.styleSheets.push({ cssRules: { length: 1 } });
  page.runTimer((t) => t.ms === 2500);
  page.flushScans();
  assert.strictEqual(target.getAttribute(SURFACE), "strong", "2500 ms rescan ran");

  assert.ok(page.timers.some((t) => t.ms === 6000), "6000 ms rescan kept while still growing");
  page.reads.length = 0;
  page.addDivs(page.doc.body, 1, WHITE);
  page.runTimer((t) => t.ms === 6000);
  page.flushScans();
  assert.ok(page.reads.length > 50, "6000 ms rescan ran");
});

test("our own attribute writes and no-op mutations never retrigger a scan", () => {
  const page = createPage();
  const [card] = page.addDivs(page.doc.body, 1, WHITE);
  page.ctx.enableDarkMode({});
  page.flushScans();
  const options = page.observers[0].options;
  assert.ok(!options.attributeFilter.some((a) => a.startsWith("data-force-dark")), "own markers not observed");
  assert.strictEqual(options.attributeOldValue, true, "old values recorded to detect no-op changes");

  page.reads.length = 0;
  const html = page.doc.documentElement;
  html.attributes.set("style", "--force-dark-bg: #111111; --force-dark-text: #eeeeee;");
  page.mutate([
    { type: "attributes", attributeName: SURFACE, target: card, oldValue: null, addedNodes: [] },
    { type: "attributes", attributeName: "data-force-dark-text", target: card, oldValue: null, addedNodes: [] },
    // Only our own custom properties changed on the root.
    { type: "attributes", attributeName: "style", target: html, oldValue: "--force-dark-bg: #000000;", addedNodes: [] },
    // A class re-set to the same value on an already classified element.
    { type: "attributes", attributeName: "class", target: card, oldValue: null, addedNodes: [] },
  ]);
  assert.strictEqual(page.frames.length + page.idles.length, 0, "nothing scheduled");
  page.flushScans();
  assert.strictEqual(page.reads.length, 0);

  // A real change still rescans.
  card.attributes.set("class", "selected");
  page.mutate([{ type: "attributes", attributeName: "class", target: card, oldValue: null, addedNodes: [] }]);
  page.flushScans();
  assert.ok(page.reads.includes(card), "a real class change rescans the element");
});

test("an attribute-only mutation rescans the element and a bounded set of descendants, not its whole subtree", () => {
  const page = createPage();
  const [panel] = page.addDivs(page.doc.body, 1, WHITE);
  const rows = page.addDivs(panel, 50, WHITE);
  rows.forEach((r) => page.addDivs(r, 20, WHITE)); // 1,000 grandchildren
  page.ctx.enableDarkMode({});
  page.flushScans();
  page.reads.length = 0;
  page.env.queries.length = 0;
  panel.attributes.set("class", "open");
  page.mutate([{ type: "attributes", attributeName: "class", target: panel, oldValue: "", addedNodes: [] }]);
  page.flushScans();
  assert.ok(page.reads.includes(panel), "the element itself");
  assert.ok(rows.every((r) => page.reads.includes(r)), "its direct children");
  assert.ok(page.reads.length <= 1 + 200, `bounded (${page.reads.length})`);
  assert.ok(!page.env.queries.some(([el, sel]) => el === panel && sel === "*"), "no full subtree query");
});

test("added nodes are still scanned with their whole subtree", () => {
  const page = createPage();
  page.ctx.enableDarkMode({});
  page.flushScans();
  const box = new MockElement("div", page.env);
  box.computed = { ...WHITE };
  page.addDivs(box, 300, WHITE);
  page.doc.body.appendChild(box);
  page.mutate([{ type: "childList", target: page.doc.body, addedNodes: [box] }]);
  page.flushScans();
  assert.ok([box, ...box.children].every((d) => d.getAttribute(SURFACE) === "strong"));
});

test("disable cancels the running scan, idle slices, timers and the observer", () => {
  const page = createPage();
  const divs = page.addDivs(page.doc.body, 3000, WHITE);
  page.ctx.enableDarkMode({});
  page.runFrame(); // first slice; the rest is pending in an idle callback
  (page.winListeners.load || []).forEach((fn) => fn({}));
  page.ctx.scheduleScan(page.doc.body.children[2500]);
  assert.ok(page.idles.length === 1 && page.timers.length >= 3, "work pending");
  const idleId = page.idles[0].id;
  const timerIds = page.timers.map((t) => t.id);

  page.ctx.disableDarkMode();
  assert.ok(page.cancelled.idles.includes(idleId), "idle slice cancelled");
  for (const id of timerIds) assert.ok(page.cancelled.timers.includes(id), `timer ${id} cancelled`);
  assert.strictEqual(page.observers[0].connected, false, "observer disconnected");
  assert.strictEqual(page.idles.length + page.frames.length + page.timers.length, 0, "nothing left");

  page.reads.length = 0;
  page.flushScans();
  assert.strictEqual(page.reads.length, 0);
  assert.ok(divs.every((d) => d.getAttribute(SURFACE) === null), "markers cleared and not re-added");

  // A later enable starts cleanly.
  page.ctx.enableDarkMode({});
  page.flushScans();
  assert.ok(divs.every((d) => d.getAttribute(SURFACE) === "strong"));
});

console.log("\n=========================================");
console.log(`${failed ? "❌" : "🎉"} Scan Cost Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
