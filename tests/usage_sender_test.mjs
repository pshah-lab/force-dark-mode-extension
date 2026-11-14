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
  assert.strictEqual(s.consentVersion, 4);
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
  assert.strictEqual(map.get("telemetryState").consentVersion, 4);
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
  const { usage, calls } = setup({ initial: { telemetryState: { enabled: true, id: ID, consentVersion: 4 } } });
  await usage.retryPendingDelete();
  assert.strictEqual(calls.length, 0);
});

test("garbage state sends nothing and is cleared on opt-out", async () => {
  const { usage, calls, map } = setup({ initial: { telemetryState: { enabled: true, id: 7, pendingDeleteIds: [null, "", 5] } } });
  await usage.setConsent(false);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(map.has("telemetryState"), false);
});

test("a consentVersion 2 opt-in is asked to reconfirm and sends nothing", async () => {
  const before = { enabled: true, id: ID, consentVersion: 2, lastSentDay: "2026-10-19", tally: null };
  const { usage, calls, map } = setup({ initial: { telemetryState: before } });
  assert.deepStrictEqual(await usage.status(), { enabled: false, consentNeeded: "reconfirm" });
  await usage.recordDarkApplied(dark());
  await usage.recordFeature("viewer_pdf");
  assert.strictEqual(calls.length, 0);
  assert.deepStrictEqual(map.get("telemetryState"), before);
  await usage.setConsent(true);
  assert.strictEqual(map.get("telemetryState").consentVersion, 4);
  assert.strictEqual(map.get("telemetryState").id, ID);
  await usage.recordFeature("viewer_pdf");
  assert.strictEqual(calls.length, 1);
});

test("a consentVersion 3 opt-in is asked to reconfirm and sends nothing", async () => {
  const tally = { day: "2026-10-20", engines: { auto: true, css: false, invert: false }, sites: [123], features: { viewer_pdf: 2 } };
  const before = { enabled: true, id: ID, consentVersion: 3, lastSentDay: "2026-10-19", tally };
  const { usage, calls, map } = setup({ initial: { telemetryState: before } });
  assert.deepStrictEqual(await usage.status(), { enabled: false, consentNeeded: "reconfirm" });
  await usage.recordDarkApplied(dark());
  await usage.recordFeature("viewer_pdf");
  await usage.recordFeature("viewer_pdf", "local_pdf");
  await usage.recordFeature("dark_applied", "web_other");
  assert.strictEqual(calls.length, 0);
  assert.deepStrictEqual(map.get("telemetryState"), before);
  await usage.setConsent(true);
  assert.strictEqual(map.get("telemetryState").consentVersion, 4);
  assert.strictEqual(map.get("telemetryState").id, ID);
  assert.deepStrictEqual(await usage.status(), { enabled: true, consentNeeded: null });
  await usage.recordFeature("viewer_pdf", "local_pdf");
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].body.featureUses, { viewer_pdf: 3 });
  assert.deepStrictEqual(calls[0].body.surfaceUses, { viewer_pdf__local_pdf: 1 });
  assert.ok(validateReport(calls[0].body));
});

test("recordFeature with a surface while sending stores and sends surfaceUses", async () => {
  const { usage, ingests, map } = setup();
  await usage.setConsent(true);
  await usage.recordFeature("export_pdf_txt", "local_pdf");
  const t = map.get("telemetryState").tally;
  assert.deepStrictEqual(t.features, { export_pdf_txt: 1 });
  assert.deepStrictEqual(t.surfaces, { export_pdf_txt__local_pdf: 1 });
  assert.strictEqual(ingests().length, 1);
  const body = ingests()[0].body;
  assert.deepStrictEqual(Object.keys(body).sort(), ["day", "engines", "featureUses", "id", "sites", "surfaceUses", "version"]);
  assert.deepStrictEqual(body.featureUses, { export_pdf_txt: 1 });
  assert.deepStrictEqual(body.surfaceUses, { export_pdf_txt__local_pdf: 1 });
  assert.ok(validateReport(body));
  await usage.recordFeature("export_pdf_txt", "local_pdf");
  await usage.recordFeature("export_pdf_txt", "web_pdf");
  await usage.recordFeature("dark_applied", "google_docs");
  assert.deepStrictEqual(map.get("telemetryState").tally.features, { export_pdf_txt: 3, dark_applied: 1 });
  assert.deepStrictEqual(map.get("telemetryState").tally.surfaces, {
    export_pdf_txt__local_pdf: 2, export_pdf_txt__web_pdf: 1, dark_applied__google_docs: 1,
  });
});

