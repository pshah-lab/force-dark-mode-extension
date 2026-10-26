// tests/pdf_detect_test.mjs
// "Open This PDF in Dark Viewer" (Alt+Shift+V / context menu) also works for PDFs whose address has no ".pdf":
// on the user's command the worker asks the tab's top frame what PDF it shows. The top frame answers from
// document.contentType (Chrome's built-in viewer) or from exactly one embedded PDF (<embed>/<object>/<iframe>).
// Nothing opens on its own, the worker keeps no per-tab state, and no permission is added.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("=========================================");
console.log("📄 Running PDF Detection Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Service worker, loaded as the real module with a mocked chrome API.
// ---------------------------------------------------------------------------------------------------------------
const EXT_BASE = "chrome-extension://testext/";
const sw = {
  listeners: {},
  menus: [],
  created: [],
  asked: [],
  pageReply: undefined, // what the top frame answers to PDF_INFO
  lastError: undefined,
};
const on = (name) => ({ addListener: (fn) => { sw.listeners[name] = fn; } });
globalThis.chrome = {
  runtime: {
    id: "testext",
    getURL: (p) => EXT_BASE + p,
    getManifest: () => ({ version: "2.1.0" }),
    onMessage: on("message"),
    onInstalled: on("installed"),
    get lastError() { return sw.lastError; },
  },
  commands: { onCommand: on("command") },
  contextMenus: { create: (item) => sw.menus.push(item), onClicked: on("menuClicked") },
  tabs: {
    create: (props) => { sw.created.push(props); },
    sendMessage: (tabId, msg, opts, cb) => {
      sw.asked.push({ tabId, msg, opts });
      setTimeout(() => cb(sw.pageReply), 0);
    },
  },
  sidePanel: { setPanelBehavior: () => Promise.resolve() },
  storage: {
    local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    sync: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() },
  },
};
const swModule = await import("../src/background/serviceWorker.js");

function resetSw(reply) {
  sw.created = [];
  sw.asked = [];
  sw.pageReply = reply;
  sw.lastError = undefined;
}
const tick = () => new Promise((r) => setTimeout(r, 5));
async function runCommand(tab) {
  sw.listeners.command("open-current-document-in-viewer", tab);
  await tick();
  await tick();
}
async function clickMenu(info, tab) {
  sw.listeners.menuClicked({ menuItemId: "force-dark-mode-open-current-document", ...info }, tab);
  await tick();
  await tick();
}
function openedViewer() {
  assert.strictEqual(sw.created.length, 1, `expected one viewer tab, got ${sw.created.length}`);
  const raw = sw.created[0].url;
  assert.ok(raw.startsWith(EXT_BASE + "src/viewer/viewer.html?"), raw);
  const url = new URL(raw);
  return { src: url.searchParams.get("src"), name: url.searchParams.get("name") };
}

console.log("Service worker");

await test("isPdfUrl keeps its existing answers", () => {
  const { isPdfUrl } = swModule;
  assert.strictEqual(isPdfUrl("https://a.example/files/report.pdf"), true);
  assert.strictEqual(isPdfUrl("https://a.example/files/REPORT.PDF"), true);
  assert.strictEqual(isPdfUrl("https://a.example/view?file=b.pdf"), true);
  assert.strictEqual(isPdfUrl("file:///Users/me/doc.pdf"), true);
  assert.strictEqual(isPdfUrl("https://a.example/download?id=12"), false);
  assert.strictEqual(isPdfUrl("https://a.example/document/view/123"), false);
  assert.strictEqual(isPdfUrl("https://a.example/page.html#x.pdf"), false);
  assert.strictEqual(isPdfUrl("not a url"), false);
  assert.strictEqual(isPdfUrl(""), false);
});

