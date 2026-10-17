// tests/legacy_cleanup_test.mjs
import assert from "assert";
import { createLegacyCleanup, DELETE_URL } from "../src/background/legacyTelemetryCleanup.js";
import { postJson } from "../src/background/network.js";

const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

const ID = "123e4567-e89b-42d3-a456-426614174000";
const ID2 = "223e4567-e89b-42d3-a456-426614174000";

function setup(initial = {}, responses = []) {
  const map = new Map(Object.entries(initial));
  const storage = {
    get: async (k) => map.get(k),
    remove: async (k) => { map.delete(k); },
    set: async (k, v) => { map.set(k, JSON.parse(JSON.stringify(v))); },
  };
  const calls = [];
  let i = 0;
  const post = async (url, body) => {
    calls.push({ url, body });
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return r || { ok: true, status: 204 };
  };
  return { cleanup: createLegacyCleanup({ storage, post }), map, calls };
}

test("the delete endpoint is the exact first-party URL", () => {
  assert.strictEqual(DELETE_URL, "https://pshah.fun/api/darkmode-telemetry-delete");
});

test("nothing stored: no request, result none", async () => {
  const { cleanup, calls } = setup();
  assert.strictEqual(await cleanup.run(), "none");
  assert.strictEqual(calls.length, 0);
});

test("a 2.0.x opt-in: one DELETE with the stored id, then both keys are removed", async () => {
  const { cleanup, calls, map } = setup({
    telemetryState: { enabled: true, id: ID, lastSentDay: null, tally: null },
    telemetryPromptState: { decided: true, opens: 5 },
  });
  assert.strictEqual(await cleanup.run(), "deleted");
  assert.deepStrictEqual(calls, [{ url: DELETE_URL, body: { id: ID } }]);
  assert.strictEqual(map.has("telemetryState"), false);
  assert.strictEqual(map.has("telemetryPromptState"), false);
});

test("a server error keeps the id so the next start retries; success then clears it", async () => {
  const { cleanup, calls, map } = setup(
    { telemetryState: { enabled: true, id: ID } },
    [{ ok: false, status: 500 }]
  );
  assert.strictEqual(await cleanup.run(), "retry");
  assert.deepStrictEqual(map.get("telemetryState"), { enabled: false, pendingDeleteIds: [ID] });
  assert.strictEqual(await cleanup.run(), "deleted");
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(map.has("telemetryState"), false);
});

test("a 400 means the server will never accept this id, so it is dropped instead of retried forever", async () => {
  const { cleanup, calls, map } = setup({ telemetryState: { enabled: true, id: ID } }, [{ ok: false, status: 400 }]);
  assert.strictEqual(await cleanup.run(), "deleted");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(map.has("telemetryState"), false);
});

test("other client errors (403, 404, 429) are still retried", async () => {
  for (const status of [403, 404, 429]) {
    const { cleanup, map } = setup({ telemetryState: { enabled: true, id: ID } }, [{ ok: false, status }]);
    assert.strictEqual(await cleanup.run(), "retry", String(status));
    assert.deepStrictEqual(map.get("telemetryState"), { enabled: false, pendingDeleteIds: [ID] });
  }
});

test("a thrown network error is a retry, never an exception", async () => {
  const { cleanup, map } = setup({ telemetryState: { enabled: true, id: ID } }, [new Error("offline")]);
  assert.strictEqual(await cleanup.run(), "retry");
  assert.deepStrictEqual(map.get("telemetryState"), { enabled: false, pendingDeleteIds: [ID] });
});

test("pending delete ids from an earlier opt-out are sent too; only the failures are kept", async () => {
  const { cleanup, calls, map } = setup(
    { telemetryState: { enabled: false, pendingDeleteIds: [ID, ID2] } },
    [{ ok: true, status: 204 }, { ok: false, status: 503 }]
  );
  assert.strictEqual(await cleanup.run(), "retry");
  assert.deepStrictEqual(calls.map((c) => c.body.id), [ID, ID2]);
  assert.deepStrictEqual(map.get("telemetryState"), { enabled: false, pendingDeleteIds: [ID2] });
});

test("only the prompt key left: removed without a request", async () => {
  const { cleanup, calls, map } = setup({ telemetryPromptState: { decided: false, opens: 2 } });
  assert.strictEqual(await cleanup.run(), "none");
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(map.has("telemetryPromptState"), false);
});

test("garbage state (non-string id, junk pending list) sends nothing and is cleared", async () => {
  const { cleanup, calls, map } = setup({ telemetryState: { enabled: true, id: 7, pendingDeleteIds: [null, "", 5] } });
  assert.strictEqual(await cleanup.run(), "none");
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

console.log("\nLegacy opt-in cleanup");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