test("recordDarkApplied with a surface: the first report of the day already carries dark_applied", async () => {
  const { usage, ingests, map } = setup();
  await usage.setConsent(true);
  assert.strictEqual(map.get("telemetryState").tally, null, "no tally yet: this is the first event of the day");
  await usage.recordDarkApplied({ engine: "css", host: "a.example.com", surface: "google_docs" });
  assert.strictEqual(ingests().length, 1);
  const body = ingests()[0].body;
  assert.deepStrictEqual(Object.keys(body).sort(), ["day", "engines", "featureUses", "id", "sites", "surfaceUses", "version"]);
  assert.deepStrictEqual(body.engines, { auto: false, css: true, invert: false });
  assert.strictEqual(body.sites, 1);
  assert.deepStrictEqual(body.featureUses, { dark_applied: 1 });
  assert.deepStrictEqual(body.surfaceUses, { dark_applied__google_docs: 1 });
  assert.ok(validateReport(body));
  const t = map.get("telemetryState").tally;
  assert.deepStrictEqual(t.features, { dark_applied: 1 });
  assert.deepStrictEqual(t.surfaces, { dark_applied__google_docs: 1 });
  assert.ok(!JSON.stringify(map.get("telemetryState")).includes("a.example.com"), "the host is never stored");
});

test("recordDarkApplied counts engine, site and dark_applied in a single storage write", async () => {
  const { usage, map } = setup();
  await usage.setConsent(true);
  let writes = 0;
  // A fresh sender on the consented state, with a storage that counts writes of the usage state.
  const mapW = new Map([["telemetryState", map.get("telemetryState")]]);
  const posts = [];
  const counted = createUsage({
    storage: {
      get: async (k) => mapW.get(k),
      set: async (k, v) => { if (k === "telemetryState") writes += 1; mapW.set(k, JSON.parse(JSON.stringify(v))); },
      remove: async (k) => { mapW.delete(k); },
    },
    post: async (url, body) => { posts.push({ url, body }); return { ok: true, status: 204 }; },
    now: () => new Date("2026-10-20T10:00:00Z"),
    version: "2.1.0",
  });
  await counted.recordDarkApplied({ engine: "auto", host: "b.example.com", surface: "web_other" });
  const ingest = posts.filter((p) => p.url === INGEST_URL);
  assert.strictEqual(ingest.length, 1);
  assert.deepStrictEqual(ingest[0].body.featureUses, { dark_applied: 1 });
  assert.deepStrictEqual(ingest[0].body.surfaceUses, { dark_applied__web_other: 1 });
  // One write for the tally, one for the send bookkeeping.
  assert.strictEqual(writes, 2);
});

test("recordDarkApplied with a surface writes and sends nothing when off, at v3, or with no state", async () => {
  const states = [
    undefined,
    { enabled: false, pendingDeleteIds: [ID] },
    { enabled: true, id: ID, consentVersion: 3, tally: null },
    { enabled: true, id: ID, consentVersion: 2, tally: null },
    { enabled: true, id: ID, tally: null },
  ];
  for (const st of states) {
    const { usage, calls, map } = setup({ initial: st === undefined ? {} : { telemetryState: st } });
    assert.strictEqual(await usage.recordDarkApplied({ engine: "css", host: "a.example.com", surface: "google_docs" }), undefined);
    assert.strictEqual(calls.length, 0, JSON.stringify(st));
    if (st === undefined) assert.strictEqual(map.has("telemetryState"), false);
    else assert.deepStrictEqual(map.get("telemetryState"), st);
  }
});