await test(".pdf URL opens the viewer at once, exactly as before, without asking the page", async () => {
  resetSw(undefined);
  await runCommand({ id: 3, url: "https://a.example/files/report.pdf" });
  assert.deepStrictEqual(openedViewer(), { src: "https://a.example/files/report.pdf", name: "report.pdf" });
  assert.strictEqual(sw.asked.length, 0);

  resetSw(undefined);
  await runCommand({ id: 3, url: "https://a.example/view?file=b.pdf" });
  assert.deepStrictEqual(openedViewer(), { src: "https://a.example/view?file=b.pdf", name: "view" });
  assert.strictEqual(sw.asked.length, 0);
});

await test("a tab the page reports as a PDF (content type) opens with its non-.pdf URL and a sensible name", async () => {
  resetSw({ type: "PDF_INFO", url: "https://a.example/download?id=12", title: "Quarterly report" });
  await runCommand({ id: 7, url: "https://a.example/download?id=12" });
  assert.deepStrictEqual(sw.asked, [{ tabId: 7, msg: { type: "PDF_INFO" }, opts: { frameId: 0 } }]);
  assert.deepStrictEqual(openedViewer(), { src: "https://a.example/download?id=12", name: "Quarterly report" });
});

await test("viewer name: .pdf segment, then page title, then last path segment, then 'PDF document'", async () => {
  const { pdfDocumentName } = swModule;
  assert.strictEqual(pdfDocumentName("https://a.example/x/My%20File.pdf?dl=1", "Ignored title"), "My File.pdf");
  assert.strictEqual(pdfDocumentName("https://a.example/document/view/123", "  Contract  "), "Contract");
  assert.strictEqual(pdfDocumentName("https://a.example/document/view/123", ""), "123");
  assert.strictEqual(pdfDocumentName("https://a.example/", ""), "PDF document");
  assert.strictEqual(pdfDocumentName("https://a.example/%E0%A4%A", ""), "PDF document", "bad escapes do not throw");
  assert.ok(pdfDocumentName("https://a.example/v", "t".repeat(500)).length <= 120, "long titles are capped");
});

await test("an embedded PDF reported by the page opens its own URL", async () => {
  resetSw({ type: "PDF_INFO", url: "https://cdn.example/files/manual", title: "" });
  await runCommand({ id: 9, url: "https://a.example/help/page" });
  assert.deepStrictEqual(openedViewer(), { src: "https://cdn.example/files/manual", name: "manual" });
});

await test("no PDF on the page (or no content script) is a quiet no-op, as for non-PDF URLs before", async () => {
  resetSw(null);
  await runCommand({ id: 4, url: "https://a.example/article" });
  assert.strictEqual(sw.created.length, 0);

  resetSw(undefined);
  sw.lastError = { message: "Could not establish connection. Receiving end does not exist." };
  await runCommand({ id: 4, url: "https://a.example/article" });
  assert.strictEqual(sw.created.length, 0);
});

await test("malformed or unsafe page replies are ignored", async () => {
  const bad = [
    "https://a.example/x.pdf",
    { url: 42 },
    { type: "PDF_INFO" },
    { type: "OTHER", url: "https://a.example/d" },
    { type: "PDF_INFO", url: "javascript:alert(1)" },
    { type: "PDF_INFO", url: "data:application/pdf;base64,AAAA" },
    { type: "PDF_INFO", url: "blob:https://a.example/1234" },
    { type: "PDF_INFO", url: "chrome://settings" },
    { type: "PDF_INFO", url: "not a url" },
    { type: "PDF_INFO", url: "https://a.example/" + "a".repeat(9000) },
  ];
  for (const reply of bad) {
    resetSw(reply);
    await runCommand({ id: 5, url: "https://a.example/download?id=1" });
    assert.strictEqual(sw.created.length, 0, `should ignore ${JSON.stringify(reply).slice(0, 60)}`);
  }
  resetSw({ type: "PDF_INFO", url: "https://a.example/d?id=1", title: { evil: true } });
  await runCommand({ id: 5, url: "https://a.example/d?id=1" });
  assert.strictEqual(openedViewer().name, "d", "a non-string title falls back to the URL");
});

