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
  const mk = (kind) => ({ textContent: kind === "weekly" ? "1,700+" : "3,900+", getAttribute: () => kind });
  const nodes = [mk("weekly"), mk("total")];
  const ctx = {
    document: { querySelectorAll: () => ({ length: nodes.length, forEach: (f) => nodes.forEach(f) }) },
    fetch: () => Promise.resolve(response),
  };
  vm.runInNewContext(SRC, ctx);
  return new Promise((r) => setTimeout(() => r(nodes.map((n) => n.textContent)), 10));
}

const roundDown = (n) => (Math.floor(n / 100) * 100).toLocaleString("en-US") + "+";

await test("users.json has total and weekly counts, labels and an ISO date", () => {
  for (const k of ["total", "weekly"]) {
    assert.ok(Number.isInteger(data[k]) && data[k] > 0, k);
    assert.match(data[k + "Label"], /^[0-9][0-9,.]*[kK]?\+?$/);
  }
  assert.ok(data.total >= data.weekly, "total users cannot be fewer than weekly users");
  assert.match(data.asOf, /^\d{4}-\d{2}-\d{2}$/);
});

await test("labels match the numbers (rounded down to the hundred, with +)", () => {
  assert.strictEqual(data.totalLabel, roundDown(data.total));
  assert.strictEqual(data.weeklyLabel, roundDown(data.weekly));
});

await test("every fallback in index.html equals its label, so the page is right before the fetch", () => {
  const found = [...html.matchAll(/<span data-user-count="(total|weekly)">([^<]*)<\/span>/g)];
  assert.ok(found.some((m) => m[1] === "total") && found.some((m) => m[1] === "weekly"));
  for (const [, kind, text] of found) assert.strictEqual(text, data[kind + "Label"]);
});

await test("index.html loads user-count.js", () => assert.match(html, /<script src="js\/user-count\.js"><\/script>/));

await test("script writes each label from users.json", async () => {
  const out = await run({ ok: true, json: () => Promise.resolve({ weeklyLabel: "2,100+", totalLabel: "4,100+" }) });
  assert.deepStrictEqual(out, ["2,100+", "4,100+"]);
});

await test("script ignores a failed response or a malformed label", async () => {
  assert.deepStrictEqual(await run({ ok: false }), ["1,700+", "3,900+"]);
  assert.deepStrictEqual(await run({ ok: true, json: () => Promise.resolve({ weeklyLabel: "<img src=x>", totalLabel: 5 }) }), ["1,700+", "3,900+"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
