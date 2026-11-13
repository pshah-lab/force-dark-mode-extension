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
  FEATURE_KEYS,
  MAX_FEATURE_COUNT,
  recordFeature,
  SURFACES,
  MAX_SURFACE_ENTRIES,
  surfaceKey,
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

const FK = ["viewer_pdf","viewer_docx","viewer_pptx","viewer_xlsx","viewer_csv","viewer_md","viewer_txt","viewer_rtf","export_pdf_txt","export_pdf_md","export_pdf_png","export_docx_txt","export_docx_md","export_docx_html","export_pptx_txt","export_pptx_md","export_pptx_html","export_xlsx_csv","export_xlsx_json","export_csv_xlsx","export_md_html","export_txt_html","export_rtf_html"];

const NEW_FK = ["dark_applied","toggle_on","toggle_off","native_dark_override","shortcut_toggle","context_menu_toggle","engine_auto","engine_css","engine_invert","theme_default","theme_builtin","theme_custom","bg_color_changed","brightness_changed","contrast_changed","sepia_changed","image_dim_changed","media_control_changed","filters_reset","site_css_saved","site_report_sent"];

test("feature keys are the exact allow-list", () => {
  assert.strictEqual(FK.length, 23);
  assert.strictEqual(NEW_FK.length, 21);
  assert.deepStrictEqual([...FEATURE_KEYS].sort(), [...FK, ...NEW_FK].sort());
  assert.strictEqual(FEATURE_KEYS.length, 44);
  assert.strictEqual(new Set(FEATURE_KEYS).size, 44);
  for (const k of NEW_FK) assert.ok(FEATURE_KEYS.includes(k), k);
  assert.ok(FEATURE_KEYS.every((k) => !k.includes("__")), "no double underscore in any feature key");
  assert.ok(FEATURE_KEYS.every((k) => /^[a-z0-9_]+$/.test(k)));
  assert.strictEqual(MAX_FEATURE_COUNT, 999);
});

test("emptyTally includes features", () => {
  assert.deepStrictEqual(emptyTally("2026-10-20").features, {});
});

test("recordFeature increments without mutating", () => {
  const t0 = emptyTally("2026-10-20");
  const t1 = recordFeature(t0, "viewer_pdf");
  const t2 = recordFeature(t1, "viewer_pdf");
  assert.deepStrictEqual(t0.features, {});
  assert.strictEqual(t1.features.viewer_pdf, 1);
  assert.strictEqual(t2.features.viewer_pdf, 2);
  assert.notStrictEqual(t1, t0);
  assert.notStrictEqual(t2.features, t1.features);
});

test("recordFeature caps at 999", () => {
  let t = { ...emptyTally("2026-10-20"), features: { viewer_pdf: 998 } };
  t = recordFeature(t, "viewer_pdf");
  t = recordFeature(t, "viewer_pdf");
  assert.strictEqual(t.features.viewer_pdf, 999);
});

test("recordFeature ignores unknown and prototype keys", () => {
  const t0 = emptyTally("2026-10-20");
  for (const k of ["__proto__", "constructor", "toString", "hasOwnProperty", "nope", "", 5, null, undefined]) {
    const t = recordFeature(t0, k);
    assert.deepStrictEqual(Object.keys(t.features), []);
    assert.strictEqual(Object.getPrototypeOf(t.features) === Object.prototype || Object.getPrototypeOf(t.features) === null, true);
    assert.strictEqual({}.polluted, undefined);
  }
});

test("functions tolerate a tally without features", () => {
  const old = { day: "2026-10-20", engines: { auto: true, css: false, invert: false }, sites: [1] };
  assert.deepStrictEqual(recordFeature(old, "viewer_csv").features, { viewer_csv: 1 });
  assert.deepStrictEqual(recordEngine(old, "css").features, {});
  assert.deepStrictEqual(recordSite(old, "a.com").features, {});
  assert.strictEqual("featureUses" in buildReport({ id: ID, version: "2.1.0", tally: old }), false);
});

test("recordEngine and recordSite preserve features", () => {
  let t = recordFeature(emptyTally("2026-10-20"), "viewer_md");
  t = recordSite(recordEngine(t, "css"), "a.com");
  assert.deepStrictEqual(t.features, { viewer_md: 1 });
});