await test("pages the extension cannot run in are not asked", async () => {
  for (const url of ["chrome://extensions/", "about:blank", "chrome-extension://other/page.html"]) {
    resetSw({ type: "PDF_INFO", url: "https://a.example/d" });
    await runCommand({ id: 6, url });
    assert.strictEqual(sw.asked.length, 0, url);
    assert.strictEqual(sw.created.length, 0, url);
  }
  resetSw({ type: "PDF_INFO", url: "https://a.example/d" });
  await runCommand(undefined);
  await runCommand({ url: "https://a.example/d" }); // no tab id
  assert.strictEqual(sw.asked.length, 0);
});

await test("the worker keeps no per-tab PDF state, so a restart loses nothing", async () => {
  const src = fs.readFileSync(path.join(rootDir, "src/background/serviceWorker.js"), "utf8");
  assert.ok(!/tabs\.onUpdated|tabs\.onRemoved|webNavigation/.test(src), "no tab-tracking listeners");
  // A tab never seen before (fresh worker) is resolved by asking the page on the command itself.
  resetSw({ type: "PDF_INFO", url: "https://a.example/view/1", title: "Fresh" });
  await runCommand({ id: 12345, url: "https://a.example/view/1" });
  assert.strictEqual(openedViewer().name, "Fresh");
});

await test("context menu: right-click inside a .pdf frame opens that frame's PDF", async () => {
  resetSw(null);
  await clickMenu({ frameUrl: "https://files.example/a/guide.pdf" }, { id: 2, url: "https://a.example/page" });
  assert.deepStrictEqual(openedViewer(), { src: "https://files.example/a/guide.pdf", name: "guide.pdf" });
  assert.strictEqual(sw.asked.length, 0);
});

await test("context menu on a content-type PDF tab asks the page like the shortcut", async () => {
  resetSw({ type: "PDF_INFO", url: "https://a.example/download?id=12", title: "Invoice" });
  await clickMenu({}, { id: 8, url: "https://a.example/download?id=12" });
  assert.deepStrictEqual(openedViewer(), { src: "https://a.example/download?id=12", name: "Invoice" });
});

await test("the PDF menu item is offered on pages and inside frames", () => {
  sw.menus = [];
  sw.listeners.installed({ reason: "update", previousVersion: "2.0.0" });
  const item = sw.menus.find((m) => m.id === "force-dark-mode-open-current-document");
  assert.ok(item, "menu item exists");
  assert.deepStrictEqual(item.contexts, ["page", "frame"]);
});

await test("the PDF URL is never logged or sent anywhere but the viewer tab", () => {
  const src = fs.readFileSync(path.join(rootDir, "src/background/serviceWorker.js"), "utf8");
  const block = src.slice(src.indexOf("function openCurrentDocumentInViewer"), src.indexOf("function isTogglableUrl"));
  assert.ok(block.length > 0);
  assert.ok(!/console\./.test(block), "no logging in the PDF path");
});

// ---------------------------------------------------------------------------------------------------------------
// Content script (top frame answers PDF_INFO).
// ---------------------------------------------------------------------------------------------------------------
console.log("\nContent script");

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

