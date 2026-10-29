// tests/dashboard_backend_test.mjs
// Private owner dashboard: token-gated JSON endpoint, the HTML page handler and the daily rollup SQL.
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isAuthorized } from "../backend/telemetry/lib/dashboardAuth.js";
import { validateDashboardData } from "../backend/telemetry/lib/dashboardData.js";
import { createDashboardDataHandler } from "../backend/telemetry/api/darkmode-dashboard-data.js";
import { createDashboardPageHandler } from "../backend/telemetry/api/darkmode-dashboard.js";
import { DASHBOARD_HTML } from "../backend/telemetry/lib/dashboardPage.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

function mockRes() {
  const res = { statusCode: null, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.end = (b) => { res.body = b; return res; };
  return res;
}

const TOKEN = "t".repeat(40);
const doc = () => ({
  generatedAt: "2026-10-29T03:15:00Z",
  days: [{
    day: "2026-10-28", active: 4, newInstalls: 1, returning: 3, siteReports: 2, avgSites: 3.5,
    sites: { s0: 1, s1_5: 2, s6_20: 1, s21p: 0 },
    versions: { "2.2.0": 3, "2.1.0": 1 },
    engines: { auto: 3, css: 1, invert: 0 },
    themes: {}, os: {}, chrome: {}, lang: {},
  }],
  topSites: [{ site: "example.com", reports: 2, days: 1, lastDay: "2026-10-28" }],
});

// ---- auth ----
test("isAuthorized accepts only the exact token", () => {
  assert.strictEqual(isAuthorized(TOKEN, TOKEN), true);
  for (const h of [undefined, null, 5, "", `${TOKEN}x`, TOKEN.slice(1), ` ${TOKEN}`]) {
    assert.strictEqual(isAuthorized(h, TOKEN), false, String(h));
  }
});

test("isAuthorized fails closed when no token is configured or it is too short", () => {
  for (const t of [undefined, "", "short", null]) {
    assert.strictEqual(isAuthorized(t, t), false);
    assert.strictEqual(isAuthorized("", t), false);
  }
});

// ---- data validation ----
test("validateDashboardData accepts a good document and rejects ids, markup and bad shapes", () => {
  assert.strictEqual(validateDashboardData(doc()), true);
  const bad = [
    (d) => { d.extra = 1; },
    (d) => { d.days[0].active = -1; },
    (d) => { d.days[0].day = "2026-13-40"; },
    (d) => { d.days[0].versions["2.2.0"] = "3"; },
    (d) => { d.days[0].versions["123e4567-e89b-12d3-a456-426614174000"] = 1; },
    (d) => { d.topSites[0].site = "<script>"; },
    (d) => { d.topSites[0].site = "123e4567-e89b-12d3-a456-426614174000"; },
    (d) => { d.topSites = "x"; },
    (d) => { d.generatedAt = "yesterday"; },
  ];
  for (const f of bad) {
    const d = doc(); f(d);
    assert.strictEqual(validateDashboardData(d), false, f.toString());
  }
  assert.strictEqual(validateDashboardData(null), false);
  const d2 = doc(); d2.topSites[0].site = "httpbin.org";
  assert.strictEqual(validateDashboardData(d2), true, "a domain that merely contains http is fine");
});

// ---- data handler ----
test("data handler: 503 when no token is configured, nothing is fetched", async () => {
  let called = false;
  const h = createDashboardDataHandler({ token: "", store: { async getDashboard() { called = true; return doc(); } } });
  const res = mockRes();
  await h({ method: "POST", body: { token: "x" } }, res);
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(called, false);
});

test("data handler: 401 without or with a wrong token, store never called", async () => {
  let called = false;
  const h = createDashboardDataHandler({ token: TOKEN, store: { async getDashboard() { called = true; return doc(); } } });
  for (const body of [{}, { token: "nope" }, { token: 5 }, [TOKEN], "null"]) {
    const res = mockRes();
    await h({ method: "POST", body }, res);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body, undefined);
  }
  assert.strictEqual(called, false);
});