test("buildReport omits featureUses when empty, includes otherwise", () => {
  const t0 = emptyTally("2026-10-20");
  assert.strictEqual("featureUses" in buildReport({ id: ID, version: "2.1.0", tally: t0 }), false);
  const t = recordFeature(recordFeature(t0, "viewer_pdf"), "export_pdf_txt");
  const r = buildReport({ id: ID, version: "2.1.0", tally: t });
  assert.deepStrictEqual(r.featureUses, { viewer_pdf: 1, export_pdf_txt: 1 });
  assert.strictEqual(validateReport(r), true);
});

test("validateReport accepts 5-key and 6-key forms", () => {
  assert.strictEqual(validateReport(good()), true);
  assert.strictEqual(validateReport({ ...good(), featureUses: { viewer_pdf: 3, export_md_html: 999 } }), true);
});

test("validateReport rejects bad featureUses", () => {
  const bad = [
    { nope: 1 }, { __proto__x: 1 }, { viewer_pdf: 0 }, { viewer_pdf: 1000 }, { viewer_pdf: 1.5 },
    { viewer_pdf: "3" }, { viewer_pdf: null }, { viewer_pdf: {} }, { viewer_pdf: [1] }, { viewer_pdf: -1 },
    {}, [], null, "x", 5,
  ];
  for (const fu of bad) assert.strictEqual(validateReport({ ...good(), featureUses: fu }), false, JSON.stringify(fu));
  // Real own prototype-named keys, as JSON.parse creates them.
  for (const raw of ['{"__proto__":1}', '{"viewer_pdf":1,"__proto__":1}', '{"constructor":1}', '{"toString":1}']) {
    assert.strictEqual(validateReport({ ...good(), featureUses: JSON.parse(raw) }), false, raw);
  }
  assert.strictEqual(validateReport({ ...good(), extra: 1 }), false);
  assert.strictEqual(validateReport({ ...good(), featureUses: { viewer_pdf: 1 }, extra: 1 }), false);
});

// ---- surfaces (consent v4) ----
const SURF = ["google_docs","google_sheets","google_slides","web_pdf","local_pdf","local_sheet","local_doc","web_other","other"];

test("SURFACES, MAX_SURFACE_ENTRIES and surfaceKey", () => {
  assert.deepStrictEqual([...SURFACES], SURF);
  assert.strictEqual(MAX_SURFACE_ENTRIES, 120);
  assert.strictEqual(surfaceKey("export_pdf_txt", "local_pdf"), "export_pdf_txt__local_pdf");
  assert.strictEqual(surfaceKey("dark_applied", "google_docs"), "dark_applied__google_docs");
  for (const [f, s] of [["nope", "local_pdf"], ["viewer_pdf", "nope"], ["__proto__", "other"], ["constructor", "web_other"],
    ["viewer_pdf", "__proto__"], ["viewer_pdf", undefined], [undefined, "other"], ["", ""], [null, null], ["viewer_pdf", ["other"]]]) {
    assert.strictEqual(surfaceKey(f, s), null, `${f}/${s}`);
  }
});

test("emptyTally includes surfaces", () => {
  assert.deepStrictEqual(emptyTally("2026-11-13").surfaces, {});
});

test("recordFeature with a surface increments both maps without mutating", () => {
  const t = emptyTally("2026-11-13");
  const t1 = recordFeature(t, "export_pdf_txt", "local_pdf");
  const t2 = recordFeature(t1, "export_pdf_txt", "local_pdf");
  assert.deepStrictEqual(t.features, {});
  assert.deepStrictEqual(t.surfaces, {});
  assert.deepStrictEqual(t1.features, { export_pdf_txt: 1 });
  assert.deepStrictEqual(t1.surfaces, { export_pdf_txt__local_pdf: 1 });
  assert.deepStrictEqual(t2.features, { export_pdf_txt: 2 });
  assert.deepStrictEqual(t2.surfaces, { export_pdf_txt__local_pdf: 2 });
  assert.notStrictEqual(t2.surfaces, t1.surfaces);
  const t3 = recordFeature(t2, "export_pdf_txt", "web_pdf");
  assert.deepStrictEqual(t3.surfaces, { export_pdf_txt__local_pdf: 2, export_pdf_txt__web_pdf: 1 });
  assert.deepStrictEqual(t3.features, { export_pdf_txt: 3 });
});

