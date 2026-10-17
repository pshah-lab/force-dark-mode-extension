// tests/tab_url_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
// tabUrl.js is a classic panel script (package is "type": "module"), so run it in a sandbox.
const sandbox = { URL };
vm.runInNewContext(read("src/popup/tabUrl.js"), sandbox);
const { resolveTabUrl, isStorePage, isSameView } = sandbox.TabUrl;

const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

test("a tab whose url Chrome shows is used as is, without asking the page", async () => {
  let asked = 0;
  const url = await resolveTabUrl({ id: 3, url: "https://a.example.com/x" }, async () => { asked++; return "https://other/"; });
  assert.strictEqual(url, "https://a.example.com/x");
  assert.strictEqual(asked, 0);
});

test("a hidden url (side panel on a tab the user did not click the icon on) is asked from the page", async () => {
  const seen = [];
  const url = await resolveTabUrl({ id: 7 }, async (id) => { seen.push(id); return "https://b.example.org/p"; });
  assert.strictEqual(url, "https://b.example.org/p");
  assert.deepStrictEqual(seen, [7]);
  assert.strictEqual(await resolveTabUrl({ id: 7, url: "" }, async () => "https://b.example.org/"), "https://b.example.org/");
});

test("no answer from the page means no url (restricted page, no content script, no tab)", async () => {
  assert.strictEqual(await resolveTabUrl({ id: 7 }, async () => { throw new Error("no receiver"); }), null);
  for (const bad of [undefined, null, "", 5, {}, []]) {
    assert.strictEqual(await resolveTabUrl({ id: 7 }, async () => bad), null, JSON.stringify(bad));
  }
  assert.strictEqual(await resolveTabUrl({}, async () => "https://x.com/"), null);
  assert.strictEqual(await resolveTabUrl(null, async () => "https://x.com/"), null);
  assert.strictEqual(await resolveTabUrl(undefined, async () => "https://x.com/"), null);
});

test("the Chrome Web Store is a restricted page", () => {
  assert.strictEqual(isStorePage("https://chromewebstore.google.com/detail/x/abc"), true);
  assert.strictEqual(isStorePage("https://chrome.google.com/webstore/detail/x"), true);
  assert.strictEqual(isStorePage("https://chrome.google.com/other"), false);
  assert.strictEqual(isStorePage("https://example.com/chromewebstore.google.com"), false);
  assert.strictEqual(isStorePage("not a url"), false);
  assert.strictEqual(isStorePage(undefined), false);
});

test("isSameView compares the tab id and the url", () => {
  assert.strictEqual(isSameView({ id: 1, url: "https://a.com/" }, { id: 1, url: "https://a.com/" }), true);
  assert.strictEqual(isSameView({ id: 1, url: "https://a.com/" }, { id: 2, url: "https://a.com/" }), false);
  assert.strictEqual(isSameView({ id: 1, url: "https://a.com/" }, { id: 1, url: "https://a.com/b" }), false);
  assert.strictEqual(isSameView(null, { id: 1, url: "https://a.com/" }), false);
  assert.strictEqual(isSameView({ id: 1, url: null }, { id: 1, url: null }), true);
});

test("the content script answers PAGE_INFO with its address, and the panel uses TabUrl and a stale-reply guard", () => {
  const content = read("src/content/index.js");
  assert.ok(/msg\.type === "PAGE_INFO"[\s\S]{0,120}href/.test(content), "content script must answer PAGE_INFO with href");
  const popup = read("src/popup/popup.js");
  assert.ok(/TabUrl\.resolveTabUrl\(/.test(popup));
  assert.ok(/PAGE_INFO/.test(popup));
  assert.ok(/viewToken/.test(popup), "the panel must drop replies that belong to a previous tab");
  assert.ok(read("src/popup/popup.html").includes("tabUrl.js"));
});

console.log("\nTab address resolution");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
