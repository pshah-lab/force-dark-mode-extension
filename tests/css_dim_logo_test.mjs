// tests/css_dim_logo_test.mjs
// CSS engine: the per-site image dimming override (storage, service worker, side panel slider, signature,
// in-place update), canvas dimming (Google Docs/Sheets document canvases excluded), and the logo detector that
// samples real pixels (cached, bounded per slice, re-evaluated on load) with tightened name hints as fallback.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

console.log("=========================================");
console.log("🖼️  Running CSS Dim & Logo Detection Tests");
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

// --- harness ------------------------------------------------------------------------------------------------

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

const SIZE = 16;

// One simple selector: tag, #id, .class, [attr] or [attr=value].
function matchesSimple(el, sel) {
  const s = sel.trim();
  if (!s) return false;
  if (s === "*") return true;
  if (s.startsWith("#")) return el.id === s.slice(1);
  if (s.startsWith(".")) return el.classList.contains(s.slice(1));
  const attr = /^\[([a-z-]+)(?:=["']?([^"'\]]*)["']?)?\]$/i.exec(s);
  if (attr) return attr[2] === undefined ? el.hasAttribute(attr[1]) : el.getAttribute(attr[1]) === attr[2];
  return /^[a-z][a-z0-9-]*$/i.test(s) && el.tagName.toLowerCase() === s.toLowerCase();
}