class El {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map(Object.entries(attrs));
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
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  removeAttribute(n) { this.attrs.delete(n); }
  hasAttribute(n) { return this.attrs.has(n); }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
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

function loadContent({
  child = false,
  contentType = "text/html",
  href = "https://a.example/docs/page",
  baseURI,
  title = "",
  embeds = [],
} = {}) {
  const selectorLog = [];
  const all = () => {
    const out = [];
    const walk = (el) => el.children.forEach((c) => { out.push(c); walk(c); });
    walk(doc.documentElement);
    return out;
  };
  const doc = {
    readyState: "complete",
    contentType,
    title,
    baseURI: baseURI || href,
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    createElement: (tag) => new El(tag),
    getElementById(id) { return all().find((el) => el.id === id) || null; },
    querySelector: () => null,
    querySelectorAll(sel) {
      selectorLog.push(sel);
      const tags = String(sel).split(",").map((s) => s.trim().toUpperCase());
      if (!tags.every((t) => /^[A-Z]+$/.test(t))) return [];
      return all().filter((el) => tags.includes(el.tagName));
    },
    createTreeWalker() { return { nextNode: () => null }; },
  };
  doc.documentElement = new El("html");
  doc.head = doc.documentElement.appendChild(new El("head"));
  doc.body = doc.documentElement.appendChild(new El("body"));
  for (const [tag, attrs] of embeds) doc.body.appendChild(new El(tag, attrs));

  const u = new URL(href);
  const location = { href, hostname: u.hostname, protocol: u.protocol };
  const ctx = {};
  let lsAccesses = 0;
  const sent = [];
  Object.assign(ctx, {
    console, URL, document: doc, location, innerWidth: 800, innerHeight: 600,
    getComputedStyle: () => ({
      display: "block", visibility: "visible", opacity: "1", color: "rgb(20, 20, 20)",
      backgroundImage: "none", colorScheme: "", backgroundColor: "rgb(255, 255, 255)",
    }),
    matchMedia: () => ({ matches: false }),
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    MutationObserver: class { observe() {} disconnect() {} },
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ELEMENT: 1 },
    Element: El,
    chrome: {
      storage: {
        sync: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() },
        local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() },
        onChanged: { addListener() {} },
      },
      runtime: {
        id: "test-extension",
        onMessage: { addListener: (fn) => { ctx.__onMessage = fn; } },
        sendMessage: (msg) => { sent.push(msg); },
      },
    },
  });
  Object.defineProperty(ctx, "localStorage", {
    get() { lsAccesses += 1; return { getItem: () => null, setItem() {}, removeItem() {} }; },
  });
  ctx.window = ctx;
  ctx.top = child ? { location: { hostname: u.hostname } } : ctx;
  vm.createContext(ctx);
  for (const [rel, code] of SCRIPTS) vm.runInContext(code, ctx, { filename: rel });

  const ask = (msg = { type: "PDF_INFO" }, sender = { id: "test-extension" }) => {
    const replies = [];
    ctx.__onMessage(msg, sender, (r) => replies.push(r));
    return replies;
  };
  return { ask, selectorLog, sent, lsAccesses: () => lsAccesses, doc };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

await test("top frame showing a PDF (document.contentType) reports its own URL and title", () => {
  const f = loadContent({ contentType: "application/pdf", href: "https://a.example/download?id=12#page=3", title: "Q3 report" });
  assert.deepStrictEqual(plain(f.ask()), [{ type: "PDF_INFO", url: "https://a.example/download?id=12", title: "Q3 report" }]);
});

await test("a child frame never answers PDF_INFO, even when it shows a PDF", () => {
  const f = loadContent({ child: true, contentType: "application/pdf", href: "https://a.example/download?id=12" });
  assert.deepStrictEqual(f.ask(), []);
});

await test("PDF_INFO from another extension is ignored", () => {
  const f = loadContent({ contentType: "application/pdf" });
  assert.deepStrictEqual(f.ask({ type: "PDF_INFO" }, { id: "evil-extension" }), []);
});

await test("an ordinary page with no PDF answers null", () => {
  const f = loadContent({ embeds: [["iframe", { src: "/widget" }], ["img", { src: "/a.png" }]] });
  assert.deepStrictEqual(f.ask(), [null]);
});

await test("one <embed type=application/pdf> with a relative src resolves against the page", () => {
  const f = loadContent({
    href: "https://a.example/docs/page",
    embeds: [["embed", { type: "application/pdf", src: "../files/get?id=5" }]],
  });
  assert.deepStrictEqual(plain(f.ask()), [{ type: "PDF_INFO", url: "https://a.example/files/get?id=5", title: "" }]);
});

