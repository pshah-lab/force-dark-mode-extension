// tests/usage_report_test.mjs
import assert from "assert";
import {
  ENGINES,
  MAX_SITES,
  utcDay,
  hashSite,
  emptyTally,
  recordEngine,
  recordSite,
  buildReport,
  validateReport,
  isUuid,
} from "../src/shared/usageReport.js";

const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

const ID = "123e4567-e89b-42d3-a456-426614174000";
const good = () => ({
  id: ID,
  day: "2026-10-20",
  version: "2.1.0",
  engines: { auto: true, css: false, invert: false },
  sites: 3,
});

test("constants", () => {
  assert.deepStrictEqual(ENGINES, ["auto", "css", "invert"]);
  assert.strictEqual(MAX_SITES, 9999);
});

test("utcDay uses the UTC date", () => {
  assert.strictEqual(utcDay(new Date("2026-10-20T23:59:59Z")), "2026-10-20");
  assert.strictEqual(utcDay(new Date("2026-10-21T00:00:00Z")), "2026-10-21");
});

test("hashSite is case-insensitive, stable and distinguishes hosts", () => {
  assert.strictEqual(hashSite("Example.com"), hashSite("example.com"));
  assert.notStrictEqual(hashSite("example.com"), hashSite("example.org"));
  const h = hashSite("example.com");
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
});

test("recordSite counts a host once and ignores empty or non-string hosts", () => {
  let t = emptyTally("2026-10-20");
  t = recordSite(t, "example.com");
  t = recordSite(t, "Example.com");
  t = recordSite(t, "");
  t = recordSite(t, null);
  assert.strictEqual(t.sites.length, 1);
});

test("recordSite never grows past MAX_SITES", () => {
  let t = emptyTally("2026-10-20");
  for (let i = 0; i < 10000; i++) t = recordSite(t, `site${i}.example.com`);
  assert.strictEqual(t.sites.length, 9999);
});

test("recordEngine marks known engines and ignores anything else", () => {
  let t = emptyTally("2026-10-20");
  t = recordEngine(t, "css");
  assert.deepStrictEqual(t.engines, { auto: false, css: true, invert: false });
  const same = recordEngine(t, "bogus");
  assert.deepStrictEqual(same.engines, t.engines);
});

test("the tally never holds a readable host name", () => {
  const t = recordSite(emptyTally("2026-10-20"), "example.com");
  assert.ok(!JSON.stringify(t).includes("example"));
});

test("record functions do not mutate their input", () => {
  const t = emptyTally("2026-10-20");
  recordSite(t, "example.com");
  recordEngine(t, "css");
  assert.strictEqual(t.sites.length, 0);
  assert.strictEqual(t.engines.css, false);
});

test("buildReport emits exactly id, day, version, engines, sites", () => {
  let t = emptyTally("2026-10-20");
  t = recordEngine(t, "auto");
  t = recordSite(t, "a.example.com");
  t = recordSite(t, "b.example.com");
  const r = buildReport({ id: ID, version: "2.1.0", tally: t });
  assert.deepStrictEqual(Object.keys(r).sort(), ["day", "engines", "id", "sites", "version"]);
  assert.strictEqual(r.sites, 2);
  assert.strictEqual(r.day, "2026-10-20");
  assert.ok(validateReport(r));
});

test("validateReport accepts a good report", () => {
  assert.strictEqual(validateReport(good()), true);
  assert.strictEqual(validateReport({ ...good(), sites: 0 }), true);
  assert.strictEqual(validateReport({ ...good(), sites: 9999 }), true);
});

test("validateReport rejects anything outside the allow-list", () => {
  const bad = [
    { ...good(), extra: 1 },
    { ...good(), site: "example.com" },
    { ...good(), sites: -1 },
    { ...good(), sites: 10000 },
    { ...good(), sites: 1.5 },
    { ...good(), sites: "3" },
    { ...good(), id: "not-a-uuid" },
    { ...good(), day: "2026-1-2" },
    { ...good(), version: "2.1" },
    { ...good(), engines: { auto: true, css: false } },
    { ...good(), engines: { auto: true, css: false, invert: "no" } },
    { ...good(), engines: { auto: true, css: false, invert: false, other: true } },
    null,
    undefined,
    [],
    "x",
  ];
  for (const b of bad) assert.strictEqual(validateReport(b), false, JSON.stringify(b));
  const missing = good();
  delete missing.sites;
  assert.strictEqual(validateReport(missing), false);
});

test("isUuid", () => {
  assert.strictEqual(isUuid(ID), true);
  assert.strictEqual(isUuid("nope"), false);
  assert.strictEqual(isUuid(5), false);
});

console.log("\nUsage report allow-list");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
