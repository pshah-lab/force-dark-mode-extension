// tests/site_report_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { normalizeSite, buildReport, REPORT_URL, BUILTIN_THEME_IDS } from "../src/shared/siteReport.js";
import { createReportSender } from "../src/background/siteReportSender.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

test("REPORT_URL is the exact first-party endpoint", () => {
  assert.strictEqual(REPORT_URL, "https://pshah.fun/api/darkmode-report");
});

test("normalizeSite keeps only the lowercase hostname", () => {
  assert.strictEqual(normalizeSite("https://Docs.Example.com:8443/a/b?q=secret#frag"), "docs.example.com");
  assert.strictEqual(normalizeSite("http://user:pw@news.example.co.uk/x"), "news.example.co.uk");
  assert.strictEqual(normalizeSite("example.com"), "example.com");
  assert.strictEqual(normalizeSite("Example.COM."), "example.com");
  assert.strictEqual(normalizeSite("https://xn--bcher-kva.example/"), "xn--bcher-kva.example");
});

test("normalizeSite rejects hosts that must never be sent", () => {
  const bad = [
    "", " ", "a b", "local_files", "localhost", "http://localhost:3000/", "127.0.0.1", "http://192.168.1.5/x",
    "[::1]", "http://[2001:db8::1]/", "printer.local", "x.internal", "a.test", "foo.localhost", "intranet",
    "-bad.example.com", "bad-.example.com", "exa mple.com", "ex_ample.com", "https://", "file:///C:/a.pdf",
    "a".repeat(64) + ".com", ("a".repeat(60) + ".").repeat(5) + "com", null, undefined, 5, {},
  ];
  for (const b of bad) assert.strictEqual(normalizeSite(b), null, JSON.stringify(b));
});

test("buildReport emits exactly four keys", () => {
  const r = buildReport({ site: "https://a.example.com/p?q=1", engine: "css", themeId: "builtin:nord", version: "2.1.0" });
  assert.deepStrictEqual(r, { site: "a.example.com", engine: "css", theme: "builtin:nord", version: "2.1.0" });
  assert.deepStrictEqual(Object.keys(r), ["site", "engine", "theme", "version"]);
});

test("buildReport maps themes: built-in kept, default, everything else custom", () => {
  const base = { site: "a.example.com", engine: "auto", version: "2.1.0" };
  assert.strictEqual(buildReport({ ...base, themeId: "" }).theme, "default");
  assert.strictEqual(buildReport({ ...base, themeId: undefined }).theme, "default");
  assert.strictEqual(buildReport({ ...base, themeId: "default" }).theme, "default");
  assert.strictEqual(buildReport({ ...base, themeId: "user:abc123" }).theme, "custom");
  assert.strictEqual(buildReport({ ...base, themeId: "My Private Theme Name" }).theme, "custom");
  assert.strictEqual(buildReport({ ...base, themeId: "builtin:evil" }).theme, "custom");
});

test("buildReport rejects unknown engines, bad sites and bad versions", () => {
  const ok = { site: "a.example.com", engine: "css", themeId: "", version: "2.1.0" };
  assert.ok(buildReport(ok));
  assert.strictEqual(buildReport({ ...ok, engine: "x" }), null);
  assert.strictEqual(buildReport({ ...ok, engine: undefined }), null);
  assert.strictEqual(buildReport({ ...ok, site: "localhost" }), null);
  assert.strictEqual(buildReport({ ...ok, version: "2.1" }), null);
  assert.strictEqual(buildReport({ ...ok, version: "2.1.0-beta" }), null);
  assert.strictEqual(buildReport(null), null);
});

test("the built-in theme ids match builtinThemes.js", () => {
  const sandbox = { globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, "src/shared/builtinThemes.js"), "utf8"), sandbox);
  const ids = sandbox.ForceDarkThemes.getBuiltinThemes().map((t) => t.id);
  assert.deepStrictEqual([...BUILTIN_THEME_IDS].sort(), [...ids].sort());
});