test("recordFeature with an unknown or missing surface counts only the total", () => {
  const t0 = emptyTally("2026-11-13");
  for (const s of [undefined, null, "", "nope", "__proto__", "constructor", "toString", "WEB_OTHER", 5, {}, ["other"]]) {
    const t = recordFeature(t0, "viewer_pdf", s);
    assert.deepStrictEqual(t.features, { viewer_pdf: 1 }, String(s));
    assert.deepStrictEqual(Object.keys(t.surfaces), [], String(s));
    assert.strictEqual({}.polluted, undefined);
  }
  // Unknown feature with a valid surface counts nothing.
  const t = recordFeature(t0, "nope", "web_other");
  assert.deepStrictEqual(t.features, {});
  assert.deepStrictEqual(t.surfaces, {});
});

test("recordFeature caps a surface count at 999", () => {
  let t = { ...emptyTally("2026-11-13"), features: { viewer_pdf: 998 }, surfaces: { viewer_pdf__web_pdf: 998 } };
  t = recordFeature(t, "viewer_pdf", "web_pdf");
  t = recordFeature(t, "viewer_pdf", "web_pdf");
  assert.strictEqual(t.surfaces.viewer_pdf__web_pdf, 999);
  assert.strictEqual(t.features.viewer_pdf, 999);
});

test("recordFeature never holds more than 120 surface entries", () => {
  let t = emptyTally("2026-11-13");
  for (const f of FEATURE_KEYS) for (const s of SURFACES) t = recordFeature(t, f, s);
  assert.strictEqual(Object.keys(t.surfaces).length, 120);
  const at = t;
  const first = Object.keys(at.surfaces)[0];
  // An existing entry still counts; a new one is ignored, but its total still counts.
  t = recordFeature(at, first.split("__")[0], first.split("__")[1]);
  assert.strictEqual(t.surfaces[first], 2);
  const lastF = FEATURE_KEYS[FEATURE_KEYS.length - 1];
  const before = at.features[lastF];
  const missing = SURFACES.map((s) => surfaceKey(lastF, s)).find((k) => !(k in at.surfaces));
  assert.ok(missing, "some entry was dropped");
  t = recordFeature(at, lastF, missing.split("__")[1]);
  assert.strictEqual(Object.keys(t.surfaces).length, 120);
  assert.strictEqual(missing in t.surfaces, false);
  assert.strictEqual(t.features[lastF], before + 1);
  const r = buildReport({ id: ID, version: "2.4.0", tally: t });
  assert.strictEqual(Object.keys(r.surfaceUses).length, 120);
  assert.strictEqual(validateReport(r), true);
});

test("functions tolerate a tally without surfaces (stored v3 tally)", () => {
  const old = { day: "2026-11-13", engines: { auto: true, css: false, invert: false }, sites: [1], features: { viewer_pdf: 2 } };
  assert.deepStrictEqual(recordFeature(old, "viewer_pdf", "web_pdf").surfaces, { viewer_pdf__web_pdf: 1 });
  assert.deepStrictEqual(recordFeature(old, "viewer_pdf").surfaces, {});
  assert.deepStrictEqual(recordEngine(old, "css").surfaces, {});
  assert.deepStrictEqual(recordSite(old, "a.com").surfaces, {});
  const r = buildReport({ id: ID, version: "2.3.0", tally: old });
  assert.strictEqual("surfaceUses" in r, false);
  assert.deepStrictEqual(r.featureUses, { viewer_pdf: 2 });
  assert.strictEqual(validateReport(r), true);
  const junk = { ...old, surfaces: [1, 2] };
  assert.deepStrictEqual(recordFeature(junk, "viewer_pdf", "web_pdf").surfaces, { viewer_pdf__web_pdf: 1 });
});

test("recordEngine and recordSite preserve surfaces", () => {
  let t = recordFeature(emptyTally("2026-11-13"), "dark_applied", "google_docs");
  t = recordSite(recordEngine(t, "css"), "a.com");
  assert.deepStrictEqual(t.surfaces, { dark_applied__google_docs: 1 });
});