class El {
  constructor(tag, doc, computed = {}) {
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
  getAttributeNames() { return [...this.attributes.keys()]; }
  removeAttribute(n) { this.attributes.delete(n); }
  hasAttribute(n) { return this.attributes.has(n); }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  remove() {
    const list = this.parentElement?.children;
    if (list && list.includes(this)) list.splice(list.indexOf(this), 1);
    this.parentElement = null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 }; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  querySelectorAll(sel) {
    const parts = String(sel).split(",");
    return this.descendants().filter((e) => parts.some((p) => matchesSimple(e, p)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  matches(sel) { return String(sel).split(",").some((p) => matchesSimple(this, p)); }
  closest(sel) {
    for (let node = this; node; node = node.parentElement) if (node.matches(sel)) return node;
    return null;
  }
}

// pixelsFor(img) gives the image's 16x16 RGBA bytes, the string "taint" (getImageData throws a SecurityError,
// as for a cross-origin image), or null (nothing drawn).
function load({ sync = {}, hostname = "example.com", pathname = "/page" } = {}) {
  const ctx = {};
  const frames = [];
  const stats = { getImageData: 0, drawImage: 0, canvases: 0 };
  const doc = {
    readyState: "complete",
    listeners: {},
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
    createElement(tag) {
      const el = new El(tag, doc);
      if (tag === "canvas") {
        stats.canvases++;
        let drawn = null;
        el.getContext = () => ({
          clearRect() { drawn = null; },
          drawImage(img) { stats.drawImage++; drawn = img; },
          getImageData() {
            stats.getImageData++;
            const pixels = drawn ? f.pixelsFor(drawn) : null;
            if (pixels === "taint") {
              const error = new Error("The canvas has been tainted by cross-origin data.");
              error.name = "SecurityError";
              throw error;
            }
            return { data: pixels || new Uint8ClampedArray(SIZE * SIZE * 4) };
          },
        });
      }
      return el;
    },
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
  doc.documentElement = new El("html", doc);
  doc.head = doc.documentElement.appendChild(new El("head", doc));
  doc.body = doc.documentElement.appendChild(new El("body", doc));

  const computedStyle = (el) => ({
    display: "block",
    visibility: "visible",
    opacity: "1",
    color: "rgb(20, 20, 20)",
    backgroundImage: "none",
    backgroundColor: el === doc.documentElement || el === doc.body ? "rgb(255, 255, 255)" : "rgba(0, 0, 0, 0)",
    colorScheme: "",
    ...el.computed,
  });
  const area = (data) => ({ get: (keys, cb) => cb(data), set: (obj, cb) => cb && cb() });
  Object.assign(ctx, {
    console,
    document: doc,
    location: { hostname, pathname, href: `https://${hostname}${pathname}` },
    innerWidth: 1024,
    innerHeight: 768,
    getComputedStyle: computedStyle,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    requestIdleCallback: (fn) => { frames.push(fn); return frames.length; },
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
        onMessage: { addListener: () => {} },
        sendMessage() {},
      },
    },
  });
  const local = new Map();
  Object.defineProperty(ctx, "localStorage", {
    get: () => ({ getItem: (k) => local.get(k) ?? null, setItem: (k, v) => local.set(k, v), removeItem: (k) => local.delete(k) }),
  });
  ctx.window = ctx;
  ctx.top = ctx;
  vm.createContext(ctx);
  const f = {
    ctx,
    doc,
    stats,
    frames,
    pixels: new Map(),
    pixelsFor: (img) => f.pixels.get(img.currentSrc || img.getAttribute("src")) ?? null,
    evalIn: (code) => vm.runInContext(code, ctx),
  };
  f.add = (parent, tag, attrs = {}, computed = {}) => {
    const el = parent.appendChild(new El(tag, doc, computed));
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  // A loaded <img> with a natural size, as the browser reports once it has decoded.
  f.img = (parent, attrs, { loaded = true, width = 120, height = 40 } = {}) => {
    const img = f.add(parent, "img", attrs);
    img.complete = loaded;
    img.naturalWidth = loaded ? width : 0;
    img.naturalHeight = loaded ? height : 0;
    img.currentSrc = loaded ? attrs.src || "" : "";
    return img;
  };
  f.boot = () => {
    for (const [rel, code] of SCRIPTS) vm.runInContext(code, ctx, { filename: rel });
    return f;
  };
  // Runs one queued frame / idle callback (one scan slice).
  f.step = () => { const fn = frames.shift(); if (fn) fn(); return Boolean(fn); };
  f.flush = () => { for (let i = 0; i < 500 && f.step(); i++); };
  f.cssStyle = () => doc.getElementById("__force_dark_mode__");
  f.change = (cfg) => ctx.__onChanged({ [hostname]: { newValue: cfg } }, "sync");
  f.fireLoad = (target) => (doc.listeners.load || []).forEach((fn) => fn({ target, type: "load" }));
  return f;
}

// Synthetic 16x16 RGBA images.
function pixels(fn) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * SIZE + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return data;
}
const inGlyph = (x, y) => y >= 5 && y < 11 && x >= 2 && x < 14; // a 12x6 "wordmark" band: 28% of the box
const DARK_LOGO = pixels((x, y) => (inGlyph(x, y) ? [20, 20, 24, 255] : [0, 0, 0, 0]));
const GREY_LOGO = pixels((x, y) => (inGlyph(x, y) ? [70, 72, 75, (x + y) % 3 ? 255 : 140] : [0, 0, 0, 0]));
const COLOURFUL_LOGO = pixels((x, y) => (inGlyph(x, y) ? (x % 2 ? [230, 40, 40, 255] : [30, 120, 230, 255]) : [0, 0, 0, 0]));
const DARK_NAVY_LOGO = pixels((x, y) => (inGlyph(x, y) ? [16, 32, 96, 255] : [0, 0, 0, 0]));
const PHOTO = pixels((x, y) => [80 + x * 9, 60 + y * 7, 120 + ((x * y) % 90), 255]);
const DARK_PHOTO = pixels((x, y) => [10 + x, 12 + y, 14, 255]); // dark but fully opaque (a night photo)
const WHITE_LOGO = pixels((x, y) => (inGlyph(x, y) ? [250, 250, 250, 255] : [0, 0, 0, 0]));
const EMPTY = pixels(() => [0, 0, 0, 0]);

const CSS_ON = { "example.com": { enabled: true, engine: "css" } };
const inverted = (el) => el.getAttribute("data-force-dark-image") === "invert";

// --- 1. the pixel verdict ----------------------------------------------------------------------------------

test("verdict: dark (and dark grey, anti-aliased) opaque-on-transparent pixels are a logo to invert", () => {
  const f = load().boot();
  const verdict = f.ctx.logoVerdictFromPixels;
  assert.strictEqual(typeof verdict, "function");
  assert.strictEqual(verdict(DARK_LOGO), "invert");
  assert.strictEqual(verdict(GREY_LOGO), "invert");
});

test("verdict: colourful, light, photo-like opaque and empty images are not inverted", () => {
  const verdict = load().boot().ctx.logoVerdictFromPixels;
  assert.strictEqual(verdict(COLOURFUL_LOGO), "keep", "colourful logo keeps its colours");
  assert.strictEqual(verdict(DARK_NAVY_LOGO), "keep", "a saturated dark brand colour is colourful");
  assert.strictEqual(verdict(PHOTO), "keep", "photo");
  assert.strictEqual(verdict(DARK_PHOTO), "keep", "a dark but opaque photo is not a logo on transparency");
  assert.strictEqual(verdict(WHITE_LOGO), "keep", "already light");
  assert.strictEqual(verdict(EMPTY), "keep", "nothing visible");
  assert.strictEqual(verdict(null), null, "no data: undecided");
  assert.strictEqual(verdict(new Uint8ClampedArray(8)), null, "short data: undecided");
});

// --- 2. the scan: sampled images, fallback hints ------------------------------------------------------------

function scan(build, opts = {}) {
  const f = load({ sync: CSS_ON, ...opts });
  const els = build(f);
  f.boot();
  f.flush();
  return { f, els };
}

test("a loaded logo-named image is inverted only when its pixels are dark on transparent", () => {
  const { els } = scan((f) => {
    f.pixels.set("/a/logo-dark.png", DARK_LOGO);
    f.pixels.set("/a/logo-colour.png", COLOURFUL_LOGO);
    f.pixels.set("/a/brand-hero.png", PHOTO);
    return [
      f.img(f.doc.body, { src: "/a/logo-dark.png" }),
      f.img(f.doc.body, { src: "/a/logo-colour.png" }),
      f.img(f.doc.body, { src: "/a/brand-hero.png", alt: "Sponsor logo" }),
    ];
  });
  assert.strictEqual(inverted(els[0]), true, "dark logo inverted");
  assert.strictEqual(inverted(els[1]), false, "colourful logo kept");
  assert.strictEqual(inverted(els[2]), false, "photo-like sponsor image kept despite its logo alt");
});

test("sampling (not the name) decides: a dark wordmark without 'logo' in its name but with a hint like .svg", () => {
  const { els } = scan((f) => {
    f.pixels.set("/static/wordmark.svg", DARK_LOGO);
    f.pixels.set("/static/illustration.svg", COLOURFUL_LOGO);
    return [f.img(f.doc.body, { src: "/static/wordmark.svg" }), f.img(f.doc.body, { src: "/static/illustration.svg" })];
  });
  assert.strictEqual(inverted(els[0]), true, "dark svg wordmark inverted from its pixels");
  assert.strictEqual(inverted(els[1]), false, "colourful svg illustration kept");
});

test("tainted (cross-origin) images fall back to the tightened name hints", () => {
  const { els } = scan((f) => {
    const cdn = (name) => { f.pixels.set(name, "taint"); return name; };
    const header = f.add(f.doc.body, "header");
    return {
      logoClass: f.img(f.doc.body, { src: cdn("/c/a.png"), class: "site-logo" }),
      logoSrc: f.img(f.doc.body, { src: cdn("/c/company-logo.png") }),
      aria: f.img(f.doc.body, { src: cdn("/c/b.png"), "aria-label": "Company Logo" }),
      dataAttr: f.img(f.doc.body, { src: cdn("/c/c.png"), "data-component": "header-logo" }),
      wikipedia: f.img(f.doc.body, { src: cdn("/c/w.png"), alt: "Wikipedia" }),
      headerSvg: f.img(header, { src: cdn("/c/mark.svg") }),
      textAlt: f.img(f.doc.body, { src: cdn("/c/text-editor.png"), alt: "text editor screenshot" }),
      textClass: f.img(f.doc.body, { src: cdn("/c/d.png"), class: "text-block-image" }),
      brand: f.img(f.doc.body, { src: cdn("/c/brand-campaign.jpg") }),
      looseSvg: f.img(f.doc.body, { src: cdn("/c/illustration.svg") }),
      logout: f.img(f.doc.body, { src: cdn("/c/logout.png") }),
    };
  });
  for (const key of ["logoClass", "logoSrc", "aria", "dataAttr", "wikipedia", "headerSvg"]) {
    assert.strictEqual(inverted(els[key]), true, `${key}: a logo hint still inverts`);
  }
  for (const key of ["textAlt", "textClass", "brand", "looseSvg", "logout"]) {
    assert.strictEqual(inverted(els[key]), false, `${key}: no longer matched by a broad name hint`);
  }
});

test("a fallback logo hint still needs a dark graphic (light text colour context keeps it)", () => {
  const { els } = scan((f) => [f.img(f.doc.body, { src: "/x/logo.png" }, { loaded: false })]);
  assert.strictEqual(inverted(els[0]), true, "unloaded logo with dark text colour: inverted as before");
  const { els: light } = scan((f) => {
    const img = f.img(f.doc.body, { src: "/x/logo.png" }, { loaded: false });
    img.computed = { color: "rgb(240, 240, 240)", fill: "rgb(240, 240, 240)" };
    return [img];
  });
  assert.strictEqual(inverted(light[0]), false);
});

test("images too large to sample use the fallback and are never drawn", () => {
  const { f, els } = scan((f) => {
    f.pixels.set("/big/logo.png", COLOURFUL_LOGO);
    return [f.img(f.doc.body, { src: "/big/logo.png" }, { width: 4000, height: 3000 })];
  });
  assert.strictEqual(f.stats.drawImage, 0, "no draw for a huge image");
  assert.strictEqual(inverted(els[0]), true, "fallback: logo hint with a dark context");
});

test("images without any hint are never sampled", () => {
  const { f } = scan((f) => {
    for (let i = 0; i < 10; i++) f.img(f.doc.body, { src: `/photos/p${i}.jpg`, alt: "holiday" });
    return [];
  });
  assert.strictEqual(f.stats.getImageData, 0);
});

test("inline <svg> shape classification is unchanged (never sampled)", () => {
  const { f, els } = scan((f) => {
    const svg = f.add(f.doc.body, "svg", { class: "brand-logo" }, { fill: "rgb(10, 10, 10)", color: "rgb(10, 10, 10)" });
    return [svg];
  });
  assert.strictEqual(inverted(els[0]), true, "dark inline svg logo still inverted");
  assert.strictEqual(f.stats.drawImage, 0, "inline svg is not drawn to a canvas");
});

// --- 3. caching, bounded work, load re-evaluation -----------------------------------------------------------

test("verdicts are cached per element and src; a src change re-samples that image only", () => {
  const f = load({ sync: CSS_ON });
  f.pixels.set("/l/logo-a.png", DARK_LOGO);
  f.pixels.set("/l/logo-b.png", COLOURFUL_LOGO);
  const a = f.img(f.doc.body, { src: "/l/logo-a.png" });
  const b = f.img(f.doc.body, { src: "/l/logo-a.png", class: "logo" });
  f.boot();
  f.flush();
  assert.strictEqual(f.stats.getImageData, 2);
  assert.ok(inverted(a) && inverted(b));
  f.evalIn("scheduleScan(document.documentElement)");
  f.flush();
  assert.strictEqual(f.stats.getImageData, 2, "a full rescan reuses the cached verdicts");
  b.setAttribute("src", "/l/logo-b.png");
  b.currentSrc = "/l/logo-b.png";
  f.evalIn("scheduleScan(document.documentElement)");
  f.flush();
  assert.strictEqual(f.stats.getImageData, 3, "only the changed image is sampled again");
  assert.strictEqual(inverted(b), false, "new colourful src is not inverted");
  assert.strictEqual(inverted(a), true);
  assert.strictEqual(f.stats.canvases, 1, "one reusable sampling canvas");
});

test("at most LOGO_SAMPLES_PER_SLICE images are sampled per scan slice; the rest finish in later slices", () => {
  const f = load({ sync: CSS_ON });
  const imgs = [];
  for (let i = 0; i < 20; i++) {
    f.pixels.set(`/m/logo-${i}.png`, DARK_LOGO);
    imgs.push(f.img(f.doc.body, { src: `/m/logo-${i}.png` }));
  }
  f.boot();
  const limit = f.evalIn("LOGO_SAMPLES_PER_SLICE");
  assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 10, `small per-slice budget (${limit})`);
  f.step();
  assert.ok(f.stats.getImageData <= limit, `first slice sampled ${f.stats.getImageData}`);
  f.flush();
  assert.strictEqual(f.stats.getImageData, 20, "every image sampled exactly once in the end");
  assert.ok(imgs.every(inverted), "all dark logos inverted after the deferred slices");
});

test("an image that loads later is re-evaluated on its load event", () => {
  const f = load({ sync: CSS_ON });
  const img = f.img(f.doc.body, { src: "/n/logo.png" }, { loaded: false });
  f.pixels.set("/n/logo.png", COLOURFUL_LOGO);
  f.boot();
  f.flush();
  assert.strictEqual(inverted(img), true, "before load: fallback hint inverts it");
  assert.strictEqual(f.stats.getImageData, 0, "nothing sampled before load");
  img.complete = true;
  img.naturalWidth = 200;
  img.naturalHeight = 60;
  img.currentSrc = "/n/logo.png";
  f.fireLoad(img);
  f.flush();
  assert.strictEqual(f.stats.getImageData, 1);
  assert.strictEqual(inverted(img), false, "after load: its real colours say keep");
});

test("load events of images never waiting on a verdict schedule no scan", () => {
  const f = load({ sync: CSS_ON });
  const photo = f.img(f.doc.body, { src: "/p/photo.jpg" });
  f.boot();
  f.flush();
  f.fireLoad(photo);
  assert.strictEqual(f.frames.length, 0, "no slice queued");
});

// --- 4. canvas dimming and filter composition --------------------------------------------------------------

function dimRule(css) {
  const blocks = css.split("}").map((b) => b.split("{"));
  const found = blocks.filter(([, body]) => body && body.includes("--force-dark-image-brightness"));
  assert.strictEqual(found.length, 1, "one dimming rule");
  return found[0][0].trim();
}

test("the dimming rule covers img, video and canvas, never picture, and excludes the Docs/Sheets canvases", () => {
  const f = load({ sync: CSS_ON }).boot();
  const selector = dimRule(f.cssStyle().textContent);
  assert.ok(/\bimg\b/.test(selector) && /\bvideo\b/.test(selector) && /\bcanvas\b/.test(selector), selector);
  assert.ok(!/\bpicture\b/.test(selector), "picture stays excluded");
  const themes = f.ctx.ForceDarkThemes;
  for (const sel of [...themes.canvasDocumentSelectors("document"), ...themes.canvasDocumentSelectors("spreadsheet")]) {
    assert.ok(selector.includes(sel), `Docs canvas ${sel} excluded`);
  }
  assert.ok(/canvas:not\(/.test(selector), "the exclusion applies to canvas");
  assert.ok(selector.includes(':not([data-force-dark-image="invert"])'), "inverted elements are excluded so the logo invert wins");
});

test("the Docs canvas rule and the logo invert rule still compose with dimming", () => {
  const f = load({ hostname: "docs.google.com", pathname: "/document/d/x/edit", sync: { "docs.google.com": { enabled: true, engine: "css", themeId: "builtin:dim" } } }).boot();
  const root = f.doc.documentElement;
  assert.strictEqual(root.getAttribute("data-force-dark-image-dim"), "true", "dimming on");
  assert.strictEqual(root.getAttribute("data-force-dark-canvas-doc"), "document", "Docs canvas mode on");
  const css = f.cssStyle().textContent;
  assert.ok(css.includes('[data-force-dark-canvas-doc="document"]') && css.includes("invert(0.92) hue-rotate(180deg)"), "Docs inversion rule present");
  const invertAt = css.indexOf('[data-force-dark-mode="css"] [data-force-dark-image="invert"]');
  assert.ok(invertAt > css.indexOf("--force-dark-image-brightness, 100%"), "logo invert rule after the dimming rule");
});

// --- 5. the per-site override in the content script ---------------------------------------------------------

const brightness = (f) => f.doc.documentElement.style.getPropertyValue("--force-dark-image-brightness");

test("missing imageDim = the theme's value; an override beats it (0 turns dimming off)", () => {
  const theme = load({ sync: { "example.com": { enabled: true, engine: "css", themeId: "builtin:dim" } } }).boot();
  assert.strictEqual(brightness(theme), "85%", "builtin:dim dims by 15");
  const over = load({ sync: { "example.com": { enabled: true, engine: "css", themeId: "builtin:dim", imageDim: 40 } } }).boot();
  assert.strictEqual(brightness(over), "60%");
  const off = load({ sync: { "example.com": { enabled: true, engine: "css", themeId: "builtin:dim", imageDim: 0 } } }).boot();
  assert.strictEqual(off.doc.documentElement.hasAttribute("data-force-dark-image-dim"), false);
  const noTheme = load({ sync: { "example.com": { enabled: true, engine: "css", imageDim: 25 } } }).boot();
  assert.strictEqual(brightness(noTheme), "75%", "works without a theme too");
  const clamp = load({ sync: { "example.com": { enabled: true, engine: "css", imageDim: 95 } } }).boot();
  assert.strictEqual(brightness(clamp), "40%", "clamped to 60");
});

test("Auto resolving to CSS uses the override too", () => {
  const f = load({ sync: { "example.com": { enabled: true, engine: "auto", imageDim: 30 } } });
  for (let i = 0; i < 25; i++) f.add(f.doc.body, "div", {}, { backgroundColor: "rgb(255, 255, 255)" }).textContent = "Row of text";
  f.boot();
  assert.ok(f.cssStyle(), "Auto picked CSS");
  assert.strictEqual(brightness(f), "70%");
});

test("engineSignature changes with imageDim; a dim change updates in place without teardown", () => {
  const cfg = { enabled: true, engine: "css", themeId: "builtin:dim" };
  const f = load({ sync: { "example.com": cfg } }).boot();
  const sig = (dim) => f.evalIn(`engineSignature("css", {}, ${JSON.stringify({ imageDim: dim })}, false)`);
  assert.notStrictEqual(sig(10), sig(20));
  const style = f.cssStyle();
  const img = f.img(f.doc.body, { src: "/q/logo.png" }, { loaded: false });
  f.evalIn("scheduleScan(document.documentElement)");
  f.flush();
  assert.ok(inverted(img));
  f.change({ ...cfg, imageDim: 45 });
  assert.strictEqual(f.cssStyle(), style, "same style element: no teardown");
  assert.strictEqual(brightness(f), "55%");
  assert.ok(inverted(img), "scan markers kept (no teardown)");
  f.change({ ...cfg, imageDim: 45 });
  assert.strictEqual(f.cssStyle(), style);
  f.change({ ...cfg, imageDim: 0 });
  assert.strictEqual(f.doc.documentElement.hasAttribute("data-force-dark-image-dim"), false, "0 turns it off in place");
  assert.strictEqual(f.cssStyle(), style);
  f.change({ ...cfg, imageDim: 0, brightness: 90 });
  assert.notStrictEqual(f.cssStyle(), null, "other changes still re-apply");
});

test("imageDim never rebuilds the Invert engine", () => {
  const cfg = { enabled: true, engine: "invert" };
  const f = load({ sync: { "example.com": cfg } }).boot();
  const style = f.doc.getElementById("__force_dark_invert__");
  assert.ok(style);
  f.change({ ...cfg, imageDim: 30 });
  assert.strictEqual(f.doc.getElementById("__force_dark_invert__"), style);
});

// --- 6. storage and service worker -------------------------------------------------------------------------

test("constants: imageDimFieldsFor (message wins, stored kept, clamped 0-60, invalid dropped)", async () => {
  const c = await import("../src/shared/constants.js");
  assert.deepStrictEqual(c.IMAGE_DIM_RANGE, { min: 0, max: 60 });
  assert.deepStrictEqual(c.imageDimFieldsFor({ imageDim: 30 }, {}), { imageDim: 30 });
  assert.deepStrictEqual(c.imageDimFieldsFor({}, { imageDim: 12 }), { imageDim: 12 });
  assert.deepStrictEqual(c.imageDimFieldsFor({ imageDim: 0 }, { imageDim: 12 }), { imageDim: 0 }, "0 is a real value");
  assert.deepStrictEqual(c.imageDimFieldsFor({ imageDim: 99 }, null), { imageDim: 60 });
  assert.deepStrictEqual(c.imageDimFieldsFor({ imageDim: -5 }, null), { imageDim: 0 });
  assert.deepStrictEqual(c.imageDimFieldsFor({ imageDim: "22.4" }, null), { imageDim: 22 });
  assert.deepStrictEqual(c.imageDimFieldsFor({ imageDim: "abc" }, undefined), {}, "invalid: field stays missing");
  assert.deepStrictEqual(c.imageDimFieldsFor({ imageDim: null }, {}), {});
  assert.deepStrictEqual(c.imageDimFieldsFor({ imageDim: true }, {}), {}, "booleans are not numbers here");
  assert.deepStrictEqual(c.imageDimFieldsFor({}, {}), {}, "old shape unchanged (missing = theme)");
});

test("setSiteConfig and import keep a valid imageDim; old shapes unchanged", async () => {
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
  await storage.setSiteConfig("a.com", { enabled: true, engine: "css", imageDim: 35 });
  assert.strictEqual(data["a.com"].imageDim, 35);
  await storage.setSiteConfig("b.com", { enabled: true, imageDim: "x" });
  assert.ok(!("imageDim" in data["b.com"]));
  await storage.setSiteConfig("c.com", { enabled: true });
  assert.ok(!("imageDim" in data["c.com"]));
  await storage.importSettingsJson(JSON.stringify({ settings: { "d.com": { enabled: true, imageDim: 80 } } }));
  assert.strictEqual(data["d.com"].imageDim, 60);
});

test("service worker keeps imageDim across every TOGGLE", () => {
  const sw = read("src/background/serviceWorker.js");
  assert.ok(/imageDimFieldsFor\(msg, currentConfig\)/.test(sw));
});

// --- 7. the side panel slider ------------------------------------------------------------------------------

function loadPopupScript() {
  const ctx = { document: { addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(read("src/popup/popup.js"), ctx, { filename: "popup.js" });
  return ctx;
}

test("slider visibility: CSS engine, or Auto resolving to CSS (including a forced natively dark page)", () => {
  const { cssEngineActive } = loadPopupScript();
  assert.strictEqual(typeof cssEngineActive, "function");
  assert.strictEqual(cssEngineActive("css", null, undefined), true);
  assert.strictEqual(cssEngineActive("invert", { engine: "css", nativeDark: false }, undefined), false);
  assert.strictEqual(cssEngineActive("auto", null, undefined), false, "no analysis yet");
  assert.strictEqual(cssEngineActive("auto", { engine: "css", nativeDark: false }, undefined), true);
  assert.strictEqual(cssEngineActive("auto", { engine: "invert", nativeDark: false }, undefined), false);
  assert.strictEqual(cssEngineActive("auto", { engine: "css", nativeDark: true }, undefined), false, "respected dark page: nothing applied");
  assert.strictEqual(cssEngineActive("auto", { engine: "invert", nativeDark: true }, "force"), true, "forced dark page: Auto uses CSS");
});

test("slider value: the site override, else the theme's value, clamped 0-60", () => {
  const { imageDimValue } = loadPopupScript();
  assert.strictEqual(imageDimValue(undefined, 15), 15);
  assert.strictEqual(imageDimValue(40, 15), 40);
  assert.strictEqual(imageDimValue(0, 15), 0);
  assert.strictEqual(imageDimValue(undefined, undefined), 0);
  assert.strictEqual(imageDimValue(99, 0), 60);
  assert.strictEqual(imageDimValue("bad", 10), 10);
});

test("panel markup: a hidden, labelled range input 0-60 showing its value", () => {
  const html = read("src/popup/popup.html");
  const block = (html.match(/<div[^>]*id="image-dim-control"[\s\S]*?<\/div>/) || [])[0];
  assert.ok(block, "div#image-dim-control exists");
  assert.ok(/\bhidden\b/.test(block.split(">")[0]), "hidden until the CSS engine is active");
  assert.ok(/<label[^>]*for="image-dim"[^>]*>\s*Image dimming\s*<\/label>/.test(block), "labelled");
  const input = (block.match(/<input[^>]*id="image-dim"[^>]*>/) || [])[0];
  assert.ok(input && /type="range"/.test(input) && /min="0"/.test(input) && /max="60"/.test(input), input);
  assert.ok(/<output[^>]*id="image-dim-value"[^>]*for="image-dim"/.test(block), "shows the value");
  const css = read("src/popup/popup.css");
  assert.ok(/\.dim-control\[hidden\]\s*\{\s*display:\s*none/.test(css), "hidden really hides it");
});

test("panel wiring: the slider writes imageDim through TOGGLE; visibility follows engine and analysis", () => {
  const js = read("src/popup/popup.js");
  const start = js.indexOf("imageDimInput.oninput");
  assert.ok(start > -1, "the slider has a handler");
  const handler = js.slice(start, js.indexOf("\n  };\n", start));
  assert.ok(/type: "TOGGLE"/.test(handler) && /imageDim: /.test(handler) && /forceEnabled/.test(handler), handler);
  assert.ok(/function updateImageDimVisibility/.test(js));
  const vis = js.slice(js.indexOf("function updateImageDimVisibility"), js.indexOf("}\n", js.indexOf("function updateImageDimVisibility")));
  assert.ok(/cssEngineActive\(/.test(vis), "uses cssEngineActive");
  const media = js.slice(js.indexOf("function updateMediaVisibility"), js.indexOf("function updateNativeDarkNotice"));
  assert.ok(/updateImageDimVisibility\(\)/.test(media), "refreshed wherever the media control is (engine change, analysis)");
  const changed = js.slice(js.indexOf("chrome.storage.onChanged.addListener"), js.indexOf("function updateUI"));
  assert.ok(/config\.imageDim/.test(changed), "refreshed when the site config changes");
});

for (const run of pending) await run();

console.log("\n=========================================");
console.log(`${failed ? "❌" : "🎉"} CSS Dim & Logo Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");
if (failed > 0) process.exit(1);
