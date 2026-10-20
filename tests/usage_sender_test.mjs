// tests/usage_sender_test.mjs
import assert from "assert";
import { createUsage, INGEST_URL, DELETE_URL } from "../src/background/usageSender.js";
import { validateReport } from "../src/shared/usageReport.js";
import { postJson } from "../src/background/network.js";

const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

const ID = "123e4567-e89b-42d3-a456-426614174000";
const ID2 = "223e4567-e89b-42d3-a456-426614174000";
const MIN = 60 * 1000;

function setup({ initial = {}, responses = [], start = "2026-10-20T10:00:00Z" } = {}) {
  const map = new Map(Object.entries(initial));
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
  let n = 0;
  const ids = [ID, ID2];
  const usage = createUsage({
    storage, post, now: () => clock.t, version: "2.1.0",
    randomUUID: () => ids[n++ % ids.length],
  });
  const advance = (ms) => { clock.t = new Date(clock.t.getTime() + ms); };
  const ingests = () => calls.filter((c) => c.url === INGEST_URL);
  const deletes = () => calls.filter((c) => c.url === DELETE_URL);
  return { usage, map, calls, advance, clock, ingests, deletes };
}
const dark = (engine = "auto", host = "a.example.com") => ({ engine, host });

test("constants are the exact first-party URLs", () => {
  assert.strictEqual(INGEST_URL, "https://pshah.fun/api/darkmode-telemetry");
  assert.strictEqual(DELETE_URL, "https://pshah.fun/api/darkmode-telemetry-delete");
});

test("no request, no id and nothing stored before consent", async () => {
  const { usage, map, calls } = setup();
  await usage.recordDarkApplied(dark());
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(map.has("telemetryState"), false);
});

test("consent creates one id; turning on again keeps it", async () => {
  const { usage, map } = setup();
  await usage.setConsent(true);
  const s = map.get("telemetryState");
  assert.strictEqual(s.enabled, true);
  assert.strictEqual(s.id, ID);
  assert.strictEqual(s.consentVersion, 2);
  await usage.setConsent(true);
  assert.strictEqual(map.get("telemetryState").id, ID);
});

test("the first dark-mode event of the day sends one valid report", async () => {
  const { usage, ingests, calls } = setup();
  await usage.setConsent(true);
  await usage.recordDarkApplied(dark("css", "a.example.com"));
  assert.strictEqual(ingests().length, 1);
  const body = ingests()[0].body;
  assert.deepStrictEqual(Object.keys(body).sort(), ["day", "engines", "id", "sites", "version"]);
  assert.strictEqual(body.id, ID);
  assert.strictEqual(body.day, "2026-10-20");
  assert.strictEqual(body.version, "2.1.0");
  assert.deepStrictEqual(body.engines, { auto: false, css: true, invert: false });
  assert.strictEqual(body.sites, 1);
  assert.ok(validateReport(body));
  assert.ok(calls.every((c) => c.url === INGEST_URL || c.url === DELETE_URL));
});

test("repeating the same site and engine sends nothing more", async () => {
  const { usage, ingests, advance } = setup();
  await usage.setConsent(true);
  await usage.recordDarkApplied(dark());
  await usage.recordDarkApplied(dark());
  advance(3 * 60 * MIN);
  await usage.recordDarkApplied(dark());
  assert.strictEqual(ingests().length, 1);
});

test("a changed count refreshes the day's report, at most once an hour", async () => {
  const { usage, ingests, advance } = setup();
  await usage.setConsent(true);
  await usage.recordDarkApplied(dark("auto", "a.example.com"));
  advance(10 * MIN);
  await usage.recordDarkApplied(dark("auto", "b.example.com"));
  assert.strictEqual(ingests().length, 1, "within the hour: no refresh yet");
  advance(61 * MIN);
  await usage.recordDarkApplied(dark("auto", "c.example.com"));
  assert.strictEqual(ingests().length, 2);
  assert.strictEqual(ingests()[1].body.sites, 3);
  assert.strictEqual(ingests()[1].body.day, "2026-10-20");
});

test("a new engine also counts as a change", async () => {
  const { usage, ingests, advance } = setup();
  await usage.setConsent(true);
  await usage.recordDarkApplied(dark("auto", "a.example.com"));
  advance(61 * MIN);
  await usage.recordDarkApplied(dark("invert", "a.example.com"));
  assert.strictEqual(ingests().length, 2);
  assert.deepStrictEqual(ingests()[1].body.engines, { auto: true, css: false, invert: true });
});

