// tests/usage_backend_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as be from "../backend/telemetry/lib/schema.js";
import { createHandler } from "../backend/telemetry/api/darkmode-telemetry.js";
import { MAX_BODY_BYTES } from "../backend/telemetry/lib/http.js";
import { validateReport, FEATURE_KEYS, MAX_FEATURE_COUNT, SURFACES, MAX_SURFACE_ENTRIES } from "../src/shared/usageReport.js";

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

// ---- featureUses (6-key form) ----
const TOOL_KEYS = ["tool_merge", "tool_split", "tool_extract", "tool_remove", "tool_reorder", "tool_rotate",
  "tool_images_to_pdf", "tool_page_numbers", "tool_watermark", "tool_strip_metadata", "tool_color_copy_dark",
  "tool_color_copy_sepia", "tool_color_copy_gray"];
const fu = (featureUses) => ({ ...report(), featureUses });
const FU_VALID = [
  fu({ viewer_pdf: 3, export_md_html: 999 }), fu({ viewer_pdf: 1 }),
  fu(Object.fromEntries(FEATURE_KEYS.map((k) => [k, MAX_FEATURE_COUNT]))),
];
const FU_INVALID = [
  { nope: 1 }, { __proto__x: 1 }, { viewer_pdf: 0 }, { viewer_pdf: 1000 }, { viewer_pdf: 1.5 },
  { viewer_pdf: "3" }, { viewer_pdf: null }, { viewer_pdf: {} }, { viewer_pdf: [1] }, { viewer_pdf: -1 },
  {}, [], null, "x", 5, { constructor: 1 }, { toString: 1 }, { hasOwnProperty: 1 }, { valueOf: 1 }, { "": 1 },
  JSON.parse('{"__proto__":1}'), JSON.parse('{"viewer_pdf":1,"__proto__":1}'), JSON.parse('{"__proto__":{"viewer_pdf":1}}'),
].map(fu).concat([
  { ...fu({ viewer_pdf: 1 }), extra: 1 },
  JSON.parse(`{"id":"${ID}","day":"2026-10-20","version":"2.1.0","engines":{"auto":true,"css":false,"invert":false},"sites":3,"__proto__":{"viewer_pdf":1}}`),
  JSON.parse(`{"id":"${ID}","day":"2026-10-20","version":"2.1.0","engines":{"auto":true,"css":false,"invert":false},"sites":3,"featureUses":{"viewer_pdf":1},"__proto__":1}`),
]);

test("featureUses: validateUsage and validateReport agree on every 6-key case", () => {
  for (const c of [...FU_VALID, ...FU_INVALID]) {
    assert.strictEqual(be.validateUsage(c), validateReport(c), JSON.stringify(c));
  }
  for (const c of FU_VALID) assert.strictEqual(be.validateUsage(c), true, JSON.stringify(c));
  for (const c of FU_INVALID) assert.strictEqual(be.validateUsage(c), false, JSON.stringify(c));
});

test("FEATURE_KEYS_ACCEPTED is exactly the extension's FEATURE_KEYS plus the reserved tool_* keys", () => {
  assert.strictEqual(FEATURE_KEYS.length, 44);
  for (const k of FEATURE_KEYS) assert.ok(be.FEATURE_KEYS_ACCEPTED.includes(k), k);
  for (const k of TOOL_KEYS) assert.ok(be.FEATURE_KEYS_ACCEPTED.includes(k), k);
  assert.strictEqual(be.FEATURE_KEYS_ACCEPTED.length, FEATURE_KEYS.length + TOOL_KEYS.length);
  assert.strictEqual(be.FEATURE_KEYS_ACCEPTED.length, 57);
  assert.strictEqual(new Set(be.FEATURE_KEYS_ACCEPTED).size, be.FEATURE_KEYS_ACCEPTED.length);
  assert.ok(Object.isFrozen(be.FEATURE_KEYS_ACCEPTED));
  assert.strictEqual(be.MAX_FEATURE_COUNT, MAX_FEATURE_COUNT);
});