test("recordFeature with a surface writes and sends nothing when off, below or above v4, or with no state", async () => {
  const states = [
    undefined,
    { enabled: false, pendingDeleteIds: [ID] },
    { enabled: true, id: ID, consentVersion: 2, tally: null },
    { enabled: true, id: ID, consentVersion: 3, tally: null },
    { enabled: true, id: ID, consentVersion: "4", tally: null },
    { enabled: true, id: ID, consentVersion: 5, tally: null },
    { enabled: true, id: ID, tally: null },
    { enabled: "true", id: ID, consentVersion: 4, tally: null },
    { enabled: true, id: "not-a-uuid", consentVersion: 4, tally: null },
  ];
  for (const st of states) {
    const { usage, calls, map } = setup({ initial: st === undefined ? {} : { telemetryState: st } });
    assert.strictEqual(await usage.recordFeature("viewer_pdf", "local_pdf"), undefined);
    assert.strictEqual(await usage.recordFeature("dark_applied", "web_other"), undefined);
    assert.strictEqual(calls.length, 0, JSON.stringify(st));
    if (st === undefined) assert.strictEqual(map.has("telemetryState"), false);
    else assert.deepStrictEqual(map.get("telemetryState"), st);
  }
  const { usage, calls, map } = setup();
  await usage.setConsent(true);
  await usage.setConsent(false);
  const n = calls.length;
  await usage.recordFeature("viewer_pdf", "local_pdf");
  assert.strictEqual(calls.length, n);
  assert.strictEqual(map.has("telemetryState"), false);
});

test("an unknown surface counts only the total", async () => {
  const bad = ["bogus", "", "web", "WEB_OTHER", "__proto__", "constructor", "local_pdf__x", null, 5, {}, ["local_pdf"], "https://docs.google.com/document/d/x"];
  const { usage, ingests, map } = setup();
  await usage.setConsent(true);
  for (const s of bad) await usage.recordFeature("viewer_pdf", s);
  await usage.recordFeature("viewer_pdf");
  const t = map.get("telemetryState").tally;
  assert.deepStrictEqual(t.features, { viewer_pdf: bad.length + 1 });
  assert.deepStrictEqual(t.surfaces, {});
  assert.ok(ingests().length >= 1);
  for (const c of ingests()) {
    assert.ok(!("surfaceUses" in c.body));
    assert.ok(validateReport(c.body));
  }
  assert.ok(!JSON.stringify([...map.entries()]).includes("docs.google"));
});

test("an unknown key with a valid surface touches nothing", async () => {
  const { usage, calls, map } = setup();
  await usage.setConsent(true);
  const before = map.get("telemetryState");
  for (const k of ["bogus", "__proto__", "viewer_pdf__local_pdf", "", null]) await usage.recordFeature(k, "local_pdf");
  assert.strictEqual(calls.length, 0);
  assert.deepStrictEqual(map.get("telemetryState"), before);
});

test("a stored tally without surfaces (v3 shape) still works", async () => {
  const tally = { day: "2026-10-20", engines: { auto: true, css: false, invert: false }, sites: [123], features: { viewer_pdf: 2 } };
  const { usage, ingests, map } = setup({ initial: { telemetryState: { enabled: true, id: ID, consentVersion: 4, lastSentDay: null, tally } } });
  await usage.recordFeature("viewer_pdf", "web_pdf");
  const t = map.get("telemetryState").tally;
  assert.deepStrictEqual(t.sites, [123]);
  assert.deepStrictEqual(t.features, { viewer_pdf: 3 });
  assert.deepStrictEqual(t.surfaces, { viewer_pdf__web_pdf: 1 });
  assert.strictEqual(ingests().length, 1);
  assert.deepStrictEqual(ingests()[0].body.surfaceUses, { viewer_pdf__web_pdf: 1 });
  assert.ok(validateReport(ingests()[0].body));
});