test("data handler: 200 JSON, never cached, with the right token", async () => {
  const h = createDashboardDataHandler({ token: TOKEN, store: { async getDashboard() { return doc(); } } });
  const res = mockRes();
  await h({ method: "POST", body: { token: TOKEN } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers["cache-control"], "no-store");
  assert.ok(/application\/json/.test(res.headers["content-type"]));
  assert.deepStrictEqual(JSON.parse(res.body), doc());
  assert.ok(!("access-control-allow-origin" in res.headers), "same-origin only, no CORS");
});

test("data handler: 405 for other methods, 500 for store error or invalid document", async () => {
  const ok = createDashboardDataHandler({ token: TOKEN, store: { async getDashboard() { return doc(); } } });
  const res1 = mockRes();
  await ok({ method: "GET", body: { token: TOKEN } }, res1);
  assert.strictEqual(res1.statusCode, 405);
  const boom = createDashboardDataHandler({ token: TOKEN, store: { async getDashboard() { throw new Error("db"); } } });
  const res2 = mockRes();
  await boom({ method: "POST", body: { token: TOKEN } }, res2);
  assert.strictEqual(res2.statusCode, 500);
  assert.strictEqual(res2.body, undefined);
  const bad = createDashboardDataHandler({ token: TOKEN, store: { async getDashboard() { return { nope: 1 }; } } });
  const res3 = mockRes();
  await bad({ method: "POST", body: { token: TOKEN } }, res3);
  assert.strictEqual(res3.statusCode, 500);
});

// ---- page ----
test("page handler serves the HTML with a strict CSP and no indexing", async () => {
  const h = createDashboardPageHandler();
  const res = mockRes();
  await h({ method: "GET" }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(/text\/html/.test(res.headers["content-type"]));
  assert.strictEqual(res.headers["cache-control"], "no-store");
  assert.ok(/noindex/.test(res.headers["x-robots-tag"]));
  const csp = res.headers["content-security-policy"];
  assert.ok(/default-src 'none'/.test(csp) && /connect-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp), csp);
  assert.strictEqual(res.body, DASHBOARD_HTML);
  const res2 = mockRes();
  await h({ method: "POST" }, res2);
  assert.strictEqual(res2.statusCode, 405);
});

test("page has no external resources, never stores the token, sends it only in a POST body", () => {
  assert.ok(!/https?:\/\//i.test(DASHBOARD_HTML.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, "")), "no external URLs");
  assert.ok(!/localStorage|sessionStorage|document\.cookie|indexedDB/.test(DASHBOARD_HTML), "token is never persisted");
  assert.ok(/method: "POST"/.test(DASHBOARD_HTML) && /JSON\.stringify\(\{ token/.test(DASHBOARD_HTML));
  assert.ok(/noindex/.test(DASHBOARD_HTML));
  assert.ok(!/innerHTML/.test(DASHBOARD_HTML), "values go in via textContent");
});

test("page marks releases and labels dates on both charts", () => {
  assert.ok(/RELEASES = \[[^\]]*"2\.2\.0"/.test(DASHBOARD_HTML));
  assert.strictEqual(DASHBOARD_HTML.split("\n  axisDates(g,").length - 1, 2, "line and stacked charts both use it");
});

// ---- SQL ----
test("daily_stats.sql: counts only, owner-only, nightly cron", () => {
  const sql = fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase/daily_stats.sql"), "utf8");
  assert.ok(/create table if not exists daily_stats/i.test(sql));
  assert.ok(/alter table daily_stats enable row level security/i.test(sql));
  assert.ok(/revoke execute on function rollup_daily_stats\(date\) from public, anon, authenticated/i.test(sql));
  assert.ok(/revoke execute on function owner_dashboard\(\) from public, anon, authenticated/i.test(sql));
  assert.ok(/cron\.schedule\(\s*'rollup-daily-stats'/i.test(sql));
  const tableDef = sql.match(/create table if not exists daily_stats \([\s\S]*?\n\);/i)[0];
  assert.ok(!/install_id|uuid/i.test(tableDef), "the rollup table holds no install IDs");
});

test("package.json chains this test into npm test exactly once", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.strictEqual(pkg.scripts["test:dashboard"], "node tests/dashboard_backend_test.mjs");
  assert.strictEqual(pkg.scripts.test.split("node tests/dashboard_backend_test.mjs").length - 1, 1);
});

console.log("=========================================");
console.log("Running Owner Dashboard Tests");
console.log("=========================================\n");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