test("reserved tool_* keys are accepted by the backend only", () => {
  for (const k of TOOL_KEYS) {
    assert.strictEqual(be.validateUsage(fu({ [k]: 2 })), true, k);
    assert.strictEqual(validateReport(fu({ [k]: 2 })), false, k);
    assert.strictEqual(be.validateUsage(fu({ [k]: 1000 })), false, k);
  }
});

test("a 6-key report is stored with feature_counts", async () => {
  const store = fakeStore();
  const res = await call(createHandler({ store, now: () => NOW }), fu({ viewer_pdf: 2, tool_merge: 1 }));
  assert.strictEqual(res.statusCode, 204);
  assert.deepStrictEqual(store.rows[0], {
    install_id: ID, day: "2026-10-20", version: "2.1.0",
    engines: { auto: true, css: false, invert: false },
    sites_darkened: 3,
    feature_counts: { viewer_pdf: 2, tool_merge: 1 },
  });
});

test("a 2.1/2.2 five-field report still returns 204 and never touches feature_counts", async () => {
  const store = fakeStore();
  const res = await call(createHandler({ store, now: () => NOW }), report({ version: "2.2.0" }));
  assert.strictEqual(res.statusCode, 204);
  assert.ok(!("feature_counts" in store.rows[0]));
});

test("bad featureUses returns 400 and nothing is stored", async () => {
  for (const bad of FU_INVALID) {
    const store = fakeStore();
    const res = await call(createHandler({ store, now: () => NOW }), bad);
    assert.strictEqual(res.statusCode, 400, JSON.stringify(bad));
    assert.strictEqual(store.rows.length, 0);
  }
});

test("usage_v3.sql adds feature_counts idempotently with an object-or-null check", () => {
  const sql = fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase/usage_v3.sql"), "utf8").toLowerCase();
  assert.ok(/alter table heartbeats add column if not exists feature_counts jsonb/.test(sql));
  assert.ok(/feature_counts is null or jsonb_typeof\(feature_counts\) = 'object'/.test(sql));
});

test("the public stats never mention feature_counts", () => {
  const sql = fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase/public_stats.sql"), "utf8").toLowerCase();
  assert.ok(!sql.includes("feature_counts"));
  assert.ok(!sql.includes("featureuses"));
});

// ---- surfaceUses (consent v4: 5 + surfaceUses, or 7-key with featureUses) ----
const su = (surfaceUses, featureUses) => (featureUses === undefined
  ? { ...report(), surfaceUses } : { ...report(), featureUses, surfaceUses });
