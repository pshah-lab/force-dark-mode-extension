// tests/stats_page_test.mjs - public usage statistics page (docs/stats.html + docs/js/stats.js).
import fs from "fs";
import path from "path";
import vm from "vm";
import assert from "assert";
import { fileURLToPath } from "url";
import { FakeDocument, findAll, byTag } from "./helpers/fakeDom.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(rootDir, "docs");
const read = (f) => fs.readFileSync(path.join(docsDir, f), "utf8");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.stack || err.message}`); failed++; }
}

console.log("\n📊 Public usage statistics page");

const STATS_URL = "https://pshah.fun/api/darkmode-stats";
const SRC = read("js/stats.js");

class NsDocument extends FakeDocument {
  createElementNS(ns, tag) { const e = this.createElement(tag); e.namespace = ns; return e; }
}
function load() {
  const window = {};
  const document = new NsDocument();
  vm.runInNewContext(SRC, { window, document, console }, { filename: "stats.js" });
  return window.FdmStats;
}
let currentDoc = null;
const newRoot = () => (currentDoc || new NsDocument()).createElement("div");
const text = (n) => n.textContent;

function day(i) {
  return new Date(Date.UTC(2026, 8, 15 + i)).toISOString().slice(0, 10);
}
function fullDoc(over = {}) {
  return {
    generatedAt: "2026-10-14T10:00:00Z", minGroup: 10, windowDays: 30,
    active: { dau: Array.from({ length: 30 }, (_, i) => ({ day: day(i), count: 20 + i })), wau: 60, mau: 120 },
    newVsReturning: { weeks: [{ weekStart: "2026-09-21", new: 15, returning: 40 }, { weekStart: "2026-09-28", new: null, returning: null }] },
    retention: { d1: 40, d7: 25, d30: 100 },
    engines: { auto: 70, css: 20, invert: 10 },
    themes: { "builtin:midnight": 30, custom: 12, other: null },
    features: { viewer: 50, editor: 20, customCss: 15, sitePack: 40 },
    os: { mac: 40, windows: 50, linux: 5, chromeos: null, other: null },
    chrome: { "130": 60, other: 15 },
    lang: { en: 70, de: 12 },
    ...over,
  };
}
function nullDoc() {
  return {
    generatedAt: "2026-10-14T10:00:00Z", minGroup: 10, windowDays: 30,
    active: { dau: Array.from({ length: 30 }, (_, i) => ({ day: day(i), count: null })), wau: null, mau: null },
    newVsReturning: null, retention: null, engines: null, themes: null, features: null, os: null, chrome: null, lang: null,
  };
}

await test("renders counts, shares and bars with clamped integer percent widths", () => {
  const F = load();
  const root = newRoot();
  F.renderStats(fullDoc(), root);
  const t = text(root);
  assert.ok(t.includes("120"), "MAU");
  assert.ok(t.includes("60"), "WAU");
  assert.ok(t.includes("70%"), "engine share");
  const bars = findAll(root, (n) => n.classList.contains("stats-bar-fill"));
  assert.ok(bars.length >= 10, "bars rendered");
  for (const b of bars) {
    assert.match(b.style.width, /^(100|[1-9]?\d)%$/, `width ${b.style.width}`);
  }
  assert.ok(bars.some((b) => b.style.width === "70%"));
  assert.ok(byTag(root, "polyline").length >= 1, "trend line");
  for (const p of byTag(root, "polyline")) assert.match(p.getAttribute("points"), /^[\d. ,-]+$/);
});

await test("clamps hostile out-of-range shares", () => {
  const F = load();
  const root = newRoot();
  F.renderStats(fullDoc({ engines: { auto: 500, css: -5, invert: 10 } }), root);
  const widths = findAll(root, (n) => n.classList.contains("stats-bar-fill")).map((b) => b.style.width);
  for (const w of widths) assert.match(w, /^(100|[1-9]?\d)%$/);
});

await test("null counts and shares render as 'fewer than 10'", () => {
  const F = load();
  const root = newRoot();
  F.renderStats(fullDoc(), root);
  assert.ok(text(root).includes("fewer than 10"));
  const d = fullDoc();
  d.active.wau = null;
  const r2 = newRoot();
  F.renderStats(d, r2);
  assert.ok(text(r2).includes("fewer than 10"));
});

await test("all-null document renders 'Not enough data yet' and no chart", () => {
  const F = load();
  const root = newRoot();
  F.renderStats(nullDoc(), root);
  assert.ok(text(root).includes("Not enough data yet"));
  assert.strictEqual(byTag(root, "svg").length, 0);
  assert.strictEqual(findAll(root, (n) => n.classList.contains("stats-bar-fill")).length, 0);
});

await test("hostile keys are inert text, never elements", () => {
  const F = load();
  const root = newRoot();
  const evil = "<img src=x onerror=alert(1)>";
  F.renderStats(fullDoc({ themes: { [evil]: 30 }, lang: { [evil]: 20 } }), root);
  assert.ok(text(root).includes(evil));
  assert.strictEqual(byTag(root, "img").length, 0);
});

await test("prototype-chain key names render as inert raw text, not inherited properties", () => {
  const F = load();
  const root = newRoot();
  F.renderStats(fullDoc({ os: JSON.parse('{"constructor":40,"__proto__":10,"toString":5}') }), root);
  const labels = findAll(root, (n) => n.classList.contains("stats-bar-label")).map((n) => n.textContent);
  assert.ok(labels.includes("constructor") && labels.includes("toString"), "raw key shown for prototype names: " + labels.join("|"));
  assert.ok(!labels.some((l) => /function|\[object/.test(l)), "no inherited function/object text");
});

await test("values hidden for the opposite reason say 'hidden to protect privacy', not 'fewer than 10'", () => {
  const F = load();
  const root = newRoot();
  F.renderStats(fullDoc({
    engines: { auto: null, css: 20, invert: 10 },
    features: { viewer: 50, editor: null, customCss: 15, sitePack: 40 },
    themes: { custom: 12 }, os: { mac: 40 }, chrome: { "130": 60 }, lang: { en: 70 },
  }), root);
  const t = text(root);
  const values = findAll(root, (n) => n.classList.contains("stats-bar-value")).map((n) => n.textContent);
  assert.strictEqual(values.filter((v) => v === "hidden to protect privacy").length, 2, values.join("|"));
  assert.ok(!values.some((v) => v === "fewer than 10"), "no bar value claims fewer than 10 here");
  const li = findAll(root, (n) => n.tagName === "li" && /2026-09-28/.test(n.textContent))[0];
  assert.ok(li && li.textContent.includes("hidden to protect privacy") && !li.textContent.includes("fewer than 10"), li && li.textContent);
  assert.ok(t.includes("Hidden when fewer than 10 installs used the item, or fewer than 10 did not."));
  assert.ok(t.includes("A week is hidden when either number is under 10."));
  const rows = findAll(root, (n) => n.classList.contains("stats-bar-row")).map((n) => n.textContent);
  const engines = rows.filter((r) => /Auto|CSS override|Invert/.test(r));
  assert.ok(/Auto/.test(engines[engines.length - 1]), "hidden engine sorts last");
});

await test("trend line is broken at hidden days", () => {
  const F = load();
  const root = newRoot();
  const d = fullDoc();
  d.active.dau[10].count = null;
  F.renderStats(d, root);
  assert.strictEqual(byTag(root, "polyline").length, 2, "two segments around the hidden day");
  const root2 = newRoot();
  F.renderStats(fullDoc(), root2);
  assert.strictEqual(byTag(root2, "polyline").length, 1);
});

await test("built-in theme ids render as readable names; unknown ids stay raw text", () => {
  const F = load();
  const root = newRoot();
  F.renderStats(fullDoc({ themes: { "builtin:midnight": 30, "builtin:sepia": 12, "builtin:zzz": 5, custom: 8 } }), root);
  const labels = findAll(root, (n) => n.classList.contains("stats-bar-label")).map((n) => n.textContent);
  assert.ok(labels.includes("Midnight") && labels.includes("Sepia Dark"), labels.join("|"));
  assert.ok(labels.includes("builtin:zzz"));
});

await test("malformed documents render the unavailable message and never throw", () => {
  const F = load();
  for (const bad of [null, undefined, 5, "x", [], {}, { active: 3 }, { ...fullDoc(), active: { dau: "no", wau: 1, mau: 1 } }, { ...fullDoc(), engines: 7 }]) {
    const root = newRoot();
    assert.doesNotThrow(() => F.renderStats(bad, root));
    assert.ok(text(root).includes("Statistics are temporarily unavailable"));
  }
});

await test("load(): success, fetch failure, non-200 and bad JSON", async () => {
  const F = load();
  let seen;
  const ok = async (url, opts) => { seen = [url, opts]; return { ok: true, status: 200, json: async () => fullDoc() }; };
  let root = newRoot();
  await F.load(root, ok);
  assert.strictEqual(seen[0], STATS_URL);
  assert.ok(text(root).includes("120"));
  const cases = [
    async () => { throw new Error("network"); },
    async () => ({ ok: false, status: 503, json: async () => fullDoc() }),
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }),
    async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }),
  ];
  for (const f of cases) {
    root = newRoot();
    await F.load(root, f);
    assert.ok(text(root).includes("Statistics are temporarily unavailable"));
  }
});

await test("stats.js is a safe DOM writer with exactly one URL", () => {
  for (const bad of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "cookie", "localStorage", "sessionStorage", "indexedDB"]) {
    assert.ok(!SRC.includes(bad), `stats.js must not contain ${bad}`);
  }
  // The SVG namespace identifier (createElementNS) is not a network target.
  assert.deepStrictEqual((SRC.match(/https?:\/\/[^\s"'`)]+/g) || []).filter((u) => u !== "http://www.w3.org/2000/svg"), [STATS_URL]);
  assert.strictEqual((SRC.match(/\bf\(STATS_URL/g) || []).length, 1, "single request call site");
  assert.ok(!/XMLHttpRequest|sendBeacon|WebSocket/.test(SRC));
  assert.ok(!read("js/main.js").includes("darkmode-stats"));
});