test("buildReport adds surfaceUses only when non-empty and drops junk entries", () => {
  const t0 = emptyTally("2026-11-13");
  assert.strictEqual("surfaceUses" in buildReport({ id: ID, version: "2.4.0", tally: t0 }), false);
  const t = recordFeature(recordFeature(t0, "viewer_pdf", "web_pdf"), "dark_applied", "google_docs");
  const r = buildReport({ id: ID, version: "2.4.0", tally: t });
  assert.deepStrictEqual(r.surfaceUses, { viewer_pdf__web_pdf: 1, dark_applied__google_docs: 1 });
  assert.deepStrictEqual(Object.keys(r).sort(), ["day", "engines", "featureUses", "id", "sites", "surfaceUses", "version"]);
  assert.strictEqual(validateReport(r), true);
  const dirty = { ...t0, surfaces: { nope__web_pdf: 3, viewer_pdf__nope: 3, viewer_pdf__web_pdf: 0, viewer_pdf__local_pdf: 1.5, viewer_pdf__other: 2 } };
  const r2 = buildReport({ id: ID, version: "2.4.0", tally: dirty });
  assert.deepStrictEqual(r2.surfaceUses, { viewer_pdf__other: 2 });
});

const su = (surfaceUses, withTotals = true) => ({ ...good(), ...(withTotals ? { featureUses: { viewer_pdf: 3 } } : {}), surfaceUses });

test("validateReport accepts the 5, 6, 7-key and 5+surfaceUses forms", () => {
  assert.strictEqual(validateReport(good()), true);
  assert.strictEqual(validateReport({ ...good(), featureUses: { viewer_pdf: 3 } }), true);
  assert.strictEqual(validateReport(su({ viewer_pdf__web_pdf: 3, dark_applied__google_docs: 999 })), true);
  assert.strictEqual(validateReport(su({ viewer_pdf__web_pdf: 3 }, false)), true);
  // No cross-field sums are enforced.
  assert.strictEqual(validateReport(su({ export_md_html__local_doc: 50 })), true);
  const full = {};
  for (const k of FEATURE_KEYS.slice(0, 13)) for (const s of SURFACES) if (Object.keys(full).length < 120) full[surfaceKey(k, s)] = 1;
  assert.strictEqual(Object.keys(full).length, 117);
  assert.strictEqual(validateReport(su(full)), true);
});

test("validateReport rejects bad surfaceUses", () => {
  const bad = [
    { nope__web_other: 1 }, { viewer_pdf__nope: 1 }, { viewer_pdf__web_pdf__other: 1 }, { a__b__c: 1 },
    { __x: 1 }, { x__: 1 }, { __web_other: 1 }, { viewer_pdf__: 1 }, { viewer_pdf: 1 }, { viewer_pdf___web_pdf: 1 },
    { viewer_pdf__web_pdf: 0 }, { viewer_pdf__web_pdf: 1000 }, { viewer_pdf__web_pdf: 1.5 }, { viewer_pdf__web_pdf: "3" },
    { viewer_pdf__web_pdf: null }, { viewer_pdf__web_pdf: {} }, { viewer_pdf__web_pdf: [1] }, { viewer_pdf__web_pdf: -1 },
    { constructor__web_other: 1 }, { viewer_pdf__constructor: 1 }, { toString__other: 1 }, { "": 1 },
    {}, [], null, "x", 5, true,
  ];
  for (const s of bad) {
    assert.strictEqual(validateReport(su(s)), false, JSON.stringify(s));
    assert.strictEqual(validateReport(su(s, false)), false, JSON.stringify(s));
  }
  for (const raw of ['{"__proto__":1}', '{"viewer_pdf__web_pdf":1,"__proto__":1}', '{"__proto__":{"viewer_pdf__web_pdf":1}}', '{"constructor__web_other":1}']) {
    assert.strictEqual(validateReport(su(JSON.parse(raw))), false, raw);
  }
  // More than 120 entries.
  const many = {};
  for (const k of FEATURE_KEYS) for (const s of SURFACES) many[surfaceKey(k, s)] = 1;
  const over = Object.fromEntries(Object.entries(many).slice(0, 121));
  assert.strictEqual(Object.keys(over).length, 121);
  assert.strictEqual(validateReport(su(over)), false);
  const at = Object.fromEntries(Object.entries(many).slice(0, 120));
  assert.strictEqual(validateReport(su(at)), true);
  // Extra fields beside the 7 are still rejected.
  assert.strictEqual(validateReport({ ...su({ viewer_pdf__web_pdf: 1 }), extra: 1 }), false);
  assert.strictEqual(validateReport({ ...su({ viewer_pdf__web_pdf: 1 }), surfaces: {} }), false);
  // A bad featureUses still fails the 7-key form.
  assert.strictEqual(validateReport({ ...su({ viewer_pdf__web_pdf: 1 }), featureUses: {} }), false);
});

console.log("\nUsage report allow-list");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
