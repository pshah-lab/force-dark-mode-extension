// tests/usage_backend_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as be from "../backend/telemetry/lib/schema.js";
import { createHandler } from "../backend/telemetry/api/darkmode-telemetry.js";
import { validateReport } from "../src/shared/usageReport.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

const ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-10-20T10:00:00Z");
const report = (over = {}) => ({
  id: ID, day: "2026-10-20", version: "2.1.0",
  engines: { auto: true, css: false, invert: false },
  sites: 3,
  ...over,
});
const heartbeat = (over = {}) => ({
  id: ID, day: "2026-10-20", version: "2.0.0",
  env: { chrome: 130, os: "mac", lang: "en" },
  engines: { auto: true, css: false, invert: false },
  theme: "builtin:midnight",
  features: { viewer: false, editor: false, customCss: false, sitePack: false },
  ...over,
});

function fakeStore() {
  const rows = [];
  return { rows, async upsertHeartbeat(row) { rows.push(row); } };
}
function call(handler, body) {
  const res = { statusCode: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    end() { return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
  };
  return handler({ method: "POST", body }, res).then(() => res);
}

const VALID_CASES = [
  report(), report({ sites: 0 }), report({ sites: 9999 }),
  report({ engines: { auto: false, css: true, invert: true } }),
];
const INVALID_CASES = [
  { ...report(), extra: 1 }, { ...report(), sites: -1 }, { ...report(), sites: 10000 }, { ...report(), sites: 1.5 },
  { ...report(), sites: "3" }, { ...report(), id: "x" }, { ...report(), day: "2026-1-2" }, { ...report(), version: "2.1" },
  { ...report(), engines: { auto: true, css: false } }, { ...report(), engines: { auto: true, css: false, invert: 1 } },
  { ...report(), site: "example.com" }, null, [], "x",
];

test("validateUsage and the extension's validateReport agree on every case", () => {
  for (const c of [...VALID_CASES, ...INVALID_CASES]) {
    assert.strictEqual(be.validateUsage(c), validateReport(c), JSON.stringify(c));
  }
  for (const c of VALID_CASES) assert.strictEqual(be.validateUsage(c), true);
  for (const c of INVALID_CASES) assert.strictEqual(be.validateUsage(c), false);
});

test("a new-shape report is stored with sites_darkened and nothing else about the device", async () => {
  const store = fakeStore();
  const res = await call(createHandler({ store, now: () => NOW }), report());
  assert.strictEqual(res.statusCode, 204);
  assert.strictEqual(store.rows.length, 1);
  assert.deepStrictEqual(store.rows[0], {
    install_id: ID, day: "2026-10-20", version: "2.1.0",
    engines: { auto: true, css: false, invert: false },
    sites_darkened: 3,
  });
});

test("a 2.0.0 heartbeat is still accepted and stored exactly as before", async () => {
  const store = fakeStore();
  const res = await call(createHandler({ store, now: () => NOW }), heartbeat());
  assert.strictEqual(res.statusCode, 204);
  assert.deepStrictEqual(store.rows[0], {
    install_id: ID, day: "2026-10-20", version: "2.0.0",
    chrome: 130, os: "mac", lang: "en",
    engines: { auto: true, css: false, invert: false },
    theme: "builtin:midnight",
    features: { viewer: false, editor: false, customCss: false, sitePack: false },
  });
});

test("invalid reports are refused with 400 and nothing is stored", async () => {
  for (const bad of INVALID_CASES) {
    const store = fakeStore();
    const res = await call(createHandler({ store, now: () => NOW }), bad);
    assert.strictEqual(res.statusCode, 400, JSON.stringify(bad));
    assert.strictEqual(store.rows.length, 0);
  }
});

test("a day more than one day from today is refused", async () => {
  const store = fakeStore();
  const res = await call(createHandler({ store, now: () => NOW }), report({ day: "2026-10-18" }));
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(store.rows.length, 0);
});

test("a hybrid of both shapes is refused", async () => {
  const store = fakeStore();
  const res = await call(createHandler({ store, now: () => NOW }), { ...heartbeat(), sites: 3 });
  assert.strictEqual(res.statusCode, 400);
});

test("usage_v2.sql makes the new shape storable and keeps the views owner-only", () => {
  const sql = fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase/usage_v2.sql"), "utf8").toLowerCase();
  for (const col of ["chrome", "os", "lang", "theme", "features"]) {
    assert.ok(new RegExp(`alter column ${col}\\s+drop not null`).test(sql), `${col} must become nullable`);
  }
  assert.ok(/add column if not exists sites_darkened smallint/.test(sql));
  assert.ok(/sites_darkened between 0 and 9999/.test(sql));
  assert.ok(/create or replace view sites_distribution/.test(sql));
  assert.ok(/revoke all on sites_distribution from anon, authenticated/.test(sql));
});

test("the public stats function counts 2.0.0 heartbeats only, never 2.1.0 usage reports", () => {
  const sql = fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase/public_stats.sql"), "utf8").toLowerCase();
  const hb = sql.match(/hb as \(([\s\S]*?)\),\s*w as/);
  assert.ok(hb, "the hb CTE must be found");
  assert.ok(/h\.sites_darkened is null/.test(hb[1]), "2.1.0 rows (sites_darkened set) must be excluded from the published totals");
});

test("the README says to run usage_v2.sql before re-running public_stats.sql", () => {
  const readme = fs.readFileSync(path.join(ROOT, "backend/telemetry/README.md"), "utf8");
  const i = readme.indexOf("usage_v2.sql");
  assert.ok(i > -1 && /before[^.\n]*public_stats\.sql|public_stats\.sql[^.\n]*after/i.test(readme), "order must be stated");
});

console.log("\nUsage report backend");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