test("a stored tally with malformed surfaces is replaced by a fresh one", async () => {
  const tooMany = {};
  for (const f of ["viewer_pdf", "viewer_docx", "viewer_pptx", "viewer_xlsx", "viewer_csv", "viewer_md", "viewer_txt", "viewer_rtf", "export_pdf_txt", "export_pdf_md", "export_pdf_png", "export_docx_txt", "export_docx_md", "export_docx_html"]) {
    for (const s of ["google_docs", "google_sheets", "google_slides", "web_pdf", "local_pdf", "local_sheet", "local_doc", "web_other", "other"]) tooMany[`${f}__${s}`] = 1;
  }
  assert.ok(Object.keys(tooMany).length > 120);
  const bads = [
    [], "x", null, 5,
    { viewer_pdf__local_pdf: "1" }, { viewer_pdf__local_pdf: 0 }, { viewer_pdf__local_pdf: 1000 }, { viewer_pdf__local_pdf: 1.5 },
    { viewer_pdf__local_pdf: null }, { viewer_pdf__local_pdf: { n: 1 } },
    { viewer_pdf: 1 }, { bogus__local_pdf: 1 }, { viewer_pdf__nope: 1 }, { a__b__c: 1 }, { __x: 1 }, { x__: 1 },
    { viewer_pdf__local_pdf__web_pdf: 1 }, { constructor__web_other: 1 },
    tooMany,
  ];
  for (const surfaces of bads) {
    const tally = { day: "2026-10-20", engines: { auto: true, css: false, invert: false }, sites: [123], features: { viewer_pdf: 1 }, surfaces };
    const { usage, ingests, map } = setup({ initial: { telemetryState: { enabled: true, id: ID, consentVersion: 4, lastSentDay: null, tally } } });
    await usage.recordFeature("viewer_pdf", "local_pdf");
    const t = map.get("telemetryState").tally;
    assert.deepStrictEqual(t.features, { viewer_pdf: 1 }, JSON.stringify(surfaces).slice(0, 80));
    assert.deepStrictEqual(t.surfaces, { viewer_pdf__local_pdf: 1 }, JSON.stringify(surfaces).slice(0, 80));
    assert.deepStrictEqual(t.sites, []);
    assert.strictEqual(ingests().length, 1);
    assert.ok(validateReport(ingests()[0].body));
  }
});

test("recordFeature never stores more than 120 surface entries", async () => {
  const surfaces = {};
  const feats = ["viewer_pdf", "viewer_docx", "viewer_pptx", "viewer_xlsx", "viewer_csv", "viewer_md", "viewer_txt", "viewer_rtf", "export_pdf_txt", "export_pdf_md", "export_pdf_png", "export_docx_txt", "export_docx_md", "export_docx_html"];
  const surfs = ["google_docs", "google_sheets", "google_slides", "web_pdf", "local_pdf", "local_sheet", "local_doc", "web_other", "other"];
  outer: for (const f of feats) for (const s of surfs) { if (Object.keys(surfaces).length === 120) break outer; surfaces[`${f}__${s}`] = 1; }
  assert.strictEqual(Object.keys(surfaces).length, 120);
  const tally = { day: "2026-10-20", engines: { auto: false, css: false, invert: false }, sites: [], features: { dark_applied: 1 }, surfaces };
  const { usage, ingests, map } = setup({ initial: { telemetryState: { enabled: true, id: ID, consentVersion: 4, lastSentDay: null, tally } } });
  await usage.recordFeature("dark_applied", "web_other");
  const t = map.get("telemetryState").tally;
  assert.strictEqual(Object.keys(t.surfaces).length, 120);
  assert.ok(!("dark_applied__web_other" in t.surfaces));
  assert.strictEqual(t.features.dark_applied, 2);
  assert.strictEqual(ingests().length, 1);
  assert.strictEqual(Object.keys(ingests()[0].body.surfaceUses).length, 120);
  assert.ok(validateReport(ingests()[0].body));
});

test("surface counts: a changed surface count refreshes only after the hourly wait; identical state does not re-send", async () => {
  // The total is held at the cap so only the surface split changes between events.
  const tally = { day: "2026-10-20", engines: { auto: false, css: false, invert: false }, sites: [], features: { viewer_pdf: 999 }, surfaces: {} };
  const { usage, ingests, advance, map } = setup({ initial: { telemetryState: { enabled: true, id: ID, consentVersion: 4, lastSentDay: null, tally } } });
  await usage.recordFeature("viewer_pdf", "local_pdf");
  assert.strictEqual(ingests().length, 1);
  assert.deepStrictEqual(ingests()[0].body.surfaceUses, { viewer_pdf__local_pdf: 1 });
  advance(10 * MIN);
  await usage.recordFeature("viewer_pdf", "web_pdf");
  assert.strictEqual(ingests().length, 1, "within the hour: no refresh yet");
  assert.strictEqual(map.get("telemetryState").tally.features.viewer_pdf, 999);
  advance(2 * 60 * MIN);
  await usage.recordFeature("viewer_pdf", "web_pdf");
  assert.strictEqual(ingests().length, 2, "only the surface count changed, and the hour has passed");
  assert.deepStrictEqual(ingests()[1].body.featureUses, { viewer_pdf: 999 });
  assert.deepStrictEqual(ingests()[1].body.surfaceUses, { viewer_pdf__local_pdf: 1, viewer_pdf__web_pdf: 2 });
  advance(2 * 60 * MIN);
  await usage.recordDarkApplied({ engine: "bogus" });
  assert.strictEqual(ingests().length, 2, "identical state again: no resend");
});

