// tests/site_user_count_test.mjs - the hand-edited user count (docs/users.json) and its page wiring.
import fs from "fs";
import path from "path";
import vm from "vm";
import assert from "assert";
import { fileURLToPath } from "url";

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const read = (f) => fs.readFileSync(path.join(docsDir, f), "utf8");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.stack || err.message}`); failed++; }
}
console.log("\n👥 Site user count");

const data = JSON.parse(read("users.json"));
const html = read("index.html");
const SRC = read("js/user-count.js");

function run(response) {
  const nodes = [{ textContent: "3,900+" }, { textContent: "3,900+" }];
  const ctx = {
    document: { querySelectorAll: () => ({ length: nodes.length, forEach: (f) => nodes.forEach(f) }) },
    fetch: () => Promise.resolve(response),
  };
  vm.runInNewContext(SRC, ctx);
  return new Promise((r) => setTimeout(() => r(nodes.map((n) => n.textContent)), 10));
}

await test("users.json has a positive number, a label and an ISO date", () => {
  assert.ok(Number.isInteger(data.users) && data.users > 0);
  assert.match(data.label, /^[0-9][0-9,.]*[kK]?\+?$/);
  assert.match(data.asOf, /^\d{4}-\d{2}-\d{2}$/);
});

await test("label matches the number (rounded down to the hundred, with +)", () => {
  const expected = (Math.floor(data.users / 100) * 100).toLocaleString("en-US") + "+";
  assert.strictEqual(data.label, expected);
});

await test("every fallback in index.html equals the label, so the page is right before the fetch", () => {
  const fallbacks = [...html.matchAll(/<span data-user-count>([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.ok(fallbacks.length >= 2);
  for (const f of fallbacks) assert.strictEqual(f, data.label);
});

await test("index.html loads user-count.js", () => assert.match(html, /<script src="js\/user-count\.js"><\/script>/));

await test("script writes the label from users.json", async () => {
  const out = await run({ ok: true, json: () => Promise.resolve({ label: "4,100+" }) });
  assert.deepStrictEqual(out, ["4,100+", "4,100+"]);
});

await test("script ignores a failed response or a malformed label", async () => {
  assert.deepStrictEqual(await run({ ok: false }), ["3,900+", "3,900+"]);
  assert.deepStrictEqual(await run({ ok: true, json: () => Promise.resolve({ label: "<img src=x>" }) }), ["3,900+", "3,900+"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
