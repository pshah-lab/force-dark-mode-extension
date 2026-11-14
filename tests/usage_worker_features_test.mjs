// tests/usage_worker_features_test.mjs
// Shortcut and context-menu toggles are counted by the worker (toggle_on/off + the source key, with the tab's
// surface) only after a saved toggle. Popup/side-panel toggles arrive as TOGGLE messages and are counted by the
// page, never here. Site CSS saved in Options sends one bare USAGE_FEATURE.
import fs from "fs";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const local = {};
const syncStore = {};
let syncFails = false;
let lastError;
const listeners = {};
const on = (n) => ({ addListener: (fn) => { listeners[n] = fn; } });
globalThis.chrome = {
  runtime: {
    id: "testext",
    getURL: (p) => "chrome-extension://testext/" + p,
    getManifest: () => ({ version: "2.1.0" }),
    onMessage: on("message"),
    onInstalled: on("installed"),
    get lastError() { return lastError; },
  },
  commands: { onCommand: on("command") },
  contextMenus: { create() {}, onClicked: on("menuClicked") },
  tabs: { create() {}, sendMessage() {} },
  sidePanel: { setPanelBehavior: () => Promise.resolve() },
  storage: {
    local: {
      get: async (k) => (typeof k === "string" ? (k in local ? { [k]: local[k] } : {}) : {}),
      set: async (o) => { Object.assign(local, JSON.parse(JSON.stringify(o))); },
      remove: async (k) => { delete local[k]; },
    },
    sync: {
      get: (k, cb) => cb(typeof k === "string" && k in syncStore ? { [k]: syncStore[k] } : {}),
      set: (o, cb) => {
        if (syncFails) lastError = { message: "QUOTA" }; else Object.assign(syncStore, o);
        cb && cb();
        lastError = undefined;
      },
    },
  },
};
await import("../src/background/serviceWorker.js");

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const tally = () => local.telemetryState && local.telemetryState.tally;
function optIn() {
  local.telemetryState = { enabled: true, id: UUID, consentVersion: 4, lastAttemptAt: Date.now(), lastSentDay: "9999-01-01" };
  for (const k of Object.keys(syncStore)) delete syncStore[k];
  syncFails = false;
}
const features = () => (tally() ? tally().features : {});
const surfaces = () => (tally() ? tally().surfaces : {});
const DOCS = "https://docs.google.com/document/d/abc/edit";

test("shortcut toggle on then off records toggle_on/toggle_off and shortcut_toggle with the tab's surface", async () => {
  optIn();
  listeners.command("toggle-dark-mode", { id: 1, url: DOCS });
  await settle();
  assert.deepStrictEqual(features(), { toggle_on: 1, shortcut_toggle: 1 });
  assert.deepStrictEqual(surfaces(), { toggle_on__google_docs: 1, shortcut_toggle__google_docs: 1 });
  listeners.command("toggle-dark-mode", { id: 1, url: DOCS });
  await settle();
  assert.deepStrictEqual(features(), { toggle_on: 1, toggle_off: 1, shortcut_toggle: 2 });
  assert.strictEqual(surfaces().toggle_off__google_docs, 1);
});

test("context menu toggle records toggle_on and context_menu_toggle, not shortcut_toggle", async () => {
  optIn();
  listeners.menuClicked({ menuItemId: "force-dark-mode-toggle" }, { id: 2, url: "https://news.example.com/a" });
  await settle();
  assert.deepStrictEqual(features(), { toggle_on: 1, context_menu_toggle: 1 });
  assert.deepStrictEqual(surfaces(), { toggle_on__web_other: 1, context_menu_toggle__web_other: 1 });
});

test("a failed save records nothing", async () => {
  optIn();
  syncFails = true;
  listeners.command("toggle-dark-mode", { id: 3, url: DOCS });
  await settle();
  assert.deepStrictEqual(features(), {});
});

test("an untogglable page records nothing", async () => {
  optIn();
  listeners.command("toggle-dark-mode", { id: 4, url: "chrome://settings" });
  listeners.command("toggle-dark-mode", undefined);
  await settle();
  assert.deepStrictEqual(features(), {});
});

test("nothing is recorded without consent", async () => {
  delete local.telemetryState;
  listeners.command("toggle-dark-mode", { id: 5, url: DOCS });
  await settle();
  assert.strictEqual(local.telemetryState, undefined);
});

test("a popup TOGGLE message is not counted by the worker (the popup counts its own click once)", async () => {
  optIn();
  const reply = listeners.message({ type: "TOGGLE", host: "docs.google.com", forceEnabled: true }, { id: "testext", url: "chrome-extension://testext/src/popup/popup.html" });
  assert.strictEqual(reply, undefined);
  await settle();
  assert.deepStrictEqual(features(), {});
  assert.strictEqual(syncStore["docs.google.com"].enabled, true);
  // the popup's own count: one USAGE_FEATURE toggle_on in total
  const usageReply = listeners.message({ type: "USAGE_FEATURE", key: "toggle_on", surface: "google_docs" }, { id: "testext", url: "chrome-extension://testext/src/popup/popup.html" }, () => {});
  assert.strictEqual(usageReply, true);
  await settle();
  assert.deepStrictEqual(features(), { toggle_on: 1 });
});

test("source: only the two worker entry points pass a source to toggleForTab", () => {
  const sw = fs.readFileSync(path.join(rootDir, "src/background/serviceWorker.js"), "utf8");
  assert.deepStrictEqual([...sw.matchAll(/toggleForTab\(tab(?:, "(\w+)")?\)/g)].map((m) => m[1]), ["shortcut", "menu"]);
  assert.ok(/handleToggleMessage\(msg, sender\.tab\?\.url\);/.test(sw), "popup path stays source-free");
});

test("options: exactly one USAGE_FEATURE send, a key literal only, never awaited, none elsewhere in options", () => {
  const dir = path.join(rootDir, "src/options");
  const hits = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/USAGE_FEATURE/g)) hits.push({ f, at: m.index, src });
  }
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].f, "customCssEditor.js");
  const src = hits[0].src;
  assert.ok(src.includes('{ type: "USAGE_FEATURE", key: "site_css_saved" }'));
  const line = src.split("\n").find((l) => l.includes("USAGE_FEATURE"));
  assert.ok(!/await/.test(line) && !/surface|host|css/i.test(line.replace("site_css_saved", "")));
  assert.strictEqual((src.match(/reportSiteCssSaved\(\)/g) || []).length, 2); // definition + the one call
});

for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