await test("relative URLs honour <base href> (document.baseURI)", () => {
  const f = loadContent({
    href: "https://a.example/docs/page",
    baseURI: "https://static.example/pdfs/",
    embeds: [["embed", { type: "Application/PDF", src: "manual" }]],
  });
  assert.strictEqual(f.ask()[0].url, "https://static.example/pdfs/manual");
});

await test("<object type=application/pdf data=...> and <iframe src=...pdf> are found; fragments dropped", () => {
  let f = loadContent({ embeds: [["object", { type: "application/pdf", data: "/o/doc" }]] });
  assert.strictEqual(f.ask()[0].url, "https://a.example/o/doc");
  f = loadContent({ embeds: [["iframe", { src: "https://cdn.example/x/guide.pdf#toolbar=0" }]] });
  assert.strictEqual(f.ask()[0].url, "https://cdn.example/x/guide.pdf");
});

await test("several different embedded PDFs: ambiguous, so no answer; duplicates of one PDF count once", () => {
  let f = loadContent({
    embeds: [["embed", { type: "application/pdf", src: "/a.pdf" }], ["iframe", { src: "/b.pdf" }]],
  });
  assert.deepStrictEqual(f.ask(), [null]);
  f = loadContent({
    embeds: [["embed", { type: "application/pdf", src: "/a.pdf" }], ["iframe", { src: "/a.pdf#page=2" }]],
  });
  assert.strictEqual(f.ask()[0].url, "https://a.example/a.pdf");
});

await test("embeds with unusable sources (about:blank, blob:, data:, javascript:, empty) are skipped", () => {
  const f = loadContent({
    embeds: [
      ["embed", { type: "application/pdf", src: "about:blank" }],
      ["embed", { type: "application/pdf", src: "blob:https://a.example/1" }],
      ["object", { type: "application/pdf", data: "data:application/pdf;base64,AA" }],
      ["iframe", { src: "javascript:void(0).pdf" }],
      ["embed", { type: "application/pdf" }],
    ],
  });
  assert.deepStrictEqual(f.ask(), [null]);
});

await test("no PDF scan at load: the page is only inspected when the user asks", () => {
  const f = loadContent({ embeds: [["embed", { type: "application/pdf", src: "/a.pdf" }]] });
  assert.ok(!f.selectorLog.some((s) => /embed/i.test(s)), "no embed scan before the command");
  f.ask();
  assert.ok(f.selectorLog.some((s) => /embed/i.test(s)));
  assert.ok(!f.sent.some((m) => m && m.type === "PDF_INFO"), "nothing is pushed to the worker");
});

await test("PDF_INFO answers touch no web storage", () => {
  const f = loadContent({ contentType: "application/pdf" });
  const before = f.lsAccesses();
  f.ask();
  assert.strictEqual(f.lsAccesses(), before);
});

// ---------------------------------------------------------------------------------------------------------------
console.log("\nManifest");

await test("no new permissions, host permissions or content-script changes", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  assert.deepStrictEqual(manifest.permissions, ["storage", "activeTab", "contextMenus", "sidePanel"]);
  assert.strictEqual(manifest.host_permissions, undefined);
  assert.strictEqual(manifest.optional_permissions, undefined);
  assert.strictEqual(manifest.optional_host_permissions, undefined);
  assert.strictEqual(manifest.content_scripts.length, 1);
  const cs = manifest.content_scripts[0];
  assert.deepStrictEqual(cs.matches, ["<all_urls>"]);
  assert.strictEqual(cs.js[cs.js.length - 1], "src/content/index.js");
  assert.strictEqual(cs.js.length, 8);
  assert.strictEqual(cs.run_at, "document_start");
  assert.strictEqual(cs.all_frames, true);
});

console.log("\n=========================================");
console.log(`${failed ? "❌" : "🎉"} PDF Detection Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");
if (failed > 0) process.exit(1);
