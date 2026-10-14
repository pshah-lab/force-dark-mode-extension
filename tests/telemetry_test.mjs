// tests/telemetry_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadUmd } from "./helpers/loadUmd.mjs";
import * as T from "../src/shared/telemetry.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log("=========================================");
console.log("📊 Running Telemetry Allow-list Tests");
console.log("=========================================\n");

const UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ID = "123e4567-e89b-42d3-a456-426614174000";

function good() {
  let tally = T.emptyTally("2026-10-14");
  tally = T.recordUsage(tally, { engine: "css" });
  tally = T.recordUsage(tally, { theme: "builtin:nord" });
  tally = T.recordUsage(tally, { feature: "viewer" });
  return T.buildHeartbeat({ id: ID, version: "2.1.0", tally, env: T.buildEnv({ userAgent: UA_MAC, lang: "en-US" }) });
}

test("constants", () => {
  assert.deepStrictEqual(T.ENGINES, ["auto", "css", "invert"]);
  assert.deepStrictEqual(T.FEATURES, ["viewer", "editor", "customCss", "sitePack"]);
  assert.deepStrictEqual(T.OS_FAMILIES, ["mac", "windows", "linux", "chromeos", "other"]);
});

test("BUILTIN_THEME_IDS matches builtinThemes.js", () => {
  const ctx = loadUmd(["src/shared/themeCore.js", "src/shared/builtinThemes.js"]);
  const ids = Array.from(ctx.ForceDarkThemes.getBuiltinThemes(), (t) => t.id);
  assert.deepStrictEqual([...T.BUILTIN_THEME_IDS].sort(), ids.sort());
});

test("utcDay formats YYYY-MM-DD in UTC", () => {
  assert.strictEqual(T.utcDay(new Date("2026-10-14T23:59:59Z")), "2026-10-14");
});

test("emptyTally is all false", () => {
  const t = T.emptyTally("2026-10-14");
  assert.deepStrictEqual(t, {
    day: "2026-10-14",
    engines: { auto: false, css: false, invert: false },
    theme: null,
    features: { viewer: false, editor: false, customCss: false, sitePack: false },
  });
});

test("validateHeartbeat accepts a built heartbeat", () => {
  const hb = good();
  assert.strictEqual(T.validateHeartbeat(hb), true);
  assert.deepStrictEqual(Object.keys(hb).sort(), ["day", "engines", "env", "features", "id", "theme", "version"]);
  assert.strictEqual(hb.engines.css, true);
  assert.strictEqual(hb.theme, "builtin:nord");
  assert.deepStrictEqual(hb.env, { chrome: 126, os: "mac", lang: "en" });
});

test("buildHeartbeat falls back to the default built-in theme when none was seen", () => {
  const hb = T.buildHeartbeat({ id: ID, version: "2.1.0", tally: T.emptyTally("2026-10-14"), env: { chrome: 126, os: "mac", lang: "en" } });
  assert.strictEqual(typeof hb.theme, "string");
  assert.strictEqual(T.validateHeartbeat(hb), true);
});

test("validateHeartbeat rejects extra keys at every level", () => {
  for (const mut of [
    (h) => { h.host = "a.com"; },
    (h) => { h.env.url = "x"; },
    (h) => { h.engines.other = true; },
    (h) => { h.features.other = true; },
  ]) {
    const h = good(); mut(h);
    assert.strictEqual(T.validateHeartbeat(h), false);
  }
});

test("validateHeartbeat rejects missing keys", () => {
  const h = good(); delete h.features.viewer;
  assert.strictEqual(T.validateHeartbeat(h), false);
});

test("validateHeartbeat rejects bad values", () => {
  const cases = [
    (h) => { h.theme = "github.com"; },
    (h) => { h.theme = "builtin:evil"; },
    (h) => { h.env.lang = "en-US"; },
    (h) => { h.env.lang = "https://x"; },
    (h) => { h.id = "not-a-uuid"; },
    (h) => { h.features.viewer = "yes"; },
    (h) => { h.engines.css = 1; },
    (h) => { h.day = "2026-10-14T00:00:00Z"; },
    (h) => { h.version = "2.1"; },
    (h) => { h.env.chrome = 0; },
    (h) => { h.env.chrome = 1000; },
    (h) => { h.env.chrome = 12.5; },
    (h) => { h.env.os = "beos"; },
  ];
  for (const mut of cases) {
    const h = good(); mut(h);
    assert.strictEqual(T.validateHeartbeat(h), false, mut.toString());
  }
  for (const bad of [null, undefined, "x", 5, [], true]) assert.strictEqual(T.validateHeartbeat(bad), false);
});

test("sanitizeUsage accepts only known shapes", () => {
  assert.deepStrictEqual(T.sanitizeUsage({ engine: "css" }), { engine: "css" });
  assert.deepStrictEqual(T.sanitizeUsage({ theme: "builtin:nord" }), { theme: "builtin:nord" });
  assert.deepStrictEqual(T.sanitizeUsage({ feature: "viewer" }), { feature: "viewer" });
  assert.deepStrictEqual(T.sanitizeUsage({ theme: "user:abc" }), { theme: "user:abc" });
});

