// tests/usage_panel_features_test.mjs — the side panel's (popup.js) opt-in usage hooks (consent v4).
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { FEATURE_KEYS } from "../src/shared/usageReport.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

console.log("=========================================");
console.log("📊 Running Side Panel Usage Feature Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

const js = read("src/popup/popup.js");
const MAPPERS = ["toggleFeatureKey", "engineFeatureKey", "themeFeatureKey"];
const PANEL_KEYS = [
  "toggle_on", "toggle_off", "native_dark_override", "engine_auto", "engine_css", "engine_invert",
  "theme_default", "theme_builtin", "theme_custom", "bg_color_changed", "brightness_changed", "contrast_changed",
  "sepia_changed", "image_dim_changed", "media_control_changed", "filters_reset", "site_report_sent",
];

// Source of a function declaration `function name(` up to its matching closing brace.
function functionBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return "";
}

// Argument text of every call `name(...)` (not its declaration).
function callArgs(src, name) {
  const out = [];
  const re = new RegExp(`(?<![\\w.])${name}\\(`, "g");
  let m;
  while ((m = re.exec(src))) {
    if (src.slice(Math.max(0, m.index - 9), m.index) === "function ") continue;
    let depth = 1;
    let i = m.index + m[0].length;
    const begin = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    out.push({ index: m.index, args: src.slice(begin, i - 1).trim() });
  }
  return out;
}

