// tests/telemetry_stats_test.mjs
// Public aggregate statistics: validatePublicStats (fail-closed document check) and the
// GET /api/darkmode-stats handler. Suppression itself lives in supabase/public_stats.sql.
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validatePublicStats, MIN_GROUP } from "../backend/telemetry/lib/publicStats.js";
import { createStatsHandler } from "../backend/telemetry/api/darkmode-stats.js";
import * as cors from "../backend/telemetry/lib/cors.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

const STATS_ORIGIN = "https://darkmode.pshah.fun";
const CACHE = "public, s-maxage=3600, stale-while-revalidate=600";

function dauDays(lastDay = "2026-10-13", n = 30) {
  const end = Date.parse(`${lastDay}T00:00:00Z`);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
  return out;
}

function fullDoc() {
  return {
    generatedAt: "2026-10-14T10:00:00Z",
    minGroup: 10,
    windowDays: 30,
    active: {
      dau: dauDays().map((day, i) => ({ day, count: i === 3 ? null : 20 + i })),
      wau: 41,
      mau: 60,
    },
    newVsReturning: {
      weeks: [
        { weekStart: "2026-09-14", new: 12, returning: 20 },
        { weekStart: "2026-09-21", new: null, returning: null },
        { weekStart: "2026-09-28", new: 10, returning: 30 },
        { weekStart: "2026-10-05", new: 11, returning: 33 },
      ],
    },
    retention: { d1: 55, d7: 30, d30: null },
    engines: { auto: 80, css: 25, invert: null },
    themes: { "builtin:midnight": 50, "builtin:oled": 20, custom: 17, other: 17 },
    features: { viewer: 40, editor: null, customCss: 17, sitePack: null },
    os: { mac: 40, windows: 35, linux: 17, other: 17 },
    chrome: { "130": 70, "129": 20, other: 17 },
    lang: { en: 60, de: 25, other: 17 },
  };
}

function emptyDoc() {
  return {
    generatedAt: "2026-10-14T10:00:00.123Z",
    minGroup: 10,
    windowDays: 30,
    active: { dau: dauDays().map((day) => ({ day, count: null })), wau: null, mau: null },
    newVsReturning: null,
    retention: null,
    engines: null,
    themes: null,
    features: null,
    os: null,
    chrome: null,
    lang: null,
  };
}

const clone = (o) => JSON.parse(JSON.stringify(o));
function mutated(fn) { const d = clone(fullDoc()); fn(d); return d; }

// ---- validatePublicStats -------------------------------------------------------------

test("MIN_GROUP is 10", () => {
  assert.strictEqual(MIN_GROUP, 10);
});

test("accepts a full valid document and an all-null (empty) document", () => {
  assert.strictEqual(validatePublicStats(fullDoc()), true);
  assert.strictEqual(validatePublicStats(emptyDoc()), true);
  assert.strictEqual(validatePublicStats(mutated((d) => { d.newVsReturning.weeks = []; })), true);
  assert.strictEqual(validatePublicStats(mutated((d) => { delete d.themes.other; })), true, "other is optional");
});

test("rejects non-objects", () => {
  for (const v of [null, undefined, [], "x", 5, true]) assert.strictEqual(validatePublicStats(v), false, String(v));
});

