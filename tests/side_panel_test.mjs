// tests/side_panel_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
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

test("permissions are exactly storage, activeTab, contextMenus, sidePanel", () => {
  assert.deepStrictEqual(manifest.permissions, ["storage", "activeTab", "contextMenus", "sidePanel"]);
});

test("the toolbar icon has no popup", () => {
  assert.ok(manifest.action, "the action key stays so the icon is shown");
  assert.strictEqual(manifest.action.default_popup, undefined);
});

test("the side panel page exists", () => {
  assert.ok(manifest.side_panel && typeof manifest.side_panel.default_path === "string");
  assert.ok(fs.existsSync(path.join(rootDir, manifest.side_panel.default_path)));
});

test("minimum Chrome version is 114 (first with the side panel API)", () => {
  assert.strictEqual(manifest.minimum_chrome_version, "114");
});

test("no host permissions are added", () => {
  for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions"]) {
    assert.strictEqual(manifest[key], undefined, key);
  }
});

test("the worker opens the panel on icon click", () => {
  const sw = fs.readFileSync(path.join(rootDir, "src/background/serviceWorker.js"), "utf8");
  assert.ok(/setPanelBehavior\(\s*\{\s*openPanelOnActionClick:\s*true\s*\}\s*\)/.test(sw));
});

test("the panel layout is fluid, not a fixed popup width", () => {
  const css = fs.readFileSync(path.join(rootDir, "src/popup/popup.css"), "utf8");
  const block = css.match(/\.popup\s*\{[^}]*\}/)[0];
  assert.ok(!/(^|[\s;{])width:\s*\d+px/.test(block), "`.popup` must not set a fixed pixel width");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
