// tests/dom_engine_test.mjs
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("=========================================");
console.log("🌐 Running DOM Simulation & Engine Tests");
console.log("=========================================\n");

// Create minimal DOM mock environment
class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.textContent = "";
    this.nodeType = 1; // Node.ELEMENT_NODE
    const styleProps = new Map();
    this.style = {
      setProperty(k, v) { styleProps.set(k, v); },
      removeProperty(k) { styleProps.delete(k); },
      getPropertyValue(k) { return styleProps.get(k) || ""; },
      display: "block",
      visibility: "visible",
      opacity: "1",
      backgroundColor: "rgb(255, 255, 255)",
      color: "rgb(0, 0, 0)",
      fill: "rgb(0, 0, 0)",
      borderTopColor: "rgb(200, 200, 200)",
      borderRightColor: "rgb(200, 200, 200)",
      borderBottomColor: "rgb(200, 200, 200)",
      borderLeftColor: "rgb(200, 200, 200)",
      outlineColor: "rgb(200, 200, 200)",
      backgroundImage: "none",
      colorScheme: "",
    };
    this.classList = {
      _classes: new Set(),
      add: (...c) => c.forEach(cls => this.classList._classes.add(cls)),
      remove: (...c) => c.forEach(cls => this.classList._classes.delete(cls)),
      contains: (cls) => this.classList._classes.has(cls),
    };
    this._styleProps = styleProps;
    this.id = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) this.parentElement.children.splice(idx, 1);
    }
  }

  getBoundingClientRect() {
    return {
      left: 0,
      right: 100,
      top: 0,
      bottom: 50,
      width: 100,
      height: 50,
    };
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (selector === "*" || child.tagName.toLowerCase() === selector.toLowerCase() ||
            selector.split(",").some(s => s.trim().toLowerCase() === child.tagName.toLowerCase()) ||
            (selector.includes("[") && selector.split(",").some(s => {
              const attrName = s.replace(/[[\]]/g, "").trim();
              return child.hasAttribute(attrName);
            }))) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  matches(selector) {
    if (selector.split(",").some(s => s.trim().toLowerCase() === this.tagName.toLowerCase())) {
      return true;
    }
    return false;
  }

  closest() {
    return null;
  }
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement("html");
    this.head = new MockElement("head");
    this.body = new MockElement("body");
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  addEventListener(type, fn) {
    (this._listeners ||= {})[type] = (this._listeners[type] || []).concat(fn);
  }

  removeEventListener(type, fn) {
    if (this._listeners?.[type]) this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    const find = (el) => {
      if (el.id === id) return el;
      for (const child of el.children) {
        const res = find(child);
        if (res) return res;
      }
      return null;
    };
    return find(this.documentElement);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  createTreeWalker(root, whatToShow, filter) {
    const nodes = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (filter.acceptNode(child) === 1) { // NodeFilter.FILTER_ACCEPT
          nodes.push(child);
        }
        walk(child);
      }
    };
    walk(root);
    let index = 0;
    return {
      nextNode() {
        if (index < nodes.length) {
          return nodes[index++];
        }
        return null;
      },
    };
  }
}

const mockDoc = new MockDocument();

global.window = {
  innerWidth: 1024,
  innerHeight: 768,
  getComputedStyle: (el) => el.style,
  location: { hostname: "example.com" },
  addEventListener(type, fn) {
    (this._listeners ||= {})[type] = (this._listeners[type] || []).concat(fn);
  },
  removeEventListener(type, fn) {
    if (this._listeners?.[type]) this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
  },
  matchMedia: () => ({ matches: false }),
};
global.getComputedStyle = global.window.getComputedStyle;
global.document = mockDoc;
global.location = global.window.location;
global.Node = { ELEMENT_NODE: 1, SHOW_ELEMENT: 1 };
global.NodeFilter = { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ELEMENT: 1 };
global.Element = MockElement;
global.requestAnimationFrame = (fn) => { fn(); return 1; };
global.cancelAnimationFrame = () => {};
global.MutationObserver = class {
  observe() {}
  disconnect() {}
};
global.__syncGetKeys = [];
global.__onChangedListeners = [];
global.chrome = {
  storage: {
    sync: {
      get: (keys, cb) => { global.__syncGetKeys.push(keys); cb({}); },
      set: (obj, cb) => cb && cb(),
    },
    local: {
      get: (keys, cb) => cb({}),
      set: (obj, cb) => cb && cb(),
    },
    onChanged: {
      addListener: (fn) => { global.__onChangedListeners.push(fn); },
    },
  },
  runtime: {
    onMessage: {
      addListener: () => {},
    },
    sendMessage: () => {},
  },
};