test("rejects counts under 10 or non-integer", () => {
  const bad = [
    (d) => { d.active.dau[0].count = 9; },
    (d) => { d.active.dau[0].count = 10.5; },
    (d) => { d.active.dau[0].count = 0; },
    (d) => { d.active.dau[0].count = "20"; },
    (d) => { d.active.wau = 9; },
    (d) => { d.active.mau = 10.5; },
    (d) => { d.newVsReturning.weeks[0].new = 9; },
    (d) => { d.newVsReturning.weeks[0].returning = -1; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
});

test("rejects shares outside 0..100 or non-integer", () => {
  const bad = [
    (d) => { d.engines.auto = 101; },
    (d) => { d.engines.css = -1; },
    (d) => { d.themes.custom = 12.5; },
    (d) => { d.retention.d1 = 101; },
    (d) => { d.os.mac = "40"; },
    (d) => { d.lang.en = true; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
});

test("rejects unknown extra keys and missing keys at every level", () => {
  const bad = [
    (d) => { d.extra = 1; },
    (d) => { delete d.lang; },
    (d) => { delete d.generatedAt; },
    (d) => { d.active.extra = 1; },
    (d) => { delete d.active.wau; },
    (d) => { d.active.dau[0].extra = 1; },
    (d) => { delete d.active.dau[0].count; },
    (d) => { d.newVsReturning.extra = 1; },
    (d) => { d.newVsReturning.weeks[0].total = 30; },
    (d) => { d.retention.d14 = 5; },
    (d) => { delete d.retention.d30; },
    (d) => { d.engines.extra = 5; },
    (d) => { delete d.engines.invert; },
    (d) => { d.features.extra = 5; },
    (d) => { delete d.features.viewer; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
});

test("rejects a wrong minGroup, windowDays or generatedAt", () => {
  const bad = [
    (d) => { d.minGroup = 5; },
    (d) => { d.windowDays = 7; },
    (d) => { d.generatedAt = "yesterday"; },
    (d) => { d.generatedAt = "2026-13-45T00:00:00Z"; },
    (d) => { d.generatedAt = 1760000000000; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
});

test("dau must have exactly 30 entries with valid consecutive days, oldest first", () => {
  const bad = [
    (d) => { d.active.dau.pop(); },
    (d) => { d.active.dau.push({ day: "2026-10-14", count: 20 }); },
    (d) => { d.active.dau[5].day = "2026-02-30"; },
    (d) => { d.active.dau[5].day = "20260920"; },
    (d) => { d.active.dau.reverse(); },
    (d) => { d.active.dau = {}; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
});

test("newVsReturning: at most 4 weeks, each weekStart a real Monday", () => {
  const bad = [
    (d) => { d.newVsReturning.weeks.push({ weekStart: "2026-10-12", new: 10, returning: 10 }); },
    (d) => { d.newVsReturning.weeks[0].weekStart = "2026-09-15"; },
    (d) => { d.newVsReturning.weeks[0].weekStart = "2026-02-30"; },
    (d) => { d.newVsReturning.weeks = null; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
});

test("newVsReturning: a week hides both numbers or neither", () => {
  const bad = [
    (d) => { d.newVsReturning.weeks[0] = { weekStart: "2026-09-14", new: null, returning: 50 }; },
    (d) => { d.newVsReturning.weeks[0] = { weekStart: "2026-09-14", new: 5, returning: null }; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
  assert.strictEqual(validatePublicStats(mutated(() => {})), true, "the valid fixture (with a both-null week) still passes");
});

test("category keys must match their safe patterns", () => {
  const bad = [
    (d) => { d.themes["github.com"] = 5; },
    (d) => { d.themes["builtin:Midnight"] = 5; },
    (d) => { d.os.beos = 5; },
    (d) => { d.chrome["13x"] = 5; },
    (d) => { d.lang.EN = 5; },
    (d) => { d.lang["en-US"] = 5; },
    (d) => { d.lang.engl = 5; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
  assert.strictEqual(validatePublicStats(mutated((d) => { d.os.chromeos = 20; d.lang.fil = 20; })), true);
});

test("rejects any string containing a UUID, '<' or 'http'", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";
  const bad = [
    (d) => { d.generatedAt = uuid; },
    (d) => { d.active.dau[0].day = uuid; },
    (d) => { d.themes[`builtin:${uuid}`] = 5; },
    (d) => { d.themes["builtin:<script>"] = 5; },
    (d) => { d.generatedAt = "<script>alert(1)</script>"; },
    (d) => { d.themes["builtin:http-x"] = 5; },
    (d) => { d.active.dau[0].day = "http://x"; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
});

test("an all-null section document requires every non-active section to be null or valid", () => {
  const d = emptyDoc();
  d.engines = { auto: 50 };
  assert.strictEqual(validatePublicStats(d), false);
});

test("MAU gate: when mau is null every non-active section must be null (probe rejected)", () => {
  const probe = emptyDoc();
  probe.engines = { auto: 3, css: null, invert: null };
  assert.strictEqual(validatePublicStats(probe), false, "engines with mau null");
  const probe2 = emptyDoc();
  probe2.themes = { "builtin:x": 1 };
  assert.strictEqual(validatePublicStats(probe2), false, "themes with mau null");
  for (const k of ["newVsReturning", "retention", "features", "os", "chrome", "lang"]) {
    const d = emptyDoc();
    d[k] = clone(fullDoc()[k]);
    assert.strictEqual(validatePublicStats(d), false, k);
  }
  const d = emptyDoc();
  d.active.wau = 12;
  assert.strictEqual(validatePublicStats(d), false, "wau with mau null");
  const d2 = emptyDoc();
  d2.active.dau[4].count = 12;
  assert.strictEqual(validatePublicStats(d2), false, "dau count with mau null");
});

test("a share too small to rest on 10 installs for the MAU is rejected", () => {
  // mau 60: 10 installs = 16.7% -> any share under 16 is impossible.
  const bad = [
    (d) => { d.themes["builtin:oled"] = 5; },
    (d) => { d.os.other = 8; },
    (d) => { d.chrome.other = 10; },
    (d) => { d.lang.de = 1; },
    (d) => { d.engines.css = 15; },
    (d) => { d.features.viewer = 0; },
    (d) => { d.active.mau = 1000; d.themes.custom = 0; },
  ];
  for (const f of bad) assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
});

test("engine/feature shares must also leave at least 10 installs that did not use them", () => {
  // mau 60: 55 of 60 = 92% leaves 5 non-users -> impossible; 50 of 60 = 83% is the maximum.
  for (const f of [(d) => { d.engines.auto = 92; }, (d) => { d.features.viewer = 100; }, (d) => { d.engines.css = 90; }]) {
    assert.strictEqual(validatePublicStats(mutated(f)), false, f.toString());
  }
  // Exclusive categories may legitimately be 100 (a single group).
  assert.strictEqual(validatePublicStats(mutated((d) => { d.os = { mac: 100 }; })), true);
});

test("legitimately rounded edge shares are accepted", () => {
  // mau 60: 10 installs -> 17%, 50 installs -> 83%.
  assert.strictEqual(validatePublicStats(mutated((d) => { d.themes.custom = 17; d.engines.auto = 83; d.features.viewer = 17; })), true);
  // mau 11: 10 installs -> 91%; 0 non-users allowed only for exclusive categories.
  const small = mutated((d) => {
    d.active.mau = 11; d.active.wau = 11; d.active.dau = d.active.dau.map((e) => ({ day: e.day, count: null }));
    d.engines = { auto: null, css: null, invert: null }; d.features = { viewer: null, editor: null, customCss: null, sitePack: null };
    d.themes = { "builtin:midnight": 100 }; d.os = { mac: 91 }; d.chrome = { "130": 100 }; d.lang = { en: 100 };
  });
  assert.strictEqual(validatePublicStats(small), true);
  // mau 20: 10 users and 10 non-users -> exactly 50 is allowed for flags.
  const twenty = mutated((d) => {
    d.active.mau = 20; d.active.wau = 20; d.active.dau = d.active.dau.map((e) => ({ day: e.day, count: null }));
    d.engines = { auto: 50, css: null, invert: null }; d.features = { viewer: 50, editor: null, customCss: null, sitePack: null };
    d.themes = { "builtin:midnight": 50, other: 50 }; d.os = { mac: 100 }; d.chrome = { "130": 100 }; d.lang = { en: 100 };
  });
  assert.strictEqual(validatePublicStats(twenty), true);
  assert.strictEqual(validatePublicStats({ ...twenty, engines: { auto: 55, css: null, invert: null } }), false);
});

// ---- handler -------------------------------------------------------------------------

function mkRes() {
  return { statusCode: null, ended: false, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this; },
    end(b) { this.ended = true; this.body = b; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
  };
}
// The request object throws on any access other than method, so a handler that reads a
// header (or the body, or the socket) fails the test.
function mkReq(method) {
  return new Proxy({ method }, {
    get(t, k) {
      if (k === "method") return t.method;
      if (k === "then" || typeof k === "symbol") return undefined;
      throw new Error(`handler read req.${String(k)}`);
    },
  });
}
async function call(h, method = "GET") { const res = mkRes(); await h(mkReq(method), res); return res; }
function fakeStore(doc = fullDoc()) {
  return { calls: 0, async getPublicStats() { this.calls++; return clone(doc); } };
}
function assertStatsCors(res, label) {
  assert.strictEqual(res.headers["access-control-allow-origin"], STATS_ORIGIN, `${label}: Allow-Origin`);
  assert.strictEqual(res.headers["access-control-allow-methods"], "GET, OPTIONS", `${label}: Allow-Methods`);
  assert.strictEqual(res.headers["vary"], "Origin", `${label}: Vary`);
  assert.ok(!("access-control-allow-credentials" in res.headers), `${label}: no credentials`);
}
const isEmptyBody = (b) => b === undefined || b === null || b === "";

test("STATS_ALLOWED_ORIGIN is the static site origin, never a wildcard", () => {
  assert.strictEqual(cors.STATS_ALLOWED_ORIGIN, STATS_ORIGIN);
  // The extension origin used by the ingest endpoints is unchanged.
  assert.strictEqual(cors.ALLOWED_ORIGIN, "chrome-extension://kmhhphbakbhohiohagkhhgdgfbplkfke");
});

test("GET: 200 JSON with cache and CORS headers", async () => {
  const store = fakeStore();
  const res = await call(createStatsHandler({ store }));
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(store.calls, 1);
  assert.strictEqual(res.headers["cache-control"], CACHE);
  assert.ok(/^application\/json/.test(res.headers["content-type"]));
  assertStatsCors(res, "GET");
  assert.deepStrictEqual(JSON.parse(res.body), fullDoc());
});

test("OPTIONS: 204 with CORS, no store access", async () => {
  const store = fakeStore();
  const res = await call(createStatsHandler({ store }), "OPTIONS");
  assert.strictEqual(res.statusCode, 204);
  assert.ok(res.ended);
  assert.ok(isEmptyBody(res.body));
  assertStatsCors(res, "OPTIONS");
  assert.strictEqual(store.calls, 0);
});

test("other methods: 405 with Allow: GET, OPTIONS and no store access", async () => {
  const store = fakeStore();
  const h = createStatsHandler({ store });
  for (const m of ["POST", "PUT", "DELETE", "PATCH", "HEAD"]) {
    const res = await call(h, m);
    assert.strictEqual(res.statusCode, 405, m);
    assert.strictEqual(res.headers["allow"], "GET, OPTIONS", m);
    assert.ok(isEmptyBody(res.body), m);
    assertStatsCors(res, m);
  }
  assert.strictEqual(store.calls, 0);
});

test("store throws: 500 with an empty body, no details, not publicly cached", async () => {
  const store = { async getPublicStats() { throw new Error("secret db detail"); } };
  const res = await call(createStatsHandler({ store }));
  assert.strictEqual(res.statusCode, 500);
  assert.ok(res.ended);
  assert.ok(isEmptyBody(res.body));
  assert.notStrictEqual(res.headers["cache-control"], CACHE);
  assertStatsCors(res, "500");
});

test("invalid document from the store: 500, empty body, never served", async () => {
  const bads = [
    mutated((d) => { d.active.mau = 9; }),
    mutated((d) => { d.themes["builtin:<script>"] = 5; }),
    mutated((d) => { d.leak = "123e4567-e89b-42d3-a456-426614174000"; }),
    null,
    "not json",
  ];
  for (const doc of bads) {
    const res = await call(createStatsHandler({ store: { async getPublicStats() { return doc; } } }));
    assert.strictEqual(res.statusCode, 500, JSON.stringify(doc).slice(0, 40));
    assert.ok(isEmptyBody(res.body));
    assert.notStrictEqual(res.headers["cache-control"], CACHE);
  }
});

test("createStatsHandler takes no clock: generatedAt comes from the database", () => {
  const text = fs.readFileSync(path.join(ROOT, "backend/telemetry/api/darkmode-stats.js"), "utf8");
  assert.ok(!/\bnow\b/.test(text.replace(/now\(\)/g, "")), "no unused now option");
  assert.ok(/export function createStatsHandler\(\{ store \} = \{\}\)/.test(text));
});

test("a req whose headers getter throws is still served (headers are never read)", async () => {
  const req = { method: "GET", get headers() { throw new Error("headers read"); }, get socket() { throw new Error("socket read"); } };
  const res = mkRes();
  await createStatsHandler({ store: fakeStore() })(req, res);
  assert.strictEqual(res.statusCode, 200);
});

test("default export reuses one module-level handler and wires the store lazily via rpc", () => {
  const text = fs.readFileSync(path.join(ROOT, "backend/telemetry/api/darkmode-stats.js"), "utf8");
  assert.ok(/^const handler = createStatsHandler\(\);/m.test(text));
  assert.ok(/^export default \(req, res\) => handler\(req, res\);/m.test(text));
  assert.ok(text.includes('rpc("public_stats")'));
  assert.ok(text.includes("createSupabaseClient"), "reuses the lazy client from lib/http.js");
  assert.ok(!/^\s*import\s[^;]*supabase-js/m.test(text));
  assert.ok(!text.includes(STATS_ORIGIN), "origin comes from lib/cors.js");
});

test("public_stats.sql defines a stable jsonb function callable only by the service role", () => {
  const sql = fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase/public_stats.sql"), "utf8");
  assert.ok(/create or replace function\s+public_stats\(\)\s+returns jsonb/i.test(sql));
  assert.ok(/language\s+(sql|plpgsql)/i.test(sql));
  assert.ok(/\bstable\b/i.test(sql));
  assert.ok(/revoke execute on function\s+public_stats\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql));
  assert.ok(!/security definer/i.test(sql), "runs with the caller's rights");
});

test("package.json chains the stats test into npm test exactly once", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.strictEqual(pkg.scripts["test:telemetrystats"], "node tests/telemetry_stats_test.mjs");
  assert.strictEqual(pkg.scripts.test.split("node tests/telemetry_stats_test.mjs").length - 1, 1);
});

console.log("=========================================");
console.log("Running Public Usage Stats Tests");
console.log("=========================================\n");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
