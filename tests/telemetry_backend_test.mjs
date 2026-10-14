// tests/telemetry_backend_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as ext from "../src/shared/telemetry.js";
import * as be from "../backend/telemetry/lib/schema.js";
import { createHandler as createIngest } from "../backend/telemetry/api/darkmode-telemetry.js";
import { createHandler as createDelete } from "../backend/telemetry/api/darkmode-telemetry-delete.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

const ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-10-14T10:00:00Z");
const hb = (over = {}) => ({
  id: ID, day: "2026-10-14", version: "2.1.0",
  env: { chrome: 130, os: "mac", lang: "en" },
  engines: { auto: true, css: false, invert: false },
  theme: "builtin:midnight",
  features: { viewer: false, editor: false, customCss: false, sitePack: false },
  ...over,
});

function fakeStore() {
  const rows = new Map();
  const deleted = [];
  return {
    rows, deleted, upserts: 0,
    async upsertHeartbeat(row) { this.upserts++; rows.set(`${row.install_id}|${row.day}`, row); },
    async deleteById(id) { deleted.push(id); for (const k of [...rows.keys()]) if (k.startsWith(id)) rows.delete(k); },
  };
}
function call(handler, { method = "POST", body } = {}) {
  const res = { statusCode: null, ended: false, body: null,
    status(c) { this.statusCode = c; return this; },
    end(b) { this.ended = true; this.body = b; return this; },
    setHeader() { return this; },
  };
  return handler({ method, body }, res).then(() => res);
}

test("allow-lists are deep-equal to the extension module", () => {
  for (const k of ["ENGINES", "FEATURES", "BUILTIN_THEME_IDS", "OS_FAMILIES"]) {
    assert.deepStrictEqual(be[k], ext[k], k);
  }
});

test("validateHeartbeat parity on a table of samples", () => {
  const good = hb();
  const samples = [
    good, { ...good, theme: "custom" }, { ...good, theme: "github.com" }, { ...good, extra: 1 },
    { ...good, id: "nope" }, { ...good, version: "2.1" }, { ...good, day: "20261014" },
    { ...good, env: { ...good.env, os: "beos" } }, { ...good, env: { ...good.env, chrome: 0 } },
    { ...good, env: { ...good.env, lang: "EN" } }, { ...good, env: { ...good.env, host: "x" } },
    { ...good, engines: { auto: 1, css: false, invert: false } },
    { ...good, engines: { auto: true, css: false } },
    { ...good, features: { ...good.features, evil: true } },
    { ...good, features: { viewer: "yes", editor: false, customCss: false, sitePack: false } },
    null, [], "x", 5, {},
  ];
  for (const s of samples) assert.strictEqual(be.validateHeartbeat(s), ext.validateHeartbeat(s), JSON.stringify(s));
  assert.strictEqual(be.validateHeartbeat(good), true);
});

test("ingest rejects non-POST with 405", async () => {
  const h = createIngest({ store: fakeStore(), now: () => NOW });
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
    assert.strictEqual((await call(h, { method, body: hb() })).statusCode, 405, method);
  }
});

test("ingest accepts a valid heartbeat: 204, one upsert, no IP-like field", async () => {
  const store = fakeStore();
  const h = createIngest({ store, now: () => NOW });
  const res = await call(h, { body: hb({ theme: "custom" }) });
  assert.strictEqual(res.statusCode, 204);
  assert.strictEqual(store.upserts, 1);
  const row = [...store.rows.values()][0];
  assert.deepStrictEqual(Object.keys(row).sort(),
    ["chrome", "day", "engines", "features", "install_id", "lang", "os", "theme", "version"]);
  assert.strictEqual(row.install_id, ID);
  assert.strictEqual(row.chrome, 130);
  assert.strictEqual(row.theme, "custom");
  assert.ok(!/ip|addr|forward/i.test(Object.keys(row).join(",")));
});

test("ingest accepts a JSON string body", async () => {
  const store = fakeStore();
  const res = await call(createIngest({ store, now: () => NOW }), { body: JSON.stringify(hb()) });
  assert.strictEqual(res.statusCode, 204);
  assert.strictEqual(store.upserts, 1);
});

test("ingest rejects invalid bodies with 400 and never touches the store", async () => {
  const store = fakeStore();
  const h = createIngest({ store, now: () => NOW });
  for (const body of [hb({ theme: "github.com" }), hb({ extra: 1 }), "{not json", undefined, null, 5, [], hb({ id: "x" })]) {
    const res = await call(h, { body });
    assert.strictEqual(res.statusCode, 400, JSON.stringify(body));
  }
  assert.strictEqual(store.upserts, 0);
});

test("ingest rejects bodies over 2 KB", async () => {
  const store = fakeStore();
  const h = createIngest({ store, now: () => NOW });
  const big = JSON.stringify(hb()) + " ".repeat(2100);
  const res = await call(h, { body: big });
  assert.strictEqual(res.statusCode, 413);
  assert.strictEqual(store.upserts, 0);
  const res2 = await call(h, { body: { ...hb(), pad: "x".repeat(3000) } });
  assert.strictEqual(res2.statusCode, 413);
  assert.strictEqual(store.upserts, 0);
});