// Load scripts in global context
const colorUtilsCode = fs.readFileSync(path.join(rootDir, "src/shared/colorUtils.js"), "utf8");
const cssEngineCode = fs.readFileSync(path.join(rootDir, "src/content/themeEngine/cssOverrideEngine.js"), "utf8");
const invertEngineCode = fs.readFileSync(path.join(rootDir, "src/content/themeEngine/invertEngine.js"), "utf8");
const contentIndexCode = fs.readFileSync(path.join(rootDir, "src/content/index.js"), "utf8");

vm.runInThisContext(colorUtilsCode);
global.window.ForceDarkColorUtils = global.ForceDarkColorUtils;

// Same order as manifest.json: colorUtils, themeCore, builtinThemes, engines, index.
vm.runInThisContext(fs.readFileSync(path.join(rootDir, "src/shared/themeCore.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(rootDir, "src/shared/builtinThemes.js"), "utf8"));
global.window.ForceDarkThemes = global.ForceDarkThemes;

vm.runInThisContext(cssEngineCode);
vm.runInThisContext(invertEngineCode);
vm.runInThisContext(contentIndexCode);

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

// Tests
test("CSS Override Engine applies dark mode and root attributes", () => {
  const card = mockDoc.createElement("div");
  card.style.backgroundColor = "rgb(255, 255, 255)";
  card.style.color = "rgb(20, 20, 20)";
  mockDoc.body.appendChild(card);

  const logo = mockDoc.createElement("svg");
  logo.setAttribute("class", "brand-logo");
  logo.style.fill = "rgb(10, 10, 10)";
  card.appendChild(logo);

  enableDarkMode({ backgroundColor: "#0f1115" });

  assert.strictEqual(mockDoc.documentElement.getAttribute("data-force-dark-mode"), "css");
  assert.ok(mockDoc.getElementById("__force_dark_mode__"), "Dark mode style tag should be injected");
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-bg"), "#0f1115");
  assert.strictEqual(card.getAttribute("data-force-dark-surface"), "strong");
  assert.strictEqual(card.getAttribute("data-force-dark-text"), "true");
  assert.strictEqual(logo.getAttribute("data-force-dark-image"), "invert");

  disableDarkMode();

  assert.strictEqual(mockDoc.documentElement.getAttribute("data-force-dark-mode"), null);
  assert.strictEqual(mockDoc.getElementById("__force_dark_mode__"), null);
  assert.strictEqual(card.getAttribute("data-force-dark-surface"), null);
  assert.strictEqual(logo.getAttribute("data-force-dark-image"), null);
});

test("CSS Override Engine rescans the whole page when a stylesheet loads after the first scan", () => {
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => { fn(); return 1; };
  try {
    const container = mockDoc.createElement("div");
    container.style.backgroundColor = "rgba(0, 0, 0, 0)"; // transparent until the site's CSS arrives
    mockDoc.body.appendChild(container);

    enableDarkMode({ backgroundColor: "#0f1115" });
    assert.strictEqual(container.getAttribute("data-force-dark-surface"), null);

    // The mock rAF runs synchronously, which leaves scanFrame stuck; real rAF is always async.
    vm.runInThisContext("scanFrame = 0");

    // The site's stylesheet finishes loading and turns the container white.
    container.style.backgroundColor = "rgb(255, 255, 255)";
    const link = mockDoc.createElement("link");
    link.setAttribute("rel", "stylesheet");
    for (const fn of mockDoc._listeners?.load || []) fn({ target: link });

    assert.strictEqual(container.getAttribute("data-force-dark-surface"), "strong");

    // Unrelated load events (images) and our own style tag must not trigger rescans.
    container.style.backgroundColor = "rgb(255, 255, 255)";
    container.removeAttribute("data-force-dark-surface");
    vm.runInThisContext("scanFrame = 0");
    const img = mockDoc.createElement("img");
    for (const fn of mockDoc._listeners?.load || []) fn({ target: img });
    assert.strictEqual(container.getAttribute("data-force-dark-surface"), null);

    disableDarkMode();
    assert.strictEqual((mockDoc._listeners?.load || []).length, 0, "load listener must be removed on disable");
  } finally {
    global.setTimeout = realSetTimeout;
    mockDoc.body.children = [];
  }
});

test("CSS Override Engine does bounded rescans after load to catch CSS-in-JS rules injected late", () => {
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  const queue = [];
  const cleared = new Set();
  global.setTimeout = (fn, delay) => { queue.push({ fn, delay, id: queue.length + 1 }); return queue.length; };
  global.clearTimeout = (id) => cleared.add(id);
  try {
    const headline = mockDoc.createElement("h2");
    headline.style.color = "rgb(232, 234, 237)"; // inherited light text at first scan
    headline.style.backgroundColor = "rgba(0, 0, 0, 0)";
    mockDoc.body.appendChild(headline);

    enableDarkMode({ backgroundColor: "#0f1115" });
    vm.runInThisContext("scanFrame = 0");
    assert.strictEqual(headline.getAttribute("data-force-dark-text"), null);

    // A CSS-in-JS rule (insertRule: no DOM mutation) later makes the headline dark.
    headline.style.color = "rgb(32, 34, 36)";
    for (const fn of global.window._listeners?.load || []) fn({});

    const delays = queue.map((t) => t.delay).sort((a, b) => a - b);
    for (const expected of [800, 2500, 6000]) {
      assert.ok(delays.includes(expected), `expected a rescan scheduled at ${expected}ms, got ${delays}`);
    }

    for (const t of [...queue].sort((a, b) => a.delay - b.delay)) {
      if (!cleared.has(t.id)) { vm.runInThisContext("scanFrame = 0"); t.fn(); }
    }
    assert.strictEqual(headline.getAttribute("data-force-dark-text"), "true", "late dark text must be recoloured");

    // Disabling must cancel anything still pending.
    queue.length = 0; cleared.clear();
    for (const fn of global.window._listeners?.load || []) fn({});
    const pending = queue.map((t) => t.id);
    disableDarkMode();
    for (const id of pending) assert.ok(cleared.has(id), "pending rescans must be cancelled on disable");
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
    mockDoc.body.children = [];
  }
});

test("CSS Override Engine rescans are idempotent: an element already darkened by the engine keeps its markers", () => {
  const card = mockDoc.createElement("div");
  card.style.backgroundColor = "rgb(255, 255, 255)";
  card.style.color = "rgb(20, 20, 20)";
  card.style.borderTopColor = card.style.borderRightColor = card.style.borderBottomColor = card.style.borderLeftColor = "rgb(230, 230, 230)";
  mockDoc.body.appendChild(card);

  enableDarkMode({ backgroundColor: "#0f1115" });
  assert.strictEqual(card.getAttribute("data-force-dark-surface"), "strong");
  assert.strictEqual(card.getAttribute("data-force-dark-text"), "true");
  assert.strictEqual(card.getAttribute("data-force-dark-border"), "true");

  // In a real browser the computed colours now reflect the engine's own override.
  card.style.backgroundColor = "rgb(34, 36, 40)";
  card.style.color = "rgb(232, 234, 237)";
  card.style.borderTopColor = card.style.borderRightColor = card.style.borderBottomColor = card.style.borderLeftColor = "rgb(52, 59, 70)";

  for (let i = 0; i < 3; i++) {
    vm.runInThisContext("scanFrame = 0");
    scheduleScan(mockDoc.documentElement);
  }

  assert.strictEqual(card.getAttribute("data-force-dark-surface"), "strong", "surface marker must survive rescans");
  assert.strictEqual(card.getAttribute("data-force-dark-text"), "true", "text marker must survive rescans");
  assert.strictEqual(card.getAttribute("data-force-dark-border"), "true", "border marker must survive rescans");

  disableDarkMode();
  assert.strictEqual(card.getAttribute("data-force-dark-surface"), null, "disable still clears markers");
  mockDoc.body.children = [];
});

test("CSS Override Engine drops the logo invert marker when the site later makes the logo light", () => {
  const logo = mockDoc.createElement("svg");
  logo.setAttribute("class", "brand-logo");
  logo.style.fill = "rgb(10, 10, 10)";
  logo.style.color = "rgb(10, 10, 10)";
  mockDoc.body.appendChild(logo);

  enableDarkMode({ backgroundColor: "#0f1115" });
  assert.strictEqual(logo.getAttribute("data-force-dark-image"), "invert");

  // The site's CSS arrives and paints the logo white for its own dark header.
  logo.style.fill = "rgb(255, 255, 255)";
  logo.style.color = "rgb(255, 255, 255)";
  vm.runInThisContext("scanFrame = 0");
  scheduleScan(mockDoc.documentElement);

  assert.strictEqual(logo.getAttribute("data-force-dark-image"), null, "an already light logo must not stay inverted");
  disableDarkMode();
  mockDoc.body.children = [];
});

test("Invert Engine enables and disables cleanly", () => {
  enableInvert();
  assert.ok(mockDoc.getElementById("__force_dark_invert__"), "Invert style tag should be injected");

  disableInvert();
  assert.strictEqual(mockDoc.getElementById("__force_dark_invert__"), null);
});

test("Page analysis correctly recommends CSS engine for text-heavy content", () => {
  mockDoc.body.children = [];
  mockDoc.documentElement.style.backgroundColor = "rgb(255, 255, 255)";
  mockDoc.documentElement.removeAttribute("dark");
  mockDoc.documentElement.style.colorScheme = "light";

  for (let i = 0; i < 25; i++) {
    const p = mockDoc.createElement("p");
    p.textContent = `This is a long meaningful paragraph with plenty of informative text content number ${i}.`;
    p.style.backgroundColor = "rgb(255, 255, 255)";
    p.style.color = "rgb(10, 10, 10)";
    mockDoc.body.appendChild(p);
  }

  const analysis = analyzePageForEngine();
  assert.strictEqual(analysis.nativeDark, false);
  assert.strictEqual(analysis.engine, "css");
});

test("Page analysis correctly detects YouTube native dark mode with heavy media thumbnails", () => {
  mockDoc.body.children = [];
  mockDoc.documentElement.setAttribute("dark", "true");
  mockDoc.documentElement.style.backgroundColor = "rgb(15, 15, 15)";
  mockDoc.documentElement.style.color = "rgb(241, 241, 241)";
  mockDoc.documentElement.style.colorScheme = "dark";

  const app = mockDoc.createElement("ytd-app");
  app.style.backgroundColor = "rgb(15, 15, 15)";
  mockDoc.body.appendChild(app);

  // Add video thumbnails & elements
  for (let i = 0; i < 20; i++) {
    const img = mockDoc.createElement("img");
    img.style.backgroundColor = "transparent";
    app.appendChild(img);

    const title = mockDoc.createElement("span");
    title.textContent = `Video Title Description ${i} with information`;
    title.style.backgroundColor = "rgb(15, 15, 15)";
    title.style.color = "rgb(241, 241, 241)";
    app.appendChild(title);
  }

  const analysis = analyzePageForEngine();
  assert.strictEqual(analysis.nativeDark, true, "YouTube with dark mode should be detected as nativeDark: true");
  assert.strictEqual(analysis.reason, "site already appears dark");
});

function buildSchemePage(colorScheme) {
  mockDoc.body.children = [];
  mockDoc.documentElement.removeAttribute("dark");
  mockDoc.documentElement.style.backgroundColor = "rgba(0, 0, 0, 0)"; // site CSS has not painted yet
  mockDoc.documentElement.style.color = "rgb(0, 0, 0)";
  mockDoc.documentElement.style.colorScheme = colorScheme;
  mockDoc.body.style.backgroundColor = "rgba(0, 0, 0, 0)";
  mockDoc.body.style.colorScheme = colorScheme;
  for (let i = 0; i < 25; i++) {
    const item = mockDoc.createElement("span");
    item.textContent = `Reference article paragraph ${i} with readable content`;
    item.style.backgroundColor = "rgba(0, 0, 0, 0)";
    item.style.color = "rgb(20, 20, 20)";
    mockDoc.body.appendChild(item);
  }
}

test("A page that supports both colour schemes but renders light is not treated as natively dark", () => {
  buildSchemePage("light dark");
  const analysis = analyzePageForEngine();
  assert.strictEqual(analysis.nativeDark, false, "'light dark' only declares support, not a dark render");
});

test("A page that declares only a dark colour scheme is still treated as natively dark", () => {
  buildSchemePage("dark");
  const analysis = analyzePageForEngine();
  assert.strictEqual(analysis.nativeDark, true);
  mockDoc.documentElement.style.colorScheme = "";
  mockDoc.body.style.colorScheme = "";
  mockDoc.body.children = [];
});

function buildNativeDarkPage() {
  mockDoc.body.children = [];
  mockDoc.documentElement.setAttribute("dark", "true");
  mockDoc.documentElement.style.backgroundColor = "rgb(15, 15, 15)";
  mockDoc.documentElement.style.color = "rgb(241, 241, 241)";
  mockDoc.documentElement.style.colorScheme = "dark";
  mockDoc.body.style.colorScheme = "dark";
  const app = mockDoc.createElement("ytd-app");
  app.style.backgroundColor = "rgb(15, 15, 15)";
  mockDoc.body.appendChild(app);
  for (let i = 0; i < 25; i++) {
    const item = mockDoc.createElement("span");
    item.textContent = `Dark page paragraph ${i} with readable content`;
    item.style.backgroundColor = "rgb(15, 15, 15)";
    item.style.color = "rgb(241, 241, 241)";
    app.appendChild(item);
  }
}

test("Invert engine is skipped on a page that is already natively dark (no double inversion)", () => {
  buildNativeDarkPage();
  applyEngine({ enabled: true, engine: "invert", brightness: 100, contrast: 100, sepia: 0 });
  assert.strictEqual(mockDoc.getElementById("__force_dark_invert__"), null, "must not invert an already dark page");
  assert.strictEqual(mockDoc.documentElement.getAttribute("data-force-dark-filter"), null);
  applyEngine(null);
});

test("Invert engine still applies on a light page", () => {
  buildSchemePage("light");
  mockDoc.documentElement.style.backgroundColor = "rgb(255, 255, 255)";
  mockDoc.body.style.backgroundColor = "rgb(255, 255, 255)";
  for (const child of mockDoc.body.children) child.style.backgroundColor = "rgb(255, 255, 255)";
  applyEngine({ enabled: true, engine: "invert", brightness: 100, contrast: 100, sepia: 0 });
  assert.ok(mockDoc.getElementById("__force_dark_invert__"), "light page should still be inverted");
  applyEngine(null);
  mockDoc.body.children = [];
  mockDoc.documentElement.style.colorScheme = "";
  mockDoc.body.style.colorScheme = "";
  mockDoc.documentElement.removeAttribute("dark");
});

test("A light page is not treated as natively dark just because it declares 'light dark' and the OS prefers dark", () => {
  const realMatchMedia = global.window.matchMedia;
  global.window.matchMedia = () => ({ matches: true });
  try {
    buildSchemePage("light dark");
    // The site never implemented a dark theme: html is transparent, body paints white.
    mockDoc.body.style.backgroundColor = "rgb(255, 255, 255)";
    const analysis = analyzePageForEngine();
    assert.strictEqual(analysis.nativeDark, false, "an opaque white page must not be skipped as already dark");
  } finally {
    global.window.matchMedia = realMatchMedia;
    mockDoc.documentElement.style.colorScheme = "";
    mockDoc.body.style.colorScheme = "";
    mockDoc.body.children = [];
  }
});

test("A page that really renders dark under a dark OS is still treated as natively dark", () => {
  const realMatchMedia = global.window.matchMedia;
  global.window.matchMedia = () => ({ matches: true });
  try {
    buildSchemePage("light dark");
    mockDoc.documentElement.style.backgroundColor = "rgb(18, 18, 18)";
    mockDoc.body.style.backgroundColor = "rgb(23, 23, 23)";
    const analysis = analyzePageForEngine();
    assert.strictEqual(analysis.nativeDark, true);
  } finally {
    global.window.matchMedia = realMatchMedia;
    mockDoc.documentElement.style.colorScheme = "";
    mockDoc.documentElement.style.backgroundColor = "rgb(255, 255, 255)";
    mockDoc.body.style.colorScheme = "";
    mockDoc.body.children = [];
  }
});

test("applyEngine applies filter CSS variables and gates the filter attribute", () => {
  applyEngine({ enabled: true, engine: "css", brightness: 120, contrast: 90, sepia: 30 });

  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-brightness"), "120%");
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-contrast"), "90%");
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-sepia"), "30%");
  assert.strictEqual(mockDoc.documentElement.getAttribute("data-force-dark-filter"), "true");

  disableDarkMode();
});

test("applyEngine omits the filter attribute when all values are default", () => {
  applyEngine({ enabled: true, engine: "css", brightness: 100, contrast: 100, sepia: 0 });

  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-brightness"), "100%");
  assert.strictEqual(mockDoc.documentElement.getAttribute("data-force-dark-filter"), null);

  disableDarkMode();
});

test("toMinutesSinceMidnight parses valid HH:MM and rejects invalid input", () => {
  assert.strictEqual(toMinutesSinceMidnight("00:00"), 0);
  assert.strictEqual(toMinutesSinceMidnight("07:30"), 450);
  assert.strictEqual(toMinutesSinceMidnight("23:59"), 1439);
  assert.strictEqual(toMinutesSinceMidnight("24:00"), null);
  assert.strictEqual(toMinutesSinceMidnight("bad"), null);
  assert.strictEqual(toMinutesSinceMidnight(undefined), null);
});

test("isWithinSchedule treats missing/off schedules as always-on", () => {
  assert.strictEqual(isWithinSchedule(null), true);
  assert.strictEqual(isWithinSchedule({ mode: "off" }), true);
});

test("isWithinSchedule 'system' mode follows prefers-color-scheme", () => {
  const original = global.window.matchMedia;

  global.window.matchMedia = () => ({ matches: true });
  assert.strictEqual(isWithinSchedule({ mode: "system" }), true);

  global.window.matchMedia = () => ({ matches: false });
  assert.strictEqual(isWithinSchedule({ mode: "system" }), false);

  global.window.matchMedia = original;
});

test("isWithinTimeWindow handles overnight wraparound windows", () => {
  // A degenerate window (identical start/end) should never block dark mode.
  assert.strictEqual(isWithinTimeWindow("20:00", "20:00"), true);
  // Malformed input should fail open rather than lock users out.
  assert.strictEqual(isWithinTimeWindow("nope", "07:00"), true);
});

test("applyEngine clears filter variables and attribute when disabled", () => {
  applyEngine({ enabled: true, engine: "css", brightness: 120, contrast: 90, sepia: 30 });
  applyEngine({ enabled: false });

  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-brightness"), "");
  assert.strictEqual(mockDoc.documentElement.getAttribute("data-force-dark-filter"), null);
});

const PINNED_PALETTES = {
  "#0f1115": { "--force-dark-bg": "#0f1115", "--force-dark-surface": "#222428", "--force-dark-surface-soft": "#313236", "--force-dark-elevated": "#444548", "--force-dark-text": "#e8eaed", "--force-dark-muted": "#b8bec7", "--force-dark-border": "#3f4144", "--force-dark-link": "#8ab4f8", "--force-dark-input": "#1b1d21", "--force-dark-selection": "#3a4a64" },
  "#ffffff": { "--force-dark-bg": "#ffffff", "--force-dark-surface": "#f0f0f0", "--force-dark-surface-soft": "#e6e6e6", "--force-dark-elevated": "#dbdbdb", "--force-dark-text": "#14171c", "--force-dark-muted": "#4d5663", "--force-dark-border": "#bfbfbf", "--force-dark-link": "#174ea6", "--force-dark-input": "#f5f5f5", "--force-dark-selection": "#aec1e0" },
  "#000000": { "--force-dark-bg": "#000000", "--force-dark-surface": "#141414", "--force-dark-surface-soft": "#242424", "--force-dark-elevated": "#383838", "--force-dark-text": "#e8eaed", "--force-dark-muted": "#b8bec7", "--force-dark-border": "#333333", "--force-dark-link": "#8ab4f8", "--force-dark-input": "#0d0d0d", "--force-dark-selection": "#303f57" },
};

test("engine output for a backgroundColor is pinned to exact values (refactor guard)", () => {
  for (const [bg, expected] of Object.entries(PINNED_PALETTES)) {
    enableDarkMode({ backgroundColor: bg });
    for (const [prop, value] of Object.entries(expected)) {
      assert.strictEqual(mockDoc.documentElement.style.getPropertyValue(prop), value, `${bg} ${prop}`);
    }
    disableDarkMode();
    vm.runInThisContext("scanFrame = 0");
  }
});

test("engine applies a theme palette", () => {
  const T = global.ForceDarkThemes;
  const dracula = T.getBuiltinTheme("builtin:dracula");
  enableDarkMode({ palette: T.paletteFromTheme(dracula) });
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-bg"), "#282a36");
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-link"), "#8be9fd");
  disableDarkMode();
  vm.runInThisContext("scanFrame = 0");
});

test("engine without palette still derives from backgroundColor", () => {
  enableDarkMode({ backgroundColor: "#000000" });
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-bg"), "#000000");
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-text"), "#e8eaed");
  disableDarkMode();
  vm.runInThisContext("scanFrame = 0");
});

test("a config with only backgroundColor yields the derived palette (back-compat)", () => {
  const T = global.ForceDarkThemes;
  assert.strictEqual(T.derivePalette("#000000").bg, "#000000");
  enableDarkMode({ backgroundColor: "#ffffff" });
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-surface"), T.derivePalette("#ffffff").surface);
  disableDarkMode();
  vm.runInThisContext("scanFrame = 0");
});

test("imageDim sets the image brightness variable and 0 clears it", () => {
  const root = mockDoc.documentElement;
  enableDarkMode({ backgroundColor: "#0f1115", imageDim: 25 });
  assert.strictEqual(root.style.getPropertyValue("--force-dark-image-brightness"), "75%");
  vm.runInThisContext("scanFrame = 0");
  enableDarkMode({ backgroundColor: "#0f1115", imageDim: 0 });
  assert.strictEqual(root.style.getPropertyValue("--force-dark-image-brightness"), "");
  vm.runInThisContext("scanFrame = 0");
  enableDarkMode({ backgroundColor: "#0f1115", imageDim: 25 });
  disableDarkMode();
  assert.strictEqual(root.style.getPropertyValue("--force-dark-image-brightness"), "");
  vm.runInThisContext("scanFrame = 0");
  const css = (() => { enableDarkMode({}); const t = mockDoc.getElementById("__force_dark_mode__").textContent; disableDarkMode(); vm.runInThisContext("scanFrame = 0"); return t; })();
  const dimRule = css.split("}").find((block) => block.includes("--force-dark-image-brightness, 100%"));
  assert.ok(dimRule, "brightness rule exists");
  const selector = dimRule.split("{")[0];
  for (const tag of ["img", "picture", "video"]) assert.ok(new RegExp(`\\b${tag}\\b`).test(selector), `${tag} is dimmed`);
  for (const tag of ["svg", "canvas", "iframe", "embed", "object"]) assert.ok(!new RegExp(`\\b${tag}\\b`).test(selector), `${tag} must not be dimmed`);
  assert.ok(css.includes("filter: none !important"), "full media list keeps filter: none");
  assert.ok(css.includes('[data-force-dark-image="invert"]') && css.includes("invert(0.9) hue-rotate(180deg) !important"), "logo invert rule kept");
  assert.ok(css.indexOf("filter: none !important") < css.indexOf("--force-dark-image-brightness, 100%"), "dimming rule comes after the reset");
});

test("engine tolerates bad or partial palettes by deriving per key", () => {
  const root = mockDoc.documentElement;
  const props = ["bg", "surface", "surface-soft", "elevated", "text", "muted", "border", "link", "input", "selection"].map((p) => "--force-dark-" + p);
  const expected = PINNED_PALETTES["#000000"];
  for (const palette of [{}, null, { bg: 5 }, { bg: 5, text: null, link: {} }, "x", []]) {
    enableDarkMode({ backgroundColor: "#000000", palette });
    for (const prop of props) assert.strictEqual(root.style.getPropertyValue(prop), expected[prop], `${JSON.stringify(palette)} ${prop}`);
    disableDarkMode();
    vm.runInThisContext("scanFrame = 0");
  }
  enableDarkMode({ backgroundColor: "#000000", palette: { link: "#ff0000", bg: "#101010" } });
  assert.strictEqual(root.style.getPropertyValue("--force-dark-link"), "#ff0000");
  assert.strictEqual(root.style.getPropertyValue("--force-dark-bg"), "#101010");
  assert.strictEqual(root.style.getPropertyValue("--force-dark-text"), expected["--force-dark-text"]);
  assert.strictEqual(root.style.getPropertyValue("--force-dark-surface"), expected["--force-dark-surface"]);
  disableDarkMode();
  vm.runInThisContext("scanFrame = 0");
});

test("index.js requests __customThemes and re-applies when it changes", () => {
  assert.ok(global.__syncGetKeys.some((k) => Array.isArray(k) && k.includes("example.com") && k.includes("__customThemes")), "sync.get asks for __customThemes");
  const root = mockDoc.documentElement;
  const fire = (changes) => global.__onChangedListeners.forEach((fn) => fn(changes, "sync"));
  currentUserThemes = [];
  currentSiteConfig = { enabled: true, engine: "css", themeId: "user:x" };
  try {
    fire({ __customThemes: { newValue: [{ id: "user:x", name: "X", colors: { background: "#112233" } }] } });
    assert.strictEqual(root.style.getPropertyValue("--force-dark-bg"), "#112233");
    vm.runInThisContext("scanFrame = 0");
    fire({ __customThemes: { newValue: [{ id: "user:x", name: "X", colors: { background: "#334455" } }] } });
    assert.strictEqual(root.style.getPropertyValue("--force-dark-bg"), "#334455");
    vm.runInThisContext("scanFrame = 0");
    fire({ __customThemes: { newValue: "x" } });
    assert.strictEqual(root.style.getPropertyValue("--force-dark-bg"), "#0f1115");
  } finally {
    currentSiteConfig = null;
    applyEngine(null);
    vm.runInThisContext("scanFrame = 0");
  }
});

test("resolveTheme picks user, builtin, default and falls back without throwing", () => {
  const T = global.ForceDarkThemes;
  const user = { id: "user:mine", name: "Mine", colors: { background: "#101820" }, imageDim: 0 };
  const r1 = T.resolveTheme({ config: { themeId: "user:mine" }, host: "a.com", userThemes: [user] });
  assert.strictEqual(r1.source, "user");
  assert.strictEqual(r1.theme.id, "user:mine");
  const r2 = T.resolveTheme({ config: { themeId: "builtin:nord" }, host: "a.com", userThemes: [] });
  assert.strictEqual(r2.source, "builtin");
  assert.strictEqual(r2.theme.id, "builtin:nord");
  const r3 = T.resolveTheme({ config: { themeId: "default" }, host: "a.com", userThemes: [user] });
  assert.deepStrictEqual([r3.theme, r3.source], [null, "default"]);
  const r4 = T.resolveTheme({ config: { themeId: "user:gone" }, host: "a.com", userThemes: [user] });
  assert.deepStrictEqual([r4.theme, r4.source], [null, "default"]);
  const r5 = T.resolveTheme({ config: { themeId: "user:mine" }, host: "a.com", userThemes: "x" });
  assert.deepStrictEqual([r5.theme, r5.source], [null, "default"]);
  const r6 = T.resolveTheme({ config: { backgroundColor: "#000000" }, host: "a.com", userThemes: [user] });
  assert.deepStrictEqual([r6.theme, r6.source, r6.pack], [null, "default", null]);
  const r7 = T.resolveTheme({ config: null, host: "a.com", userThemes: null });
  assert.deepStrictEqual([r7.theme, r7.source], [null, "default"]);
  const r8 = T.resolveTheme({ config: { themeId: "user:mine" }, host: "a.com", userThemes: [null, 5, { id: "user:mine" }] });
  assert.strictEqual(r8.source, "default");
});

test("resolveTheme uses a site pack theme when no theme is chosen", () => {
  const T = global.ForceDarkThemes;
  T.findSitePack = (h) => (h === "p.com" ? { id: "p", themeId: "builtin:dracula" } : null);
  try {
    const a = T.resolveTheme({ config: null, host: "p.com", userThemes: [] });
    assert.strictEqual(a.source, "pack");
    assert.strictEqual(a.theme.id, "builtin:dracula");
    assert.strictEqual(a.pack.id, "p");
    const b = T.resolveTheme({ config: { themeId: "builtin:nord" }, host: "p.com", userThemes: [] });
    assert.strictEqual(b.source, "builtin");
    const c = T.resolveTheme({ config: { themeId: "default" }, host: "p.com", userThemes: [] });
    assert.strictEqual(c.source, "default");
    assert.strictEqual(c.pack.id, "p");
    const d = T.resolveTheme({ config: { themeId: "user:gone" }, host: "p.com", userThemes: [] });
    assert.strictEqual(d.source, "pack");
  } finally {
    delete T.findSitePack;
  }
});

test("applyEngine passes a resolved theme palette and imageDim to the engine", () => {
  const T = global.ForceDarkThemes;
  currentUserThemes = [{ id: "user:mine", name: "Mine", colors: { background: "#101820", link: "#ffcc00" }, imageDim: 20 }];
  applyEngine({ enabled: true, engine: "css", themeId: "user:mine" });
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-bg"), "#101820");
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-link"), "#ffcc00");
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-image-brightness"), "80%");
  // site imageDim overrides the theme's
  vm.runInThisContext("scanFrame = 0");
  applyEngine({ enabled: true, engine: "css", themeId: "user:mine", imageDim: 40 });
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-image-brightness"), "60%");
  // a deleted theme falls back to backgroundColor without throwing
  vm.runInThisContext("scanFrame = 0");
  applyEngine({ enabled: true, engine: "css", themeId: "user:gone", backgroundColor: "#000000" });
  assert.strictEqual(mockDoc.documentElement.style.getPropertyValue("--force-dark-bg"), "#000000");
  currentUserThemes = [];
  applyEngine({ enabled: false });
  vm.runInThisContext("scanFrame = 0");
});

console.log("\n=========================================");
console.log(`🎉 DOM Engine Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
