// tests/panel_tab_events_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// panelTabEvents.js is a classic panel script (package is "type": "module"), so run it in a sandbox.
const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(rootDir, "src/popup/panelTabEvents.js"), "utf8"), sandbox);
const { shouldRefresh } = sandbox.PanelTabEvents;

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n    Error: ${err.message}`);
    failed++;
  }
}

test("switching tabs always refreshes", () => {
  assert.strictEqual(shouldRefresh({ kind: "activated", tabId: 9 }, 3), true);
  assert.strictEqual(shouldRefresh({ kind: "activated" }, undefined), true);
});

test("window focus always refreshes", () => {
  assert.strictEqual(shouldRefresh({ kind: "focus" }, 3), true);
  assert.strictEqual(shouldRefresh({ kind: "focus" }, undefined), true);
});

test("an update to the active tab refreshes on a url change or when loading completes", () => {
  assert.strictEqual(shouldRefresh({ kind: "updated", tabId: 3, changeInfo: { url: "https://a.com/" } }, 3), true);
  assert.strictEqual(shouldRefresh({ kind: "updated", tabId: 3, changeInfo: { status: "complete" } }, 3), true);
});

test("an update to a background tab never refreshes", () => {
  assert.strictEqual(shouldRefresh({ kind: "updated", tabId: 4, changeInfo: { url: "https://a.com/" } }, 3), false);
  assert.strictEqual(shouldRefresh({ kind: "updated", tabId: 4, changeInfo: { status: "complete" } }, 3), false);
});

test("loading without a url change, or other changes, do not refresh", () => {
  assert.strictEqual(shouldRefresh({ kind: "updated", tabId: 3, changeInfo: { status: "loading" } }, 3), false);
  assert.strictEqual(shouldRefresh({ kind: "updated", tabId: 3, changeInfo: { title: "x" } }, 3), false);
  assert.strictEqual(shouldRefresh({ kind: "updated", tabId: 3 }, 3), false);
});

test("an update with no known active tab is ignored", () => {
  assert.strictEqual(shouldRefresh({ kind: "updated", tabId: 3, changeInfo: { status: "complete" } }, undefined), false);
});

test("unknown or malformed events do not refresh", () => {
  for (const e of [null, undefined, {}, { kind: "removed" }, "x", 5]) {
    assert.strictEqual(shouldRefresh(e, 3), false);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