const ALL_SURFACE_KEYS = FEATURE_KEYS.flatMap((f) => SURFACES.map((s) => `${f}__${s}`));
const manyKeys = (n) => Object.fromEntries(ALL_SURFACE_KEYS.slice(0, n).map((k) => [k, MAX_FEATURE_COUNT]));
const SU_VALID = [
  su({ dark_applied__web_other: 3 }),
  su({ export_pdf_txt__local_pdf: 1, viewer_pdf__web_pdf: 999 }),
  su({ dark_applied__google_docs: 2 }, { dark_applied: 2 }),
  su(manyKeys(MAX_SURFACE_ENTRIES)),
  su(manyKeys(MAX_SURFACE_ENTRIES), Object.fromEntries(FEATURE_KEYS.map((k) => [k, 1]))),
  ...SURFACES.map((s) => su({ [`toggle_on__${s}`]: 1 })),
];
const SU_BAD_MAPS = [
  { "a__b__c": 1 }, { __x: 1 }, { x__: 1 }, { viewer_pdf__nope: 1 }, { nope__web_other: 1 },
  JSON.parse('{"__proto__":1}'), JSON.parse('{"viewer_pdf__web_other":1,"__proto__":1}'),
  JSON.parse('{"__proto__":{"viewer_pdf__web_other":1}}'),
  { constructor__web_other: 1 }, { toString__web_other: 1 }, { viewer_pdf__constructor: 1 }, { viewer_pdf__proto__: 1 },
  { viewer_pdf__web_other: 0 }, { viewer_pdf__web_other: 1000 }, { viewer_pdf__web_other: 1.5 },
  { viewer_pdf__web_other: "3" }, { viewer_pdf__web_other: null }, { viewer_pdf__web_other: {} },
  { viewer_pdf__web_other: [1] }, { viewer_pdf__web_other: -1 },
  { viewer_pdf: 1 }, { viewer_pdf__: 1 }, { __web_other: 1 }, { viewer_pdf___web_other: 1 },
  { viewer_pdf__web_other__web_other: 1 }, { VIEWER_PDF__web_other: 1 }, { viewer_pdf__WEB_OTHER: 1 },
  { "viewer_pdf__web_other ": 1 }, { "viewer_pdf_web_other": 1 }, { "": 1 }, { "__": 1 },
  {}, [], null, "x", 5, [["viewer_pdf__web_other", 1]],
  manyKeys(MAX_SURFACE_ENTRIES + 1),
];
const SU_INVALID = SU_BAD_MAPS.map((m) => su(m)).concat(
  SU_BAD_MAPS.map((m) => su(m, { viewer_pdf: 1 })),
  [
    su({ viewer_pdf__web_other: 1 }, { nope: 1 }),
    su({ viewer_pdf__web_other: 1 }, {}),
    { ...su({ viewer_pdf__web_other: 1 }, { viewer_pdf: 1 }), extra: 1 },
    { ...su({ viewer_pdf__web_other: 1 }), sites: -1 },
    JSON.parse(`{"id":"${ID}","day":"2026-10-20","version":"2.1.0","engines":{"auto":true,"css":false,"invert":false},"sites":3,"__proto__":{"surfaceUses":{"viewer_pdf__web_other":1}}}`),
    JSON.parse(`{"id":"${ID}","day":"2026-10-20","version":"2.1.0","engines":{"auto":true,"css":false,"invert":false},"sites":3,"surfaceUses":{"viewer_pdf__web_other":1},"__proto__":1}`),
    { ...report(), surfaceuses: { viewer_pdf__web_other: 1 } },
  ],
);
// Only meaningful in-process: JSON serialisation drops an undefined field, so it cannot reach the handler.
const SU_INVALID_IN_PROCESS = [{ ...report(), surfaceUses: undefined }, { ...report(), featureUses: undefined }];

test("surfaceUses: validateUsage and validateReport agree on every 5+surfaceUses and 7-key case", () => {
  assert.strictEqual(ALL_SURFACE_KEYS.length, 44 * 9);
  for (const c of [...SU_VALID, ...SU_INVALID, ...SU_INVALID_IN_PROCESS]) {
    assert.strictEqual(be.validateUsage(c), validateReport(c), JSON.stringify(c));
  }
  for (const c of SU_VALID) assert.strictEqual(be.validateUsage(c), true, JSON.stringify(c));
  for (const c of [...SU_INVALID, ...SU_INVALID_IN_PROCESS]) assert.strictEqual(be.validateUsage(c), false, JSON.stringify(c));
});

test("SURFACES_ACCEPTED is exactly the extension's 9 SURFACES and MAX_SURFACE_ENTRIES matches", () => {
  assert.deepStrictEqual([...be.SURFACES_ACCEPTED], [...SURFACES]);
  assert.deepStrictEqual([...be.SURFACES_ACCEPTED], ["google_docs", "google_sheets", "google_slides", "web_pdf",
    "local_pdf", "local_sheet", "local_doc", "web_other", "other"]);
  assert.ok(Object.isFrozen(be.SURFACES_ACCEPTED));
  assert.strictEqual(be.MAX_SURFACE_ENTRIES, MAX_SURFACE_ENTRIES);
  assert.strictEqual(be.MAX_SURFACE_ENTRIES, 120);
  for (const k of [...be.FEATURE_KEYS_ACCEPTED, ...be.SURFACES_ACCEPTED]) {
    assert.ok(/^[a-z0-9_]+$/.test(k) && !k.includes("__"), k);
  }
});

test("reserved tool_* surface keys are accepted by the backend only", () => {
  for (const k of TOOL_KEYS) {
    const r = su({ [`${k}__local_pdf`]: 2 });
    assert.strictEqual(be.validateUsage(r), true, k);
    assert.strictEqual(validateReport(r), false, k);
    assert.strictEqual(be.validateUsage(su({ [`${k}__local_pdf`]: 1000 })), false, k);
    assert.strictEqual(be.validateUsage(su({ [`${k}__nope`]: 1 })), false, k);
  }
});