function setup({ responses = [], start = "2026-10-17T10:00:00Z" } = {}) {
  const map = new Map();
  const storage = {
    get: async (k) => map.get(k),
    set: async (k, v) => { map.set(k, JSON.parse(JSON.stringify(v))); },
    remove: async (k) => { map.delete(k); },
  };
  const calls = [];
  let i = 0;
  const post = async (url, body) => {
    calls.push({ url, body });
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return r || { ok: true, status: 204 };
  };
  const clock = { t: new Date(start) };
  const sender = createReportSender({ storage, post, now: () => clock.t, version: "2.1.0" });
  return { sender, map, calls, clock };
}

const MSG = { host: "docs.example.com", engine: "css", themeId: "builtin:nord" };

test("a valid report is posted once with exactly the four keys, then remembered as site and day only", async () => {
  const { sender, calls, map } = setup();
  assert.strictEqual(await sender.send(MSG), "sent");
  assert.deepStrictEqual(calls, [{
    url: REPORT_URL,
    body: { site: "docs.example.com", engine: "css", theme: "builtin:nord", version: "2.1.0" },
  }]);
  assert.deepStrictEqual(map.get("siteReportState"), { day: "2026-10-17", sites: ["docs.example.com"] });
});

test("the same site again the same UTC day is already reported, with no request", async () => {
  const { sender, calls } = setup();
  await sender.send(MSG);
  assert.strictEqual(await sender.send({ ...MSG, engine: "invert" }), "already");
  assert.strictEqual(calls.length, 1);
});

test("a different site the same day is sent; the next UTC day allows the first again", async () => {
  const { sender, calls, clock, map } = setup();
  await sender.send(MSG);
  assert.strictEqual(await sender.send({ ...MSG, host: "other.example.org" }), "sent");
  clock.t = new Date("2026-10-18T00:00:01Z");
  assert.strictEqual(await sender.send(MSG), "sent");
  assert.strictEqual(calls.length, 3);
  assert.deepStrictEqual(map.get("siteReportState"), { day: "2026-10-18", sites: ["docs.example.com"] });
});

test("a non-2xx answer or a thrown error is failed and stores nothing, so a retry sends", async () => {
  const { sender, calls, map } = setup({ responses: [{ ok: false, status: 500 }, new Error("offline")] });
  assert.strictEqual(await sender.send(MSG), "failed");
  assert.strictEqual(map.has("siteReportState"), false);
  assert.strictEqual(await sender.send(MSG), "failed");
  assert.strictEqual(await sender.send(MSG), "sent");
  assert.strictEqual(calls.length, 3);
});

test("an invalid host or engine is invalid: no request, nothing stored", async () => {
  const { sender, calls, map } = setup();
  for (const bad of [{ ...MSG, host: "localhost" }, { ...MSG, host: "192.168.0.1" }, { ...MSG, host: "local_files" }, { ...MSG, host: 5 }, { ...MSG, engine: "x" }, null, "x"]) {
    assert.strictEqual(await sender.send(bad), "invalid", JSON.stringify(bad));
  }
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(map.has("siteReportState"), false);
});

test("two concurrent sends for one site make exactly one request", async () => {
  const { sender, calls } = setup();
  const [a, b] = await Promise.all([sender.send(MSG), sender.send(MSG)]);
  assert.deepStrictEqual([a, b].sort(), ["already", "sent"]);
  assert.strictEqual(calls.length, 1);
});

test("junk stored state is ignored and replaced", async () => {
  const { sender, map } = setup();
  const st = { sites: "nope", day: 5 };
  map.set("siteReportState", st);
  assert.strictEqual(await sender.send(MSG), "sent");
  assert.deepStrictEqual(map.get("siteReportState"), { day: "2026-10-17", sites: ["docs.example.com"] });
});

test("the worker answers SITE_REPORT only for extension pages (never a content script)", () => {
  const sw = fs.readFileSync(path.join(rootDir, "src/background/serviceWorker.js"), "utf8");
  const block = sw.match(/msg\.type === "SITE_REPORT"[\s\S]{0,300}/);
  assert.ok(block, "serviceWorker.js must route SITE_REPORT");
  assert.ok(/sender\.tab/.test(block[0]), "SITE_REPORT must be refused when sender.tab is set");
  assert.ok(/reportSender\.send\(/.test(sw));
});

console.log("\nBroken-site report");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
