// tests/telemetry_sender_test.mjs
import assert from "assert";
import { createTelemetry, handleTelemetryMessage, INGEST_URL, DELETE_URL, EXAMPLE_ID } from "../src/background/telemetrySender.js";
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
  const p = await t.preview();
  assert.deepStrictEqual(Object.keys(p).sort(), ["enabled", "example", "heartbeat"]);
  assert.strictEqual(p.enabled, false);
  assert.strictEqual(p.example, true);
  assert.strictEqual(p.heartbeat.id, EXAMPLE_ID);
  assert.strictEqual(map.size, 0);
  assert.strictEqual(calls.length, 0);
});

test("disabled preview is a valid, empty example for today with a placeholder id; no storage write, no fetch", async () => {
  assert.strictEqual(EXAMPLE_ID, "00000000-0000-4000-8000-000000000000");
  const writes = [];
  const map = new Map();
  const calls = [];
  const t = createTelemetry({
    storage: {
      get: async (k) => map.get(k),
      set: async (k, v) => { writes.push(["set", k]); map.set(k, v); },
      remove: async (k) => { writes.push(["remove", k]); map.delete(k); },
    },
    fetchFn: async (...a) => { calls.push(a); return { ok: true }; },
    now: () => new Date("2026-10-14T10:00:00Z"), version: "2.1.0",
    env: () => ({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36", lang: "de-DE" }),
  });
  const p = await t.preview();
  assert.ok(validateHeartbeat(p.heartbeat), "example must be validly shaped");
  assert.strictEqual(p.heartbeat.day, "2026-10-14");
  assert.strictEqual(p.heartbeat.version, "2.1.0");
  assert.deepStrictEqual(p.heartbeat.env, { chrome: 131, os: "windows", lang: "de" });
  assert.deepStrictEqual(p.heartbeat.engines, { auto: false, css: false, invert: false });
  assert.ok(Object.values(p.heartbeat.features).every((v) => v === false), "empty tally: no features");
  await t.preview();
  assert.deepStrictEqual(writes, [], "preview must never write storage");
  assert.strictEqual(map.size, 0, "no id is created or stored");
  assert.strictEqual(calls.length, 0);
});

test("enabled preview is the live report, not an example", async () => {
  const { t, map } = setup();
  await t.setConsent(true);
  const p = await t.preview();
  assert.strictEqual(p.enabled, true);
  assert.notStrictEqual(p.example, true);
  assert.strictEqual(p.heartbeat.id, map.get("telemetryState").id);
  assert.notStrictEqual(p.heartbeat.id, EXAMPLE_ID);
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
  const { t, calls, map } = setup({ responses: [new Error("offline")] });
  await t.setConsent(true);
  await t.recordUsage({ engine: "css" });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual((await map.get("telemetryState")).lastSentDay, null);
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
  const s2 = map.get("telemetryState");
  assert.notStrictEqual(s2.id, id1);
  assert.strictEqual(s2.lastSentDay, null);
  assert.strictEqual(s2.tally, null);
});

// A fetch whose response the test releases manually.
function deferredSetup() {
  const base = setup();
  const pending = [];
  const order = [];
  const fetchFn = (url, init) => {
    order.push(url);
    return new Promise((resolve) => pending.push({ url, resolve }));
  };
  const t = createTelemetry({
    storage: {
      get: async (k) => base.map.get(k),
      set: async (k, v) => { base.map.set(k, JSON.parse(JSON.stringify(v))); },
      remove: async (k) => { base.map.delete(k); },
    },
    fetchFn, now: () => base.clock.t, version: "2.1.0",
    env: () => ({ userAgent: "Chrome/130.0.0.0 Macintosh", lang: "en" }),
  });
  const tick = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
  return { t, map: base.map, pending, order, tick };
}

test("deleteMyData waits for the in-flight heartbeat before posting delete", async () => {
  const { t, map, pending, order, tick } = deferredSetup();
  await t.setConsent(true);
  const rec = t.recordUsage({ engine: "css" });
  await tick();
  assert.deepStrictEqual(order, [INGEST_URL]);
  const del = t.deleteMyData();
  await tick();
  assert.deepStrictEqual(order, [INGEST_URL], "delete must not be issued while ingest is pending");
  pending[0].resolve({ ok: true });
  await tick();
  assert.deepStrictEqual(order, [INGEST_URL, DELETE_URL]);
  pending[1].resolve({ ok: true });
  assert.deepStrictEqual(await del, { serverConfirmed: true });
  await rec;
  assert.strictEqual(map.size, 0);
});

test("stale response after opt-out or opt-out/opt-in does not restore old state", async () => {
  const a = deferredSetup();
  await a.t.setConsent(true);
  const recA = a.t.recordUsage({ engine: "css" });
  await a.tick();
  await a.t.setConsent(false);
  a.pending[0].resolve({ ok: true });
  await recA;
  assert.strictEqual(a.map.size, 0);

  const b = deferredSetup();
  await b.t.setConsent(true);
  const id1 = b.map.get("telemetryState").id;
  const recB = b.t.recordUsage({ engine: "css" });
  await b.tick();
  await b.t.setConsent(false);
  await b.t.setConsent(true);
  const id2 = b.map.get("telemetryState").id;
  b.pending[0].resolve({ ok: true });
  await recB;
  const s = b.map.get("telemetryState");
  assert.notStrictEqual(id2, id1);
  assert.strictEqual(s.id, id2);
  assert.strictEqual(s.lastSentDay, null);
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

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test("recordUsage starting while the DELETE fetch is pending issues no ingest", async () => {
  const { t, map, pending, order, tick } = deferredSetup();
  await t.setConsent(true);
  const del = t.deleteMyData();
  await tick();
  assert.deepStrictEqual(order, [DELETE_URL]);
  await t.recordUsage({ engine: "css" });
  await tick();
  assert.deepStrictEqual(order, [DELETE_URL], "no ingest while delete is pending");
  pending[0].resolve({ ok: true });
  assert.deepStrictEqual(await del, { serverConfirmed: true });
  assert.deepStrictEqual(order, [DELETE_URL]);
  assert.strictEqual(map.size, 0);
});

test("recordUsage suspended at its state read when delete runs sends no ingest", async () => {
  const map = new Map();
  let gate = null;
  let release;
  const storage = {
    get: async (k) => {
      const v = map.get(k);
      if (gate) { const g = gate; gate = null; await g; }
      return v;
    },
    set: async (k, v) => { map.set(k, JSON.parse(JSON.stringify(v))); },
    remove: async (k) => { map.delete(k); },
  };
  const order = [];
  const fetchFn = async (url) => { order.push(url); return { ok: true }; };
  const t = createTelemetry({
    storage, fetchFn, now: () => new Date("2026-10-14T10:00:00Z"), version: "2.1.0",
    env: () => ({ userAgent: "Chrome/130.0.0.0 Macintosh", lang: "en" }),
  });
  await t.setConsent(true);
  // Let recordUsage pass its exclusive section, then suspend at the post-exclusive state read.
  const origGet = storage.get;
  let calls = 0;
  storage.get = async (k) => {
    calls++;
    if (calls === 2) { gate = new Promise((r) => { release = r; }); }
    return origGet(k);
  };
  const rec = t.recordUsage({ engine: "css" });
  await flush();
  const del = t.deleteMyData();
  await flush();
  release();
  await rec;
  await del;
  assert.ok(!order.includes(INGEST_URL), `ingest must not be sent: ${order.join(",")}`);
  assert.strictEqual(map.size, 0);
});

function fakeTelemetry() {
  const calls = [];
  return {
    calls,
    recordUsage: async (m) => { calls.push(["usage", m]); },
    setConsent: async (e) => { calls.push(["consent", e]); },
    preview: async () => ({ enabled: false, heartbeat: null }),
    deleteMyData: async () => ({ serverConfirmed: true }),
  };
}

test("handleTelemetryMessage ignores non-telemetry messages", () => {
  const t = fakeTelemetry();
  for (const m of [null, undefined, "x", 5, {}, { type: "TOGGLE" }, { type: "ANALYZE_PAGE" }]) {
    assert.strictEqual(handleTelemetryMessage(t, m), undefined);
  }
  assert.strictEqual(t.calls.length, 0);
});

test("handleTelemetryMessage routes USAGE and replies ok", async () => {
  const t = fakeTelemetry();
  const msg = { type: "USAGE", engine: "css" };
  const p = handleTelemetryMessage(t, msg);
  assert.ok(p instanceof Promise);
  assert.deepStrictEqual(await p, { ok: true });
  assert.deepStrictEqual(t.calls, [["usage", msg]]);
});

test("handleTelemetryMessage consent requires a boolean", async () => {
  const t = fakeTelemetry();
  assert.deepStrictEqual(await handleTelemetryMessage(t, { type: "TELEMETRY_CONSENT", enabled: true }), { ok: true });
  assert.deepStrictEqual(await handleTelemetryMessage(t, { type: "TELEMETRY_CONSENT", enabled: false }), { ok: true });
  for (const enabled of ["true", 1, null, undefined]) {
    assert.deepStrictEqual(await handleTelemetryMessage(t, { type: "TELEMETRY_CONSENT", enabled }), { ok: false });
  }
  assert.deepStrictEqual(t.calls, [["consent", true], ["consent", false]]);
});

test("handleTelemetryMessage returns preview and delete results", async () => {
  const t = fakeTelemetry();
  assert.deepStrictEqual(await handleTelemetryMessage(t, { type: "TELEMETRY_STATUS" }), { enabled: false, heartbeat: null });
  assert.deepStrictEqual(await handleTelemetryMessage(t, { type: "TELEMETRY_DELETE" }), { serverConfirmed: true });
});

test("handleTelemetryMessage never rejects when telemetry throws", async () => {
  const t = { ...fakeTelemetry(), recordUsage: async () => { throw new Error("x"); }, preview: async () => { throw new Error("x"); } };
  assert.deepStrictEqual(await handleTelemetryMessage(t, { type: "USAGE", engine: "css" }), { ok: false });
  assert.deepStrictEqual(await handleTelemetryMessage(t, { type: "TELEMETRY_STATUS" }), { enabled: false, heartbeat: null });
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