test("sanitizeUsage rejects unknown values, extra keys and non-objects", () => {
  for (const bad of [{ engine: "x" }, { host: "a.com" }, { feature: "viewer", url: "x" }, {}, null, undefined, "css", 5, [], { feature: "nope" }, { theme: 5 }]) {
    assert.strictEqual(T.sanitizeUsage(bad), null, JSON.stringify(bad));
  }
});

test("recordUsage is pure and maps non-builtin themes to custom", () => {
  const t0 = T.emptyTally("2026-10-14");
  const t1 = T.recordUsage(t0, { theme: "user:abc" });
  assert.strictEqual(t1.theme, "custom");
  assert.strictEqual(t0.theme, null);
  const t2 = T.recordUsage(T.recordUsage(t1, { theme: "builtin:dim" }), { theme: "user:z" });
  assert.strictEqual(t2.theme, "custom");
  assert.strictEqual(T.recordUsage(t1, { theme: "builtin:dim" }).theme, "builtin:dim");
  assert.strictEqual(T.recordUsage(t0, { feature: "editor" }).features.editor, true);
  assert.strictEqual(t0.features.editor, false);
});

test("buildEnv parses chrome major and OS family and lang", () => {
  const cases = [
    [UA_MAC, "mac"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36", "windows"],
    ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36", "chromeos"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36", "linux"],
    ["Mozilla/5.0 (Plan9) Chrome/117.0.0.0", "other"],
  ];
  for (const [ua, os] of cases) assert.strictEqual(T.buildEnv({ userAgent: ua, lang: "en-US" }).os, os);
  assert.strictEqual(T.buildEnv({ userAgent: UA_MAC, lang: "en-US" }).chrome, 126);
  assert.strictEqual(T.buildEnv({ userAgent: UA_MAC, lang: "en-US" }).lang, "en");
  assert.strictEqual(T.buildEnv({ userAgent: UA_MAC, lang: "pt_BR" }).lang, "pt");
});

test("buildEnv output validates even for junk input", () => {
  const env = T.buildEnv({ userAgent: "garbage", lang: "https://evil" });
  const hb = T.buildHeartbeat({ id: ID, version: "2.1.0", tally: T.emptyTally("2026-10-14"), env });
  assert.strictEqual(T.validateHeartbeat(hb), true);
});

test("telemetry.js has no chrome.* calls or network patterns", () => {
  const src = fs.readFileSync(path.join(rootDir, "src/shared/telemetry.js"), "utf8");
  for (const re of [/\bchrome\./, /\bfetch\s*\(/, /https?:\/\//, /XMLHttpRequest/, /WebSocket/, /sendBeacon/]) {
    assert.ok(!re.test(src), String(re));
  }
});

function walkSrc(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "vendor") continue;
      walkSrc(full, out);
    } else if (/\.(js|mjs)$/.test(e.name)) out.push(full);
  }
  return out;
}

test("every USAGE message literal under src/ carries only type plus engine, theme or feature", () => {
  let found = 0;
  for (const file of walkSrc(path.join(rootDir, "src"))) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/\{[^{}]*\btype:\s*["']USAGE["'][^{}]*\}/g)) {
      found++;
      const keys = [...m[0].matchAll(/(?:^|[{,]\s*)([A-Za-z_]\w*)\s*[:,}]/g)].map((k) => k[1]);
      const extra = keys.filter((k) => !["type", "engine", "theme", "feature"].includes(k));
      assert.deepStrictEqual(extra, [], `${path.relative(rootDir, file)}: ${m[0]}`);
      assert.ok(keys.filter((k) => k !== "type").length <= 1, `${path.relative(rootDir, file)}: ${m[0]}`);
    }
  }
  assert.ok(found >= 4, `expected USAGE literals in content, viewer and editor, found ${found}`);
});

test("serviceWorker returns early on foreign senders before any telemetry handling", () => {
  const src = fs.readFileSync(path.join(rootDir, "src/background/serviceWorker.js"), "utf8");
  const guard = src.indexOf("sender.id !== chrome.runtime.id");
  const handle = src.indexOf("handleTelemetryMessage(");
  assert.ok(guard !== -1, "sender id guard missing");
  assert.ok(handle !== -1, "telemetry handler not wired");
  assert.ok(guard < handle, "guard must precede telemetry handling");
  assert.match(src.slice(guard - 5, guard + 60), /if \(sender\.id !== chrome\.runtime\.id\) return;/);
});

test("fetch is called only from telemetrySender.js (vendored pdf.js excluded)", () => {
  for (const file of walkSrc(path.join(rootDir, "src"))) {
    if (file.endsWith(path.join("background", "telemetrySender.js"))) continue;
    assert.ok(!/\bfetch\s*\(/.test(fs.readFileSync(file, "utf8")), path.relative(rootDir, file));
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
