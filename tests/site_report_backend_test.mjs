// tests/site_report_backend_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as be from "../backend/telemetry/lib/reportSchema.js";
import * as ext from "../src/shared/siteReport.js";
import { createReportHandler } from "../backend/telemetry/api/darkmode-report.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT_ORIGIN = "chrome-extension://kmhhphbakbhohiohagkhhgdgfbplkfke";
const NOW = new Date("2026-10-17T10:00:00Z");
const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

const report = (over = {}) => ({ site: "docs.example.com", engine: "css", theme: "builtin:nord", version: "2.1.0", ...over });

function fakeStore({ fail = false } = {}) {
  const rows = [];
  return {
    rows,
    async upsertReport(row) { if (fail) throw new Error("db"); rows.push(row); },
  };
}
function call(handler, { method = "POST", body } = {}) {
  const res = { statusCode: null, ended: false, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    end(b) { this.ended = true; this.body = b; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
  };
  return handler({ method, body }, res).then(() => res);
}
function assertCors(res, label) {
  assert.strictEqual(res.headers["access-control-allow-origin"], EXT_ORIGIN, `${label}: Allow-Origin`);
  assert.strictEqual(res.headers["access-control-allow-methods"], "POST, OPTIONS", `${label}: Allow-Methods`);
  assert.strictEqual(res.headers["vary"], "Origin", `${label}: Vary`);
  assert.ok(!("access-control-allow-credentials" in res.headers), `${label}: no credentials`);
}

test("a valid report is stored once with the server's UTC day, never a client day", async () => {
  const store = fakeStore();
  const h = createReportHandler({ store, now: () => NOW });
  const res = await call(h, { body: report() });
  assert.strictEqual(res.statusCode, 204);
  assertCors(res, "valid");
  assert.deepStrictEqual(store.rows, [{ day: "2026-10-17", site: "docs.example.com", engine: "css", theme: "builtin:nord", version: "2.1.0" }]);
});

test("a JSON string body is accepted too (sent as text)", async () => {
  const store = fakeStore();
  const res = await call(createReportHandler({ store, now: () => NOW }), { body: JSON.stringify(report()) });
  assert.strictEqual(res.statusCode, 204);
  assert.strictEqual(store.rows.length, 1);
});

test("invalid bodies are 400 and never touch the store", async () => {
  const store = fakeStore();
  const h = createReportHandler({ store, now: () => NOW });
  const bad = [
    { ...report(), extra: 1 }, { site: "a.example.com", engine: "css", theme: "default" },
    report({ site: "Docs.Example.com" }), report({ site: "localhost" }), report({ site: "10.0.0.1" }),
    report({ site: "x.example.com/path" }), report({ site: "a.example.com?token=1" }), report({ site: "https://a.example.com" }),
    report({ site: "local_files" }), report({ site: "" }), report({ site: 5 }),
    report({ site: "nas.home.arpa" }), report({ site: "router.lan" }), report({ site: "wiki.corp" }), report({ site: "app.intranet" }), report({ site: "files.private" }),
    report({ engine: "x" }), report({ theme: "My Theme" }), report({ theme: "builtin:evil" }), report({ version: "2.1" }),
    report({ version: "2.1.0; drop table" }), null, [], "x", 5, {},
  ];
  for (const body of bad) {
    const res = await call(h, { body });
    assert.strictEqual(res.statusCode, 400, JSON.stringify(body));
    assertCors(res, "400");
  }
  assert.strictEqual(store.rows.length, 0);
});

test("theme default, custom and every built-in id are accepted", async () => {
  const store = fakeStore();
  const h = createReportHandler({ store, now: () => NOW });
  for (const theme of ["default", "custom", ...ext.BUILTIN_THEME_IDS]) {
    assert.strictEqual((await call(h, { body: report({ theme }) })).statusCode, 204, theme);
  }
});

test("oversize bodies are 413, non-POST is 405 with Allow, preflight is 204 without a store call", async () => {
  const store = fakeStore();
  const h = createReportHandler({ store, now: () => NOW });
  assert.strictEqual((await call(h, { body: JSON.stringify(report({ site: "a".repeat(3000) })) })).statusCode, 413);
  for (const method of ["GET", "PUT", "DELETE", "PATCH", "HEAD"]) {
    const res = await call(h, { method, body: report() });
    assert.strictEqual(res.statusCode, 405, method);
    assert.strictEqual(res.headers["allow"], "POST, OPTIONS", method);
    assertCors(res, method);
  }
  const pre = await call(h, { method: "OPTIONS" });
  assert.strictEqual(pre.statusCode, 204);
  assertCors(pre, "preflight");
  assert.strictEqual(store.rows.length, 0);
});

test("a store failure is a bare 500 with CORS", async () => {
  const res = await call(createReportHandler({ store: fakeStore({ fail: true }), now: () => NOW }), { body: report() });
  assert.strictEqual(res.statusCode, 500);
  assertCors(res, "500");
});

test("the backend validator matches the extension's site rules and lists", () => {
  assert.deepStrictEqual(be.ENGINES, ext.ENGINES);
  assert.deepStrictEqual(be.BUILTIN_THEME_IDS, ext.BUILTIN_THEME_IDS);
  const sites = [
    "https://Docs.Example.com:8443/a?q=1#x", "example.com", "Example.COM.", "xn--bcher-kva.example", "", " ", "a b", "local_files",
    "localhost", "127.0.0.1", "[::1]", "printer.local", "x.internal", "a.test", "foo.localhost", "intranet", "-bad.example.com",
    "nas.home.arpa", "router.lan", "wiki.corp", "app.intranet", "files.private", "lan.example.com",
    "ex_ample.com", "https://", "file:///C:/a.pdf", "a".repeat(64) + ".com", ("a".repeat(60) + ".").repeat(5) + "com", null, 5,
  ];
  for (const s of sites) assert.strictEqual(be.normalizeSite(s), ext.normalizeSite(s), JSON.stringify(s));
});

test("validateReport requires the normalized lowercase host, exactly four keys", () => {
  assert.strictEqual(be.validateReport(report()), true);
  assert.strictEqual(be.validateReport(report({ site: "Docs.example.com" })), false);
  assert.strictEqual(be.validateReport({ ...report(), id: "x" }), false);
});

test("the endpoint reads only the method and body, and stores no header or address", () => {
  const code = fs.readFileSync(path.join(ROOT, "backend/telemetry/api/darkmode-report.js"), "utf8");
  for (const bad of ["req.headers", "x-forwarded", "remoteAddress", "socket", "req.ip", "user-agent", "console.log"]) {
    assert.ok(!code.toLowerCase().includes(bad.toLowerCase()), `darkmode-report.js mentions ${bad}`);
  }
});

test("site_reports.sql: RLS on, no policies, service-role-only function, owner-only view, bounded columns", () => {
  const sql = fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase/site_reports.sql"), "utf8");
  assert.ok(/alter table site_reports enable row level security/i.test(sql));
  assert.ok(!/create policy/i.test(sql));
  assert.ok(/primary key \(day, site, engine, theme, version\)/i.test(sql));
  assert.ok(/on conflict \(day, site, engine, theme, version\) do update set reports = site_reports\.reports \+ 1/i.test(sql));
  assert.ok(/revoke execute on function report_site\([^)]*\) from public, anon, authenticated/i.test(sql));
  assert.ok(/grant execute on function report_site\([^)]*\) to service_role/i.test(sql));
  assert.ok(/revoke all on top_reported_sites from anon, authenticated/i.test(sql));
  assert.ok(/char_length\(site\) <= 253/i.test(sql));
  assert.ok(/400 days/i.test(sql), "the 13-month purge statement must be documented");
});

console.log("\nBroken-site report backend");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
