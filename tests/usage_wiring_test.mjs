// tests/usage_wiring_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { handleUsageMessage } from "../src/background/usageMessages.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

function fakeUsage() {
  const calls = [];
  return {
    calls,
    recordDarkApplied: async (a) => { calls.push(["record", a]); },
    setConsent: async (e) => { calls.push(["consent", e]); return { ok: true, serverConfirmed: true }; },
    status: async () => { calls.push(["status"]); return { enabled: false, consentNeeded: "ask" }; },
  };
}
const fromTab = (url) => ({ id: "x", tab: { id: 1, url } });
const fromPage = { id: "x" };

test("DARK_APPLIED from a content script records the engine and the tab's own host", async () => {
  const u = fakeUsage();
  const p = handleUsageMessage(u, { type: "DARK_APPLIED", engine: "css" }, fromTab("https://News.Example.com/a?q=1#x"));
  assert.ok(p && typeof p.then === "function");
  assert.deepStrictEqual(await p, { ok: true });
  assert.deepStrictEqual(u.calls, [["record", { engine: "css", host: "news.example.com" }]]);
});

test("a host or URL supplied inside the message is never used", async () => {
  const u = fakeUsage();
  await handleUsageMessage(u, { type: "DARK_APPLIED", engine: "auto", host: "evil.example", url: "https://evil.example/" }, fromTab("https://real.example.com/"));
  assert.deepStrictEqual(u.calls, [["record", { engine: "auto", host: "real.example.com" }]]);
});

test("DARK_APPLIED is ignored without a tab, from non-web pages and with a bad engine", () => {
  const u = fakeUsage();
  assert.strictEqual(handleUsageMessage(u, { type: "DARK_APPLIED", engine: "css" }, fromPage), undefined);
  for (const url of ["file:///C:/a.pdf", "chrome://settings", "about:blank", "chrome-extension://abc/x.html", "", undefined, "not a url"]) {
    assert.strictEqual(handleUsageMessage(u, { type: "DARK_APPLIED", engine: "css" }, fromTab(url)), undefined, String(url));
  }
  assert.strictEqual(handleUsageMessage(u, { type: "DARK_APPLIED", engine: "bogus" }, fromTab("https://a.example.com/")), undefined);
  assert.strictEqual(handleUsageMessage(u, { type: "DARK_APPLIED" }, fromTab("https://a.example.com/")), undefined);
  assert.deepStrictEqual(u.calls, []);
});

test("USAGE_CONSENT and USAGE_STATUS are answered for extension pages only", async () => {
  const u = fakeUsage();
  assert.deepStrictEqual(await handleUsageMessage(u, { type: "USAGE_CONSENT", enabled: true }, fromPage), { ok: true, serverConfirmed: true });
  assert.deepStrictEqual(await handleUsageMessage(u, { type: "USAGE_STATUS" }, fromPage), { enabled: false, consentNeeded: "ask" });
  assert.deepStrictEqual(u.calls, [["consent", true], ["status"]]);
  const u2 = fakeUsage();
  assert.strictEqual(handleUsageMessage(u2, { type: "USAGE_CONSENT", enabled: true }, fromTab("https://a.example.com/")), undefined);
  assert.strictEqual(handleUsageMessage(u2, { type: "USAGE_STATUS" }, fromTab("https://a.example.com/")), undefined);
  assert.deepStrictEqual(u2.calls, []);
});

test("USAGE_CONSENT needs a real boolean", async () => {
  const u = fakeUsage();
  for (const bad of ["true", 1, null, undefined, {}]) {
    assert.deepStrictEqual(await handleUsageMessage(u, { type: "USAGE_CONSENT", enabled: bad }, fromPage), { ok: false });
  }
  assert.deepStrictEqual(u.calls, []);
});

test("other messages and junk fall through", () => {
  const u = fakeUsage();
  for (const m of [null, undefined, "x", 5, {}, { type: "TOGGLE" }, { type: "SITE_REPORT" }, { type: "USAGE" }]) {
    assert.strictEqual(handleUsageMessage(u, m, fromPage), undefined);
  }
});

test("a failing usage call becomes a failed reply, never a rejection", async () => {
  const u = fakeUsage();
  u.setConsent = async () => { throw new Error("x"); };
  u.status = async () => { throw new Error("x"); };
  u.recordDarkApplied = async () => { throw new Error("x"); };
  assert.deepStrictEqual(await handleUsageMessage(u, { type: "USAGE_CONSENT", enabled: false }, fromPage), { ok: false });
  assert.deepStrictEqual(await handleUsageMessage(u, { type: "USAGE_STATUS" }, fromPage), { enabled: false, consentNeeded: null });
  assert.deepStrictEqual(await handleUsageMessage(u, { type: "DARK_APPLIED", engine: "css" }, fromTab("https://a.example.com/")), { ok: false });
});

test("the service worker builds the usage sender on postJson, retries pending deletes and routes its messages", () => {
  const sw = read("src/background/serviceWorker.js");
  assert.ok(!/legacyTelemetryCleanup|createLegacyCleanup/.test(sw), "legacy cleanup must be gone");
  assert.ok(/import \{ createUsage \} from "\.\/usageSender\.js"/.test(sw));
  assert.ok(/import \{ handleUsageMessage \} from "\.\/usageMessages\.js"/.test(sw));
  assert.ok(/createUsage\(\{[\s\S]{0,400}post: postJson/.test(sw));
  assert.ok(/\.retryPendingDelete\(\)/.test(sw));
  assert.ok(/handleUsageMessage\(usage, msg, sender\)/.test(sw));
  assert.ok(!fs.existsSync(path.join(rootDir, "src/background/legacyTelemetryCleanup.js")));
});

test("the content script reports DARK_APPLIED once, with the engine only", () => {
  const src = read("src/content/index.js");
  assert.ok(/type: "DARK_APPLIED", engine: normalizeEngine\(config\?\.engine\)/.test(src));
  assert.strictEqual((src.match(/DARK_APPLIED/g) || []).length, 1);
  const msg = src.match(/sendMessage\(\{ type: "DARK_APPLIED"[^)]*\)/);
  assert.ok(msg, "message literal must be found");
  assert.ok(!/host|url|href|location/i.test(msg[0]), "the message carries no site information");
  assert.ok(/reportDarkAppliedOnce\(config\)/.test(src), "applyEngine must call it after the engine applied");
});

console.log("\nUsage wiring");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