test("a 7-key report is stored with feature_counts and surface_counts", async () => {
  const store = fakeStore();
  const res = await call(createHandler({ store, now: () => NOW }),
    su({ dark_applied__web_other: 4, viewer_pdf__local_pdf: 1 }, { dark_applied: 4, viewer_pdf: 1 }));
  assert.strictEqual(res.statusCode, 204);
  assert.deepStrictEqual(store.rows[0], {
    install_id: ID, day: "2026-10-20", version: "2.1.0",
    engines: { auto: true, css: false, invert: false },
    sites_darkened: 3,
    feature_counts: { dark_applied: 4, viewer_pdf: 1 },
    surface_counts: { dark_applied__web_other: 4, viewer_pdf__local_pdf: 1 },
  });
});

test("a 5+surfaceUses report stores surface_counts and leaves feature_counts untouched", async () => {
  const store = fakeStore();
  const res = await call(createHandler({ store, now: () => NOW }), su({ toggle_on__google_docs: 2 }));
  assert.strictEqual(res.statusCode, 204);
  assert.deepStrictEqual(store.rows[0].surface_counts, { toggle_on__google_docs: 2 });
  assert.ok(!("feature_counts" in store.rows[0]));
});

test("5-field and v3 6-field reports still return 204 and never touch surface_counts", async () => {
  for (const r of [report({ version: "2.2.0" }), fu({ viewer_pdf: 2 }), fu({ dark_applied: 1, theme_custom: 3 })]) {
    const store = fakeStore();
    const res = await call(createHandler({ store, now: () => NOW }), r);
    assert.strictEqual(res.statusCode, 204, JSON.stringify(r));
    assert.ok(!("surface_counts" in store.rows[0]), JSON.stringify(r));
  }
});

test("bad surfaceUses returns 400 (413 when also over the body limit) and nothing is stored", async () => {
  for (const bad of SU_INVALID) {
    const store = fakeStore();
    const res = await call(createHandler({ store, now: () => NOW }), bad);
    const big = Buffer.byteLength(JSON.stringify(bad) || "", "utf8") > MAX_BODY_BYTES;
    assert.strictEqual(res.statusCode, big ? 413 : 400, JSON.stringify(bad));
    assert.strictEqual(store.rows.length, 0);
  }
});

test("usage_v4.sql adds surface_counts idempotently with an object-or-null check", () => {
  const sql = fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase/usage_v4.sql"), "utf8").toLowerCase();
  assert.ok(/alter table heartbeats add column if not exists surface_counts jsonb/.test(sql));
  assert.ok(/surface_counts is null or jsonb_typeof\(surface_counts\) = 'object'/.test(sql));
  assert.ok(!/\b(drop|delete|truncate|update)\b/.test(sql.replace(/^--.*$/gm, "")), "additive only");
});

test("the public stats never mention surface_counts", () => {
  const sql = fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase/public_stats.sql"), "utf8").toLowerCase();
  assert.ok(!sql.includes("surface_counts"));
  assert.ok(!sql.includes("surfaceuses"));
  assert.ok(!sql.includes("surface_uses"));
  const pub = fs.readFileSync(path.join(ROOT, "backend/telemetry/lib/publicStats.js"), "utf8").toLowerCase();
  assert.ok(!/surface_counts|surfaceuses|surface_uses/.test(pub));
});

test("the README gives the v4 deploy order and warns about the old dashboard", () => {
  const readme = fs.readFileSync(path.join(ROOT, "backend/telemetry/README.md"), "utf8");
  const a = readme.indexOf("supabase/usage_v4.sql");
  assert.ok(a > -1, "usage_v4.sql must be documented");
  const sec = readme.slice(a, a + 1600);
  const b = sec.indexOf("daily_stats.sql"), c = sec.indexOf("deploy"), d = sec.indexOf("release the extension");
  assert.ok(b > 0 && c > b && d > c, "order: usage_v4.sql -> daily_stats.sql -> deploy backend -> release extension");
  assert.ok(/old deployed owner dashboard rejects days that carry\s+`surfaceUses`/.test(readme));
});

console.log("\nUsage report backend");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