await test("stats.html has required wording, no third-party script, standard chrome", () => {
  const s = read("stats.html");
  assert.ok(s.includes("These numbers count only people who opted in to anonymous usage statistics, so they understate real use. Groups of fewer than 10 installs are never shown."));
  assert.ok(s.includes("A retention figure of 0% or 100% means none or all of a small group returned."));
  assert.ok(/30 days/.test(s) && /once an hour/.test(s));
  assert.ok(/href="privacy\.html[^"]*"/.test(s));
  const scripts = [...s.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(scripts.sort(), ["js/main.js", "js/stats.js"]);
  assert.ok(!/https?:\/\/pshah\.fun\/api/.test(s), "URL only in stats.js");
  assert.ok(s.includes('class="site-header"') && s.includes('class="site-footer"'));
  assert.ok(/<h1[\s>]/.test(s));
});

await test("stats.html describes the counted fields grammatically", () => {
  const s = read("stats.html");
  assert.ok(!s.includes("yes/no the theme"));
  assert.ok(s.includes("the theme in use, and yes/no flags for engines and features"));
});

await test("every other page footer links to the stats page after Privacy Policy", () => {
  const pages = [
    ...fs.readdirSync(docsDir).filter((f) => f.endsWith(".html")),
    ...fs.readdirSync(path.join(docsDir, "blog")).filter((f) => f.endsWith(".html")).map((f) => `blog/${f}`),
  ].filter((f) => f !== "get.html"); // get.html is a bare redirect page with no footer
  for (const f of pages) {
    const base = f.startsWith("blog/") ? "../" : "";
    const re = new RegExp(`<li><a href="${base.replace(".", "\\.")}privacy\\.html">Privacy Policy</a></li>\\s*<li><a href="${base.replace(".", "\\.")}stats\\.html">Usage statistics</a></li>`);
    assert.ok(re.test(read(f)), `${f}: footer link`);
  }
});

await test("sitemap and llms.txt list the stats page", () => {
  assert.ok(read("sitemap.xml").includes("<loc>https://darkmode.pshah.fun/stats.html</loc>"));
  assert.ok(read("llms.txt").includes("https://darkmode.pshah.fun/stats.html"));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
