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
global.chrome = {
  storage: {
    sync: {
      get: (keys, cb) => cb({}),
      set: (obj, cb) => cb && cb(),
    },
    onChanged: {
      addListener: () => {},
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

console.log("\n=========================================");
console.log(`🎉 DOM Engine Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