test("a throwing req.body getter yields a clean 400 on both handlers", async () => {
  const store = fakeStore();
  const mkRes = () => ({ statusCode: null, status(c) { this.statusCode = c; return this; }, end() { return this; }, setHeader() { return this; } });
  const req = { method: "POST", get body() { throw new Error("boom"); } };
  for (const h of [createIngest({ store, now: () => NOW }), createDelete({ store })]) {
    const res = mkRes();
    await h(req, res);
    assert.strictEqual(res.statusCode, 400);
  }
  assert.strictEqual(store.upserts, 0);
  assert.deepStrictEqual(store.deleted, []);
});

test("ingest rejects impossible and out-of-window days", async () => {
  const store = fakeStore();
  const h = createIngest({ store, now: () => NOW });
  for (const day of ["2026-13-45", "2026-02-30", "2026-10-12", "2026-10-16", "2020-01-01", "2099-01-01"]) {
    assert.strictEqual((await call(h, { body: hb({ day }) })).statusCode, 400, day);
  }
  for (const day of ["2026-10-13", "2026-10-14", "2026-10-15"]) {
    assert.strictEqual((await call(h, { body: hb({ day }) })).statusCode, 204, day);
  }
});

test("same (id, day) twice leaves one row; a new day adds one", async () => {
  const store = fakeStore();
  const h = createIngest({ store, now: () => NOW });
  await call(h, { body: hb() });
  await call(h, { body: hb({ engines: { auto: true, css: true, invert: false } }) });
  assert.strictEqual(store.rows.size, 1);
  assert.strictEqual([...store.rows.values()][0].engines.css, true);
  await call(h, { body: hb({ day: "2026-10-15" }) });
  assert.strictEqual(store.rows.size, 2);
});

test("ingest returns 500 when the store throws, without leaking details", async () => {
  const store = { async upsertHeartbeat() { throw new Error("secret db detail"); } };
  const res = await call(createIngest({ store, now: () => NOW }), { body: hb() });
  assert.strictEqual(res.statusCode, 500);
  assert.ok(!String(res.body || "").includes("secret"));
});

test("delete: POST only, validates UUID, calls store.deleteById, 204", async () => {
  const store = fakeStore();
  const h = createDelete({ store });
  assert.strictEqual((await call(h, { method: "GET", body: { id: ID } })).statusCode, 405);
  for (const body of [{ id: "nope" }, {}, { id: ID, extra: 1 }, "{bad", null, undefined, [], { id: 5 }]) {
    assert.strictEqual((await call(h, { body })).statusCode, 400, JSON.stringify(body));
  }
  assert.deepStrictEqual(store.deleted, []);
  await call(createIngest({ store, now: () => NOW }), { body: hb() });
  assert.strictEqual(store.rows.size, 1);
  const res = await call(h, { body: { id: ID } });
  assert.strictEqual(res.statusCode, 204);
  assert.deepStrictEqual(store.deleted, [ID]);
  assert.strictEqual(store.rows.size, 0);
  assert.strictEqual((await call(h, { body: JSON.stringify({ id: ID }) })).statusCode, 204);
});

test("delete returns 500 when the store throws", async () => {
  const res = await call(createDelete({ store: { async deleteById() { throw new Error("x"); } } }), { body: { id: ID } });
  assert.strictEqual(res.statusCode, 500);
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules") return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

test("no backend file mentions IP-bearing request fields", () => {
  const files = walk(path.join(ROOT, "backend"));
  assert.ok(files.length >= 8);
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8").toLowerCase();
    for (const bad of ["x-forwarded-for", "remoteaddress", "req.socket", "req.headers", "x-real-ip"]) {
      assert.ok(!text.includes(bad), `${path.relative(ROOT, f)} mentions ${bad}`);
    }
  }
});

test("supabase-js is only imported lazily, never at top level", () => {
  const dirs = ["api", "lib"];
  let lazy = 0;
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(ROOT, "backend/telemetry", d))) {
      const text = fs.readFileSync(path.join(ROOT, "backend/telemetry", d, f), "utf8");
      assert.ok(!/^\s*import\s[^;]*supabase/m.test(text), f);
      if (text.includes('await import("@supabase/supabase-js")')) lazy++;
    }
  }
  assert.strictEqual(lazy, 1);
});

test("default exports reuse one module-level handler", () => {
  for (const f of ["darkmode-telemetry.js", "darkmode-telemetry-delete.js"]) {
    const text = fs.readFileSync(path.join(ROOT, "backend/telemetry/api", f), "utf8");
    assert.ok(/^const handler = createHandler\(\);/m.test(text), f);
    assert.ok(!/export default async function handler[\s\S]*createHandler\(\)\(/.test(text), f);
  }
});

test("SQL files contain the required objects", () => {
  const sql = (n) => fs.readFileSync(path.join(ROOT, "backend/telemetry/supabase", n), "utf8");
  const schema = sql("schema.sql");
  assert.ok(/create table[^;]*heartbeats/i.test(schema));
  assert.ok(/primary key\s*\(\s*install_id\s*,\s*day\s*\)/i.test(schema));
  assert.ok(/enable row level security/i.test(schema));
  assert.ok(!/create policy/i.test(schema));
  const views = sql("views.sql");
  for (const v of ["dau", "wau", "mau", "new_vs_returning", "retention"]) {
    assert.ok(new RegExp(`create (or replace )?view\\s+${v}\\b`, "i").test(views), v);
  }
  assert.ok(/delete from\s+heartbeats[^;]*400 days/i.test(sql("purge.sql")));
});

console.log("=========================================");
console.log("Running Telemetry Backend Tests");
console.log("=========================================\n");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