function loadPopupScript() {
  const ctx = { document: { addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(js, ctx, { filename: "popup.js" });
  return ctx;
}

// ---- Pure mappers -------------------------------------------------------

await test("every panel key is in FEATURE_KEYS", () => {
  for (const key of PANEL_KEYS) assert.ok(FEATURE_KEYS.includes(key), key);
});

await test("the value->key mappers are top-level functions and return only allow-listed keys", () => {
  const ctx = loadPopupScript();
  for (const name of MAPPERS) assert.strictEqual(typeof ctx[name], "function", name);
  assert.strictEqual(ctx.toggleFeatureKey(true), "toggle_on");
  assert.strictEqual(ctx.toggleFeatureKey(false), "toggle_off");
  assert.strictEqual(ctx.engineFeatureKey("auto"), "engine_auto");
  assert.strictEqual(ctx.engineFeatureKey("css"), "engine_css");
  assert.strictEqual(ctx.engineFeatureKey("invert"), "engine_invert");
  for (const bad of ["", "dom", "engine_css", null, undefined, 3]) assert.strictEqual(ctx.engineFeatureKey(bad), null, String(bad));
  // Every string literal a mapper can return is allow-listed.
  for (const name of MAPPERS) {
    const body = functionBody(js, name);
    const returned = [...body.matchAll(/return[^;]*?"([a-z_]+)"/g), ...body.matchAll(/\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)]
      .flatMap((m) => m.slice(1).filter(Boolean));
    assert.ok(returned.length >= 2, `${name} returns literals`);
    for (const key of returned) assert.ok(FEATURE_KEYS.includes(key), `${name} -> ${key}`);
  }
});

await test("themeFeatureKey buckets the theme and never echoes the id or name", () => {
  const { themeFeatureKey } = loadPopupScript();
  const cases = { "": "theme_default", default: "theme_default", "builtin:forest": "theme_builtin", "user:My Secret Theme": "theme_custom" };
  for (const [id, key] of Object.entries(cases)) {
    const out = themeFeatureKey(id);
    assert.strictEqual(out, key, JSON.stringify(id));
    if (id.includes(":")) {
      assert.ok(!out.includes(id) && !out.includes(id.split(":")[1]), "output contains the id");
    }
    assert.ok(!/forest|secret|my/i.test(out), "output contains part of the id or name");
  }
  for (const bad of [null, undefined, 3, {}, "nope", "builtinx", "users:x"]) {
    const out = themeFeatureKey(bad);
    assert.ok(out === null || FEATURE_KEYS.includes(out), `${String(bad)} -> ${out}`);
  }
});

// ---- reportFeature: the only send site ------------------------------------

await test("popup.js has exactly one USAGE_FEATURE send, inside reportFeature(key)", () => {
  assert.strictEqual((js.match(/USAGE_FEATURE/g) || []).length, 1, "USAGE_FEATURE appears once");
  const body = functionBody(js, "reportFeature");
  assert.ok(/^function reportFeature\(key\)/.test(body), "plain (non-async) reportFeature(key)");
  assert.ok(body.includes("USAGE_FEATURE"), "the send is inside reportFeature");
});

await test("reportFeature sends only {type, key, surface}, surface from SurfaceKind inside try/catch, rejections ignored", () => {
  const body = functionBody(js, "reportFeature");
  assert.ok(
    /try\s*\{[\s\S]*SurfaceKind\.surfaceFor\([\s\S]*chrome\.runtime\.sendMessage\(\{\s*type:\s*"USAGE_FEATURE",\s*key,\s*surface\s*\}\)[\s\S]*\}\s*catch/.test(body),
    "surface computed and message sent inside try/catch with exactly {type, key, surface}"
  );
  assert.ok(/\.catch\(/.test(body), "a returned rejected promise is ignored");
  assert.ok(!/\bawait\b/.test(body), "never awaits");
  assert.ok(!/await\s+reportFeature/.test(js), "reportFeature is never awaited");
});

await test("every reportFeature call passes a key literal or a mapper result, never a URL, host, name or theme id", () => {
  const calls = callArgs(js, "reportFeature");
  assert.ok(calls.length >= 12, `expected the panel hooks, found ${calls.length}`);
  const seen = new Set();
  for (const { args } of calls) {
    const lit = args.match(/^"([a-z_]+)"$/);
    if (lit) {
      assert.ok(FEATURE_KEYS.includes(lit[1]), `reportFeature("${lit[1]}") is not allow-listed`);
      seen.add(lit[1]);
      continue;
    }
    assert.ok(
      /^(toggleFeatureKey|engineFeatureKey|themeFeatureKey)\([A-Za-z.]+\)$/.test(args),
      `reportFeature(${args}) must pass a literal key or a mapper result`
    );
    assert.ok(!/\bhost\b|url|\.name\b|\bname\b|tab\b/i.test(args), `reportFeature(${args}) leaks data`);
    seen.add(args.split("(")[0]);
  }
  for (const key of ["native_dark_override", "bg_color_changed", "brightness_changed", "contrast_changed",
    "sepia_changed", "image_dim_changed", "media_control_changed", "filters_reset", "site_report_sent"]) {
    assert.ok(seen.has(key), `no hook reports ${key}`);
  }
  for (const m of MAPPERS) assert.ok(seen.has(m), `no hook uses ${m}`);
});

// ---- Hook placement --------------------------------------------------------

await test("sliders and the colour picker count on change, never on input", () => {
  const wiring = {
    backgroundColorInput: "bg_color_changed",
    brightnessInput: "brightness_changed",
    contrastInput: "contrast_changed",
    sepiaInput: "sepia_changed",
    imageDimInput: "image_dim_changed",
  };
  for (const [input, key] of Object.entries(wiring)) {
    const re = new RegExp(`${input}\\.onchange\\s*=\\s*\\(\\)\\s*=>\\s*reportFeature\\("${key}"\\)`);
    assert.ok(re.test(js), `${input}.onchange reports ${key}`);
  }
  // No input handler (or the shared debounced sender) reports anything.
  for (const marker of ["backgroundColorInput.oninput", "imageDimInput.oninput"]) {
    const start = js.indexOf(marker);
    assert.ok(start > -1, marker);
    const end = js.indexOf("\n  };", start);
    assert.ok(!/reportFeature/.test(js.slice(start, end)), `${marker} must not report`);
  }
  assert.ok(!/reportFeature/.test(functionBody(js, "sendFilterUpdate")), "sendFilterUpdate must not report");
});

// The arrow-function handler text assigned at `marker`, up to the closing `\n  };` at the same indent.
function handler(marker, indent = "  ") {
  const start = js.indexOf(marker);
  assert.ok(start > -1, marker);
  const end = js.indexOf(`\n${indent}};`, start);
  return js.slice(start, end);
}

await test("each action reports after its TOGGLE / SITE_REPORT is sent", () => {
  const after = (text, sendRe, reportRe, label) => {
    const send = text.search(sendRe);
    const report = text.search(reportRe);
    assert.ok(send > -1, `${label}: send found`);
    assert.ok(report > send, `${label}: reported after the send`);
  };
  after(handler("button.onclick"), /type: "TOGGLE"/, /reportFeature\(toggleFeatureKey\(nextEnabled\)\)/, "toggle");
  after(handler("themeSelect.onchange"), /type: "TOGGLE"/, /reportFeature\(themeFeatureKey\(themeId\)\)/, "theme");
  after(handler("nativeDarkToggle.onclick"), /type: "TOGGLE"/, /if \(next === "force"\) reportFeature\("native_dark_override"\)/, "native dark");
  after(handler("radio.onchange", "    "), /type: "TOGGLE"/, /reportFeature\(engineFeatureKey\(radio\.value\)\)/, "engine");
  const media = js.slice(js.indexOf("mediaRadios.forEach((radio) => {\n    radio.onchange"));
  after(media.slice(0, media.indexOf("\n  });")), /type: "TOGGLE"/, /reportFeature\("media_control_changed"\)/, "media");
  after(handler("resetFiltersButton.onclick"), /sendFilterUpdate\(\)/, /reportFeature\("filters_reset"\)/, "reset");
  after(handler("reportSend.onclick"), /type: "SITE_REPORT"/, /if \(outcome === "sent"\) reportFeature\("site_report_sent"\)/, "report");
});

await test("popup.html loads surface.js before popup.js", () => {
  const html = read("src/popup/popup.html");
  const surface = html.indexOf('<script src="../shared/surface.js"></script>');
  const popup = html.indexOf('src="popup.js"');
  assert.ok(surface > -1, "surface.js is loaded");
  assert.ok(popup > surface, "surface.js comes before popup.js");
});

await test("popup.js still has no .innerHTML", () => {
  assert.ok(!/\.innerHTML/.test(js));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
