// tests/pdf_tools_link_test.mjs — PDF Tools and Export left the extension: no tools code, no new permissions.
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(rootDir, f), "utf8");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

console.log("\nPDF tools removed from the extension");

test("manifest permissions are exactly storage, activeTab, contextMenus, sidePanel; no host permissions", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.deepStrictEqual(manifest.permissions, ["storage", "activeTab", "contextMenus", "sidePanel"]);
  assert.strictEqual(manifest.host_permissions, undefined);
  assert.strictEqual(manifest.optional_host_permissions, undefined);
  assert.strictEqual(manifest.optional_permissions, undefined);
});

test("no src/tools, src/viewer/pdftools or src/viewer/convert directory remains", () => {
  for (const dir of ["src/tools", "src/viewer/pdftools", "src/viewer/convert"]) {
    assert.ok(!fs.existsSync(path.join(rootDir, dir)), `${dir} must not exist`);
  }
});

test("no extension file references the removed tools or convert code", () => {
  const files = [...walk(path.join(rootDir, "src")).filter((f) => !f.includes(`${path.sep}vendor${path.sep}`)), path.join(rootDir, "manifest.json")];
  for (const full of files) {
    const text = fs.readFileSync(full, "utf8");
    for (const re of [/tools\/tools\.html/, /pdftools/, /toolRegistry/, /viewerToolMenu/, /\bconvert\//, /pdf-lib/]) {
      assert.ok(!re.test(text), `${path.relative(rootDir, full)} matches ${re}`);
    }
  }
});

test("the popup no longer opens an in-extension tools page", () => {
  assert.ok(!/open-pdf-tools/.test(read("src/popup/popup.html")));
  assert.ok(!/getURL\("src\/tools\//.test(read("src/popup/popup.js")));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