test("a new UTC day sends again with a fresh tally", async () => {
  const { usage, ingests, advance } = setup({ start: "2026-10-20T23:00:00Z" });
  await usage.setConsent(true);
  await usage.recordDarkApplied(dark("auto", "a.example.com"));
  await usage.recordDarkApplied(dark("auto", "b.example.com"));
  advance(2 * 60 * MIN);
  await usage.recordDarkApplied(dark("css", "c.example.com"));
  assert.strictEqual(ingests().length, 2);
  assert.strictEqual(ingests()[1].body.day, "2026-10-21");
  assert.strictEqual(ingests()[1].body.sites, 1);
  assert.deepStrictEqual(ingests()[1].body.engines, { auto: false, css: true, invert: false });
});

test("a failed send is retried on a later event, not immediately", async () => {
  for (const bad of [{ ok: false, status: 500 }, new Error("offline")]) {
    const { usage, ingests, advance } = setup({ responses: [bad] });
    await usage.setConsent(true);
    await usage.recordDarkApplied(dark());
    assert.strictEqual(ingests().length, 1);
    await usage.recordDarkApplied(dark());
    assert.strictEqual(ingests().length, 1, "no retry within 5 minutes");
    advance(6 * MIN);
    await usage.recordDarkApplied(dark());
    assert.strictEqual(ingests().length, 2);
    advance(2 * 60 * MIN);
    await usage.recordDarkApplied(dark());
    assert.strictEqual(ingests().length, 2, "success is not repeated");
  }
});

test("concurrent events cause a single request", async () => {
  const { usage, ingests } = setup();
  await usage.setConsent(true);
  await Promise.all([usage.recordDarkApplied(dark()), usage.recordDarkApplied(dark("auto", "b.example.com"))]);
  assert.strictEqual(ingests().length, 1);
});

test("an unknown engine is ignored but the site still counts", async () => {
  const { usage, ingests } = setup();
  await usage.setConsent(true);
  await usage.recordDarkApplied({ engine: "bogus", host: "a.example.com" });
  assert.deepStrictEqual(ingests()[0].body.engines, { auto: false, css: false, invert: false });
  assert.strictEqual(ingests()[0].body.sites, 1);
});

test("a storage failure never rejects", async () => {
  const { usage } = setup();
  await usage.setConsent(true);
  const broken = createUsage({
    storage: { get: async () => { throw new Error("x"); }, set: async () => { throw new Error("x"); }, remove: async () => { throw new Error("x"); } },
    post: async () => ({ ok: true }), now: () => new Date(), version: "2.1.0", randomUUID: () => ID,
  });
  await broken.recordDarkApplied(dark());
  assert.deepStrictEqual(await broken.status(), { enabled: false, consentNeeded: null });
  assert.deepStrictEqual(await broken.setConsent(true), { ok: false });
  assert.deepStrictEqual(await broken.retryPendingDelete(), { serverConfirmed: false });
});

test("the stored state never holds a readable host name", async () => {
  const { usage, map } = setup();
  await usage.setConsent(true);
  await usage.recordDarkApplied(dark("auto", "secret-site.example.com"));
  assert.ok(!JSON.stringify([...map.entries()]).includes("secret-site"));
});

test("status: new install asks, decided stops asking, enabled reports on", async () => {
  const { usage } = setup();
  assert.deepStrictEqual(await usage.status(), { enabled: false, consentNeeded: "ask" });
  await usage.setConsent(false);
  assert.deepStrictEqual(await usage.status(), { enabled: false, consentNeeded: null });
  await usage.setConsent(true);
  assert.deepStrictEqual(await usage.status(), { enabled: true, consentNeeded: null });
});

test("a 2.0.x opt-in sends nothing until they confirm, then keeps their id", async () => {
  const { usage, ingests, map } = setup({ initial: { telemetryState: { enabled: true, id: ID, lastSentDay: "2026-10-01", tally: null } } });
  await usage.recordDarkApplied(dark());
  assert.strictEqual(ingests().length, 0);
  assert.deepStrictEqual(await usage.status(), { enabled: false, consentNeeded: "reconfirm" });
  await usage.setConsent(true);
  assert.strictEqual(map.get("telemetryState").id, ID);
  assert.strictEqual(map.get("telemetryState").consentVersion, 2);
  await usage.recordDarkApplied(dark());
  assert.strictEqual(ingests().length, 1);
  assert.strictEqual(ingests()[0].body.id, ID);
  assert.deepStrictEqual(await usage.status(), { enabled: true, consentNeeded: null });
});