test("concurrent surface events are all counted and cause a single request", async () => {
  const { usage, ingests, map } = setup();
  await usage.setConsent(true);
  await Promise.all([
    usage.recordFeature("viewer_pdf", "local_pdf"),
    usage.recordFeature("viewer_pdf", "local_pdf"),
    usage.recordFeature("viewer_pdf", "web_pdf"),
    usage.recordFeature("dark_applied", "google_sheets"),
  ]);
  const t = map.get("telemetryState").tally;
  assert.deepStrictEqual(t.features, { viewer_pdf: 3, dark_applied: 1 });
  assert.deepStrictEqual(t.surfaces, { viewer_pdf__local_pdf: 2, viewer_pdf__web_pdf: 1, dark_applied__google_sheets: 1 });
  assert.strictEqual(ingests().length, 1);
});

test("recordFeature with a surface never rejects on storage or network failure", async () => {
  const broken = createUsage({
    storage: { get: async () => { throw new Error("x"); }, set: async () => { throw new Error("x"); }, remove: async () => { throw new Error("x"); } },
    post: async () => { throw new Error("must not post"); }, now: () => new Date(), version: "2.1.0", randomUUID: () => ID,
  });
  assert.strictEqual(await broken.recordFeature("viewer_pdf", "local_pdf"), undefined);
  const { usage } = setup({ responses: [new Error("offline")] });
  await usage.setConsent(true);
  assert.strictEqual(await usage.recordFeature("viewer_pdf", "local_pdf"), undefined);
});

test("recordFeature while sending counts the feature and sends a valid report with featureUses", async () => {
  const { usage, ingests, map } = setup();
  await usage.setConsent(true);
  await usage.recordFeature("viewer_pdf");
  assert.deepStrictEqual(map.get("telemetryState").tally.features, { viewer_pdf: 1 });
  assert.strictEqual(ingests().length, 1);
  const body = ingests()[0].body;
  assert.deepStrictEqual(Object.keys(body).sort(), ["day", "engines", "featureUses", "id", "sites", "version"]);
  assert.deepStrictEqual(body.featureUses, { viewer_pdf: 1 });
  assert.strictEqual(body.sites, 0);
  assert.strictEqual(body.day, "2026-10-20");
  assert.ok(validateReport(body));
  await usage.recordFeature("viewer_pdf");
  await usage.recordFeature("export_xlsx_csv");
  assert.deepStrictEqual(map.get("telemetryState").tally.features, { viewer_pdf: 2, export_xlsx_csv: 1 });
  assert.ok(!JSON.stringify(map.get("telemetryState")).includes("example"));
});

test("recordFeature writes and sends nothing when off, at consentVersion 2, or with no state", async () => {
  const states = [
    undefined,
    { enabled: false, pendingDeleteIds: [ID] },
    { enabled: true, id: ID, consentVersion: 2, tally: null },
    { enabled: true, id: ID, tally: null },
  ];
  for (const st of states) {
    const { usage, calls, map } = setup({ initial: st === undefined ? {} : { telemetryState: st } });
    const res = await usage.recordFeature("viewer_pdf");
    assert.strictEqual(res, undefined);
    assert.strictEqual(calls.length, 0, JSON.stringify(st));
    if (st === undefined) assert.strictEqual(map.has("telemetryState"), false);
    else assert.deepStrictEqual(map.get("telemetryState"), st);
  }
  const { usage, calls, map } = setup();
  await usage.setConsent(true);
  await usage.setConsent(false);
  const n = calls.length;
  await usage.recordFeature("viewer_pdf");
  assert.strictEqual(calls.length, n);
  assert.strictEqual(map.has("telemetryState"), false);
});

test("recordFeature ignores unknown keys entirely", async () => {
  const { usage, calls, map } = setup();
  await usage.setConsent(true);
  const before = map.get("telemetryState");
  for (const k of ["bogus", "__proto__", "constructor", "", null, undefined, 5, "a.example.com"]) {
    await usage.recordFeature(k);
  }
  assert.strictEqual(calls.length, 0);
  assert.deepStrictEqual(map.get("telemetryState"), before);
});

