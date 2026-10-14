// tests/telemetry_sender_test.mjs
import assert from "assert";
import { createTelemetry, INGEST_URL, DELETE_URL } from "../src/background/telemetrySender.js";
import { validateHeartbeat } from "../src/shared/telemetry.js";

let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

function setup({ start = "2026-10-14T10:00:00Z", responses = [] } = {}) {
  const map = new Map();
  const storage = {
    get: async (k) => map.get(k),
    set: async (k, v) => { map.set(k, JSON.parse(JSON.stringify(v))); },
    remove: async (k) => { map.delete(k); },
  };
  const calls = [];
  let i = 0;
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return r || { ok: true, status: 200 };
  };
  const clock = { t: new Date(start) };
  const t = createTelemetry({
    storage, fetchFn, now: () => clock.t, version: "2.1.0",
    env: () => ({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0 Safari/537.36", lang: "en-US" }),
  });
  return { t, map, calls, clock };
}

test("constants", () => {
  assert.strictEqual(INGEST_URL, "https://pshah.fun/api/darkmode-telemetry");
  assert.strictEqual(DELETE_URL, "https://pshah.fun/api/darkmode-telemetry-delete");
});

test("no fetch and no id before consent", async () => {
  const { t, map, calls } = setup();
  await t.recordUsage({ engine: "css" });
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(map.size, 0);
  assert.deepStrictEqual(await t.preview(), { enabled: false, heartbeat: null });
});

test("setConsent(true) stores state and does not fetch", async () => {
  const { t, map, calls } = setup();
  await t.setConsent(true);
  assert.strictEqual(calls.length, 0);
  const s = map.get("telemetryState");
  assert.strictEqual(s.enabled, true);
  assert.ok(typeof s.id === "string" && s.id.length === 36);
  assert.strictEqual(s.lastSentDay, null);
  assert.deepStrictEqual([...map.keys()], ["telemetryState"]);
});

test("invalid usage is ignored even when enabled", async () => {
  const { t, calls } = setup();
  await t.setConsent(true);
  await t.recordUsage({ engine: "bogus" });
  await t.recordUsage("x");
  assert.strictEqual(calls.length, 0);
});

test("first event posts one valid heartbeat; second same-day posts none", async () => {
  const { t, calls } = setup();
  await t.setConsent(true);
  await t.recordUsage({ engine: "css" });
  assert.strictEqual(calls.length, 1);
  const c = calls[0];
  assert.strictEqual(c.url, INGEST_URL);
  assert.strictEqual(c.init.method, "POST");
  assert.strictEqual(c.init.credentials, "omit");
  assert.strictEqual(c.init.referrerPolicy, "no-referrer");
  assert.deepStrictEqual(c.init.headers, { "Content-Type": "application/json" });
  const body = JSON.parse(c.init.body);
  assert.ok(validateHeartbeat(body));
  assert.strictEqual(body.engines.css, true);
  assert.strictEqual(body.day, "2026-10-14");
  await t.recordUsage({ feature: "viewer" });
  assert.strictEqual(calls.length, 1);
  const p = await t.preview();
  assert.strictEqual(p.enabled, true);
  assert.strictEqual(p.heartbeat.features.viewer, true);
});

test("concurrent first events post once", async () => {
  const { t, calls } = setup();
  await t.setConsent(true);
  await Promise.all([t.recordUsage({ engine: "css" }), t.recordUsage({ feature: "editor" })]);
  assert.strictEqual(calls.length, 1);
});

test("500 leaves lastSentDay null and next event retries once", async () => {
  const { t, map, calls } = setup({ responses: [{ ok: false, status: 500 }, { ok: true }] });
  await t.setConsent(true);
  await t.recordUsage({ engine: "css" });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(map.get("telemetryState").lastSentDay, null);
  await t.recordUsage({ engine: "auto" });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(map.get("telemetryState").lastSentDay, "2026-10-14");
  await t.recordUsage({ engine: "invert" });
  assert.strictEqual(calls.length, 2);
});

test("rejected fetch does not throw", async () => {
  const { t, calls } = setup({ responses: [new Error("offline")] });
  await t.setConsent(true);
  await t.recordUsage({ engine: "css" });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(await t.send(), true);
});

test("day rollover resets tally and posts again", async () => {
  const { t, calls, clock } = setup();
  await t.setConsent(true);
  await t.recordUsage({ engine: "css" });
  clock.t = new Date("2026-10-15T00:00:01Z");
  await t.recordUsage({ feature: "editor" });
  assert.strictEqual(calls.length, 2);
  const b = JSON.parse(calls[1].init.body);
  assert.strictEqual(b.day, "2026-10-15");
  assert.strictEqual(b.engines.css, false);
  assert.strictEqual(b.features.editor, true);
});

test("opt-out empties storage; re-opt-in gives a new id", async () => {
  const { t, map } = setup();
  await t.setConsent(true);
  const id1 = map.get("telemetryState").id;
  await t.recordUsage({ engine: "css" });
  await t.setConsent(false);
  assert.strictEqual(map.size, 0);
  await t.setConsent(true);
  assert.notStrictEqual(map.get("telemetryState").id, id1);
});

test("deleteMyData posts id, clears state, reports confirmation", async () => {
  const { t, map, calls } = setup();
  await t.setConsent(true);
  const id = map.get("telemetryState").id;
  const r = await t.deleteMyData();
  assert.deepStrictEqual(r, { serverConfirmed: true });
  assert.strictEqual(calls[0].url, DELETE_URL);
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), { id });
  assert.strictEqual(calls[0].init.credentials, "omit");
  assert.strictEqual(map.size, 0);
});

test("deleteMyData with rejected fetch returns serverConfirmed false and still clears", async () => {
  const { t, map } = setup({ responses: [new Error("offline")] });
  await t.setConsent(true);
  const r = await t.deleteMyData();
  assert.deepStrictEqual(r, { serverConfirmed: false });
  assert.strictEqual(map.size, 0);
});

test("deleteMyData with no state makes no call", async () => {
  const { t, calls } = setup();
  assert.deepStrictEqual(await t.deleteMyData(), { serverConfirmed: false });
  assert.strictEqual(calls.length, 0);
});

test("invalid heartbeat is never sent", async () => {
  const s = setup();
  await s.t.setConsent(true);
  s.map.set("telemetryState", { ...s.map.get("telemetryState"), id: "not-a-uuid" });
  assert.strictEqual(await s.t.send(), false);
  assert.strictEqual(s.calls.length, 0);
});

console.log("=========================================");
console.log("📡 Running Telemetry Sender Tests");
console.log("=========================================\n");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