test("a 2.0.x opt-in who declines has their data deleted and the id forgotten", async () => {
  const { usage, deletes, map } = setup({ initial: { telemetryState: { enabled: true, id: ID } } });
  const res = await usage.setConsent(false);
  assert.deepStrictEqual(deletes().map((c) => c.body), [{ id: ID }]);
  assert.strictEqual(res.serverConfirmed, true);
  assert.strictEqual(map.has("telemetryState"), false);
  assert.deepStrictEqual(await usage.status(), { enabled: false, consentNeeded: null });
});

test("turning off deletes by id and forgets it; turning on again makes a new id", async () => {
  const { usage, deletes, map } = setup();
  await usage.setConsent(true);
  await usage.setConsent(false);
  assert.deepStrictEqual(deletes().map((c) => c.body), [{ id: ID }]);
  assert.strictEqual(map.has("telemetryState"), false);
  await usage.setConsent(true);
  assert.strictEqual(map.get("telemetryState").id, ID2);
});

test("turning off when it was never on makes no request", async () => {
  const { usage, calls } = setup();
  const res = await usage.setConsent(false);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(res.ok, true);
});

test("nothing is sent after turning off", async () => {
  const { usage, ingests } = setup();
  await usage.setConsent(true);
  await usage.setConsent(false);
  await usage.recordDarkApplied(dark());
  assert.strictEqual(ingests().length, 0);
});

test("a failed delete keeps the id as pending and a later retry clears it", async () => {
  const { usage, map, deletes } = setup({ responses: [{ ok: false, status: 500 }] });
  await usage.setConsent(true);
  const res = await usage.setConsent(false);
  assert.strictEqual(res.serverConfirmed, false);
  assert.deepStrictEqual(map.get("telemetryState"), { enabled: false, pendingDeleteIds: [ID] });
  await usage.retryPendingDelete();
  assert.strictEqual(deletes().length, 2);
  assert.strictEqual(map.has("telemetryState"), false);
});

test("a 400 from delete drops the id instead of retrying forever", async () => {
  const { usage, map, deletes } = setup({ initial: { telemetryState: { enabled: true, id: ID } }, responses: [{ ok: false, status: 400 }] });
  await usage.setConsent(false);
  assert.strictEqual(deletes().length, 1);
  assert.strictEqual(map.has("telemetryState"), false);
});

test("other client errors and thrown errors are retried", async () => {
  for (const r of [{ ok: false, status: 403 }, { ok: false, status: 404 }, { ok: false, status: 429 }, new Error("offline")]) {
    const { usage, map } = setup({ initial: { telemetryState: { enabled: true, id: ID } }, responses: [r] });
    await usage.setConsent(false);
    assert.deepStrictEqual(map.get("telemetryState"), { enabled: false, pendingDeleteIds: [ID] }, String(r.status || r.message));
  }
});

test("pending ids are all sent; only the failures are kept", async () => {
  const { usage, deletes, map } = setup({
    initial: { telemetryState: { enabled: false, pendingDeleteIds: [ID, ID2] } },
    responses: [{ ok: true, status: 204 }, { ok: false, status: 503 }],
  });
  await usage.retryPendingDelete();
  assert.deepStrictEqual(deletes().map((c) => c.body.id), [ID, ID2]);
  assert.deepStrictEqual(map.get("telemetryState"), { enabled: false, pendingDeleteIds: [ID2] });
});

test("retryPendingDelete with nothing pending makes no request", async () => {
  const { usage, calls } = setup({ initial: { telemetryState: { enabled: true, id: ID, consentVersion: 2 } } });
  await usage.retryPendingDelete();
  assert.strictEqual(calls.length, 0);
});

test("garbage state sends nothing and is cleared on opt-out", async () => {
  const { usage, calls, map } = setup({ initial: { telemetryState: { enabled: true, id: 7, pendingDeleteIds: [null, "", 5] } } });
  await usage.setConsent(false);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(map.has("telemetryState"), false);
});

test("postJson sends JSON with credentials omitted, no referrer, and a timeout signal", async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push({ url, init }); return { ok: true, status: 204 }; };
  try {
    const res = await postJson("https://pshah.fun/x", { a: 1 });
    assert.strictEqual(res.ok, true);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.strictEqual(seen.length, 1);
  const { init } = seen[0];
  assert.strictEqual(init.method, "POST");
  assert.strictEqual(init.credentials, "omit");
  assert.strictEqual(init.referrerPolicy, "no-referrer");
  assert.strictEqual(init.headers["Content-Type"], "application/json");
  assert.strictEqual(init.body, JSON.stringify({ a: 1 }));
  assert.ok(init.signal && typeof init.signal.aborted === "boolean");
});

console.log("\nUsage sender");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