test("recordFeature never rejects on storage failure", async () => {
  const broken = createUsage({
    storage: { get: async () => { throw new Error("x"); }, set: async () => { throw new Error("x"); }, remove: async () => { throw new Error("x"); } },
    post: async () => { throw new Error("must not post"); }, now: () => new Date(), version: "2.1.0", randomUUID: () => ID,
  });
  assert.strictEqual(await broken.recordFeature("viewer_pdf"), undefined);
});

test("a stored tally without features still works for sites and features", async () => {
  const tally = { day: "2026-10-20", engines: { auto: true, css: false, invert: false }, sites: [123] };
  const { usage, ingests, map } = setup({ initial: { telemetryState: { enabled: true, id: ID, consentVersion: 4, lastSentDay: null, tally } } });
  await usage.recordFeature("viewer_docx");
  const t = map.get("telemetryState").tally;
  assert.deepStrictEqual(t.sites, [123]);
  assert.deepStrictEqual(t.engines, { auto: true, css: false, invert: false });
  assert.deepStrictEqual(t.features, { viewer_docx: 1 });
  assert.strictEqual(ingests().length, 1);
  assert.strictEqual(ingests()[0].body.sites, 1);
  assert.deepStrictEqual(ingests()[0].body.featureUses, { viewer_docx: 1 });
  assert.ok(validateReport(ingests()[0].body));

  const s2 = setup({ initial: { telemetryState: { enabled: true, id: ID, consentVersion: 4, lastSentDay: null, tally } } });
  await s2.usage.recordDarkApplied(dark("css", "b.example.com"));
  assert.strictEqual(s2.ingests().length, 1);
  assert.strictEqual(s2.ingests()[0].body.sites, 2);
  assert.ok(!("featureUses" in s2.ingests()[0].body));
});

test("a stored tally with malformed features is replaced by a fresh one", async () => {
  for (const features of [[], "x", { viewer_pdf: "1" }, { viewer_pdf: -1 }, { viewer_pdf: 1.5 }, { bogus: 1 }]) {
    const tally = { day: "2026-10-20", engines: { auto: true, css: false, invert: false }, sites: [123], features };
    const { usage, ingests, map } = setup({ initial: { telemetryState: { enabled: true, id: ID, consentVersion: 4, lastSentDay: null, tally } } });
    await usage.recordFeature("viewer_pdf");
    const t = map.get("telemetryState").tally;
    assert.deepStrictEqual(t.features, { viewer_pdf: 1 }, JSON.stringify(features));
    assert.deepStrictEqual(t.sites, [], JSON.stringify(features));
    assert.strictEqual(ingests().length, 1);
    assert.ok(validateReport(ingests()[0].body));
  }
});

test("feature counts: identical state does not re-send; a changed count refreshes only after the hourly wait", async () => {
  const { usage, ingests, advance } = setup();
  await usage.setConsent(true);
  await usage.recordDarkApplied(dark());
  assert.strictEqual(ingests().length, 1);
  advance(3 * 60 * MIN);
  await usage.recordDarkApplied(dark());
  assert.strictEqual(ingests().length, 1, "same state: no resend");
  await usage.recordFeature("viewer_csv");
  assert.strictEqual(ingests().length, 2, "count changed and the hour has passed");
  assert.deepStrictEqual(ingests()[1].body.featureUses, { viewer_csv: 1 });
  advance(10 * MIN);
  await usage.recordFeature("viewer_csv");
  assert.strictEqual(ingests().length, 2, "within the hour: no refresh yet");
  advance(2 * 60 * MIN);
  await usage.recordDarkApplied(dark());
  assert.strictEqual(ingests().length, 3, "the pending count change goes out after the wait");
  assert.deepStrictEqual(ingests()[2].body.featureUses, { viewer_csv: 2 });
  advance(2 * 60 * MIN);
  await usage.recordDarkApplied(dark());
  assert.strictEqual(ingests().length, 3, "identical state again: no resend");
});

test("concurrent feature events are all counted and cause a single request", async () => {
  const { usage, ingests, map } = setup();
  await usage.setConsent(true);
  await Promise.all([usage.recordFeature("viewer_pdf"), usage.recordFeature("viewer_pdf"), usage.recordDarkApplied(dark())]);
  assert.strictEqual(map.get("telemetryState").tally.features.viewer_pdf, 2);
  assert.strictEqual(map.get("telemetryState").tally.sites.length, 1);
  assert.strictEqual(ingests().length, 1);
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
