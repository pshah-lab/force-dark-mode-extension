// tests/privacy_security_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";
import vm from "vm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("=========================================");
console.log("🛡️  Running Privacy & Security Compliance Suite");
console.log("=========================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
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

// 1. Network Isolation & Zero Egress
console.log("1. Network Isolation & Egress Verification");

// Single source of truth for the egress scan; the exhaustive src/ walk in section 8 reuses it.
const EGRESS_SCANNED_FILES = [
  "src/background/serviceWorker.js",
  "src/background/siteReportSender.js",
  "src/content/index.js",
  "src/content/themeEngine/cssOverrideEngine.js",
  "src/content/themeEngine/invertEngine.js",
  "src/popup/popup.js",
  "src/popup/feedbackPrompt.js",
  "src/popup/panelTabEvents.js",
  "src/popup/reportCard.js",
  "src/options/options.js",
  "src/options/themeEditor.js",
  "src/options/customCssEditor.js",
  "src/shared/storage.js",
  "src/shared/themeCore.js",
  "src/shared/builtinThemes.js",
  "src/shared/zipReader.js",
  "src/shared/colorUtils.js",
  "src/shared/sitePacks.js",
  "src/shared/customCss.js",
  "src/shared/constants.js",
  "src/viewer/viewer.js",
  "src/viewer/parsers/docxParser.js",
  "src/viewer/parsers/pptxParser.js",
  "src/viewer/spreadsheet/cellColors.js",
  "src/viewer/spreadsheet/csvParser.js",
  "src/viewer/spreadsheet/errors.js",
  "src/viewer/spreadsheet/numberFormat.js",
  "src/viewer/spreadsheet/pixelMath.js",
  "src/viewer/spreadsheet/spreadsheetLimits.js",
  "src/viewer/spreadsheet/spreadsheetRenderer.js",
  "src/viewer/spreadsheet/spreadsheetView.js",
  "src/viewer/spreadsheet/xlsxParser.js",
  "src/viewer/spreadsheet/xlsxStyles.js",
];

test("zero outbound network calls in extension core code", () => {
  const extensionJsFiles = EGRESS_SCANNED_FILES;

  const prohibitedPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bnavigator\.sendBeacon\b/,
    /\baxios\b/,
    /\bhttp:\/\//,
    /\bhttps:\/\//,
  ];

  for (const relPath of extensionJsFiles) {
    const code = fs.readFileSync(path.join(rootDir, relPath), "utf8");
    for (const pattern of prohibitedPatterns) {
      const match = code.match(pattern);
      assert.strictEqual(
        match,
        null,
        `Prohibited network egress pattern (${pattern}) detected in ${relPath}`
      );
    }
  }
});

test("companion website makes zero third-party telemetry network calls", () => {
  const websiteJs = fs.readFileSync(path.join(rootDir, "docs/js/main.js"), "utf8");
  assert.strictEqual(
    websiteJs.includes("abacus.jasoncameron.dev"),
    false,
    "docs/js/main.js must not call external counter abacus"
  );
  assert.strictEqual(
    websiteJs.includes("countapi.mileshilliard.com"),
    false,
    "docs/js/main.js must not call external counter countapi"
  );
  assert.strictEqual(
    websiteJs.includes("google-analytics.com"),
    false,
    "website must not contain Google Analytics"
  );
  // The only network destination allowed is the first-party, cookie-free visit counter.
  const urls = websiteJs.match(/https?:\/\/[^\s"'`)]+/g) || [];
  for (const url of urls) {
    assert.ok(
      url.startsWith("https://pshah.fun/api/darkmode-visit") || url.startsWith("https://chromewebstore.google.com/"),
      `docs/js/main.js references an unexpected URL: ${url}`
    );
  }
});

test("only docs/js/stats.js may reference the usage statistics endpoint, and nothing else", () => {
  const jsDir = path.join(rootDir, "docs/js");
  for (const f of fs.readdirSync(jsDir).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(jsDir, f), "utf8");
    const urls = src.match(/https?:\/\/[^\s"'`)]+/g) || [];
    if (f === "stats.js") {
      // The SVG namespace is an XML identifier passed to createElementNS, never a network target.
      const nonNs = urls.filter((u) => u !== "http://www.w3.org/2000/svg");
      assert.deepStrictEqual(nonNs, ["https://pshah.fun/api/darkmode-stats"], "docs/js/stats.js may contain exactly the stats URL");
      continue;
    }
    assert.ok(!src.includes("darkmode-stats"), `docs/js/${f} must not reference the stats endpoint`);
    for (const url of urls) {
      assert.ok(
        url.startsWith("https://pshah.fun/api/darkmode-visit") || url.startsWith("https://chromewebstore.google.com/"),
        `docs/js/${f} references an unexpected URL: ${url}`
      );
    }
  }
});

// 2. Data Minimization & Leakage Protection
console.log("\n2. Data Minimization & Leakage Protection");

test("popup.js transmits only hostname in runtime messages (no URL query leakage)", () => {
  const popupJs = fs.readFileSync(path.join(rootDir, "src/popup/popup.js"), "utf8");
  assert.strictEqual(
    popupJs.includes("url: tab.url"),
    false,
    "popup.js should not pass full tab.url across runtime messaging"
  );
  assert.ok(
    popupJs.includes("host,"),
    "popup.js should pass minimized host parameter in messages"
  );
});

test("serviceWorker.js prioritizes minimized host from message payload", () => {
  const swJs = fs.readFileSync(path.join(rootDir, "src/background/serviceWorker.js"), "utf8");
  assert.ok(
    swJs.includes("msg.host"),
    "service worker should accept msg.host directly for minimization"
  );
  assert.ok(
    swJs.includes("isSafeKey"),
    "service worker should validate host safety"
  );
});

// 3. Storage Security & Prototype Pollution
console.log("\n3. Storage Security & Prototype Pollution");

const storageModule = await import("../src/shared/storage.js");

test("isSafeKey blocks prototype pollution attacks", () => {
  assert.strictEqual(storageModule.isSafeKey("__proto__"), false);
  assert.strictEqual(storageModule.isSafeKey("__PROTO__"), false);
  assert.strictEqual(storageModule.isSafeKey("constructor"), false);
  assert.strictEqual(storageModule.isSafeKey("prototype"), false);
  assert.strictEqual(storageModule.isSafeKey("   prototype   "), false);
  assert.strictEqual(storageModule.isSafeKey(""), false);
  assert.strictEqual(storageModule.isSafeKey(null), false);
  assert.strictEqual(storageModule.isSafeKey(undefined), false);
  assert.strictEqual(storageModule.isSafeKey("github.com"), true);
  assert.strictEqual(storageModule.isSafeKey("wikipedia.org"), true);
  assert.strictEqual(storageModule.isSafeKey("local_files"), true);
});

// 4. Data Portability & Right to Erasure
console.log("\n4. Data Portability & Right to Erasure");

// Create storage mock
const mockStorageData = {};
global.chrome = {
  runtime: {
    lastError: null,
    id: "test-extension-id",
  },
  storage: {
    sync: {
      get: (key, cb) => {
        if (key === null) {
          cb({ ...mockStorageData });
        } else if (typeof key === "string") {
          cb({ [key]: mockStorageData[key] });
        } else {
          cb({});
        }
      },
      set: (items, cb) => {
        Object.assign(mockStorageData, items);
        if (cb) cb();
      },
      clear: (cb) => {
        for (const k of Object.keys(mockStorageData)) {
          delete mockStorageData[k];
        }
        if (cb) cb();
      },
    },
    local: {
      get: (key, cb) => cb({ [key]: mockStorageData[`local:${key}`] }),
      set: (items, cb) => {
        for (const [k, v] of Object.entries(items)) {
          mockStorageData[`local:${k}`] = v;
        }
        if (cb) cb();
      },
    },
  },
};

testAsync("exportSettingsJson exports sanitized JSON payload (Portability)", async () => {
  await storageModule.setSiteConfig("wikipedia.org", {
    enabled: true,
    engine: "css",
    backgroundColor: "#111111",
  });

  const exportedString = await storageModule.exportSettingsJson();
  const parsed = JSON.parse(exportedString);

  assert.strictEqual(parsed.version, "2.0.1");
  assert.ok(parsed.exportDate);
  assert.ok(parsed.settings["wikipedia.org"]);
  assert.strictEqual(parsed.settings["wikipedia.org"].engine, "css");
});

testAsync("setSiteConfig clamps filter values to their valid ranges", async () => {
  await storageModule.setSiteConfig("out-of-range.com", {
    enabled: true,
    engine: "css",
    brightness: 999,
    contrast: -50,
    sepia: 500,
  });

  const config = await storageModule.getSiteConfig("out-of-range.com");
  assert.strictEqual(config.brightness, 150, "brightness should clamp to max 150");
  assert.strictEqual(config.contrast, 50, "contrast should clamp to min 50");
  assert.strictEqual(config.sepia, 100, "sepia should clamp to max 100");

  await storageModule.setSiteConfig("no-filters-given.com", { enabled: true });
  const defaults = await storageModule.getSiteConfig("no-filters-given.com");
  assert.strictEqual(defaults.brightness, 100);
  assert.strictEqual(defaults.contrast, 100);
  assert.strictEqual(defaults.sepia, 0);
});

testAsync("setScheduleConfig sanitizes mode and time values, stored separately from sync", async () => {
  await storageModule.setScheduleConfig({ mode: "time", start: "20:00", end: "07:00" });
  const config = await storageModule.getScheduleConfig();
  assert.strictEqual(config.mode, "time");
  assert.strictEqual(config.start, "20:00");
  assert.strictEqual(config.end, "07:00");

  // Invalid values fall back to safe defaults instead of being stored as-is.
  await storageModule.setScheduleConfig({ mode: "not-a-mode", start: "bad", end: "25:99" });
  const fallback = await storageModule.getScheduleConfig();
  assert.strictEqual(fallback.mode, "off");
  assert.strictEqual(fallback.start, "20:00");
  assert.strictEqual(fallback.end, "07:00");

  // Schedule data must never surface through the per-site export (different storage area).
  const exportedString = await storageModule.exportSettingsJson();
  const parsed = JSON.parse(exportedString);
  assert.strictEqual(parsed.settings.scheduleConfig, undefined);
});

testAsync("importSettingsJson validates schema and rejects malformed payloads", async () => {
  const validPayload = JSON.stringify({
    settings: {
      "github.com": { enabled: true, engine: "invert", backgroundColor: "#000000" },
    },
  });

  const count = await storageModule.importSettingsJson(validPayload);
  assert.strictEqual(count, 1);
  const config = await storageModule.getSiteConfig("github.com");
  assert.strictEqual(config.engine, "invert");

  // Rejection tests
  await assert.rejects(async () => {
    await storageModule.importSettingsJson("");
  }, /Empty or invalid/);

  await assert.rejects(async () => {
    await storageModule.importSettingsJson("{ invalid-json }");
  }, /Invalid JSON/);

  await assert.rejects(async () => {
    await storageModule.importSettingsJson(JSON.stringify({ settings: {} }));
  }, /No valid configuration/);
});

testAsync("clearAllConfigs wipes all stored entries (Right to Erasure)", async () => {
  await storageModule.setSiteConfig("site1.com", { enabled: true });
  await storageModule.setSiteConfig("site2.com", { enabled: false });

  assert.ok((await storageModule.getSiteConfig("site1.com")));
  await storageModule.clearAllConfigs();

  const all = await storageModule.getAllConfigs();
  assert.deepStrictEqual(all, {});
});

// 5. XSS Defense & Safe DOM Construction
console.log("\n5. XSS Defense & Safe DOM Construction");

test("viewer.js completely avoids innerHTML", () => {
  const viewerJs = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.js"), "utf8");
  assert.strictEqual(
    viewerJs.includes(".innerHTML"),
    false,
    "viewer.js must not assign or read .innerHTML"
  );
  assert.ok(
    viewerJs.includes("replaceChildren()"),
    "viewer.js should use safe replaceChildren DOM API"
  );
});

test("spreadsheet modules contain no network APIs, eval, or HTML-string DOM writes", () => {
  const dir = path.join(rootDir, "src/viewer/spreadsheet");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".js"));
  assert.ok(files.length >= 9, "expected the spreadsheet modules to be present");

  const prohibited = [
    [/\bfetch\s*\(/, "fetch"],
    [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
    [/\bsendBeacon\b/, "sendBeacon"],
    [/\bWebSocket\b/, "WebSocket"],
    [/\bimportScripts\b/, "importScripts"],
    [/\beval\s*\(/, "eval"],
    [/\bnew\s+Function\b/, "new Function"],
    [/\.innerHTML\b/, ".innerHTML"],
    [/\binsertAdjacentHTML\b/, "insertAdjacentHTML"],
    [/\bouterHTML\b/, "outerHTML"],
    [/\bhttps?:\/\//, "hard-coded URL"],
  ];

  for (const name of files) {
    const code = fs.readFileSync(path.join(dir, name), "utf8");
    for (const [pattern, label] of prohibited) {
      assert.strictEqual(
        pattern.test(code),
        false,
        `Prohibited pattern (${label}) detected in src/viewer/spreadsheet/${name}`
      );
    }
  }
});

test("viewer.html declares the spreadsheet panel and accepts spreadsheet files", () => {
  const viewerHtml = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.html"), "utf8");
  assert.ok(
    /<section id="spreadsheet-panel" class="spreadsheet-panel" hidden>/.test(viewerHtml),
    "viewer.html must contain the hidden spreadsheet panel"
  );
  for (const token of [".xlsx", ".csv", ".xls", "text/csv"]) {
    assert.ok(viewerHtml.includes(token), `file input accept list must include ${token}`);
  }
});

test("manifest permissions are unchanged by the spreadsheet viewer", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  assert.deepStrictEqual(manifest.permissions, ["storage", "activeTab", "contextMenus", "sidePanel"]);
});

test("viewer.html sandboxes iframe without allow-same-origin", () => {
  const viewerHtml = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.html"), "utf8");
  assert.ok(
    viewerHtml.includes('sandbox="allow-scripts"'),
    "viewer fallback iframe must be strictly sandboxed"
  );
  assert.strictEqual(
    viewerHtml.includes("allow-same-origin"),
    false,
    "viewer fallback iframe must NOT grant allow-same-origin"
  );
});

// 6. Security Headers & Manifest CSP
console.log("\n6. Security Headers & Manifest CSP");

test("manifest.json defines strict CSP with script-src self and object-src none", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  const csp = manifest.content_security_policy?.extension_pages || "";
  assert.ok(csp.includes("script-src 'self'"), "CSP must enforce script-src 'self'");
  assert.ok(csp.includes("object-src 'none'"), "CSP must enforce object-src 'none'");
});

test("all website HTML files include nosniff and strict-origin-when-cross-origin", () => {
  const websiteFiles = [
    "docs/index.html",
    "docs/about.html",
    "docs/features.html",
    "docs/how-it-works.html",
    "docs/support.html",
    "docs/privacy.html",
    "docs/terms.html",
    "docs/blog/index.html",
    "docs/blog/how-to-force-dark-mode-chrome.html",
    "docs/blog/dark-mode-pdf-guide.html",
    "docs/blog/dark-mode-vs-night-mode.html",
    "docs/blog/best-dark-mode-extension-guide.html",
    "docs/blog/themeswitcher-vs-dark-reader.html",
  ];

  for (const relPath of websiteFiles) {
    const html = fs.readFileSync(path.join(rootDir, relPath), "utf8");
    assert.ok(
      html.includes('http-equiv="X-Content-Type-Options" content="nosniff"'),
      `${relPath} missing X-Content-Type-Options nosniff`
    );
    assert.ok(
      html.includes('name="referrer" content="strict-origin-when-cross-origin"'),
      `${relPath} missing strict-origin-when-cross-origin referrer`
    );
  }
});

// 7. Versioning & Nomenclature Consistency
console.log("\n7. Versioning & Nomenclature Consistency");

test("manifest.json and package.json versions match SemVer standard", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));

  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "manifest.json version must follow SemVer X.Y.Z");
  assert.strictEqual(manifest.version, pkg.version, "manifest.json and package.json must have matching versions");
});

test("storage.js and options.html footer reflect current manifest version", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  const storageJs = fs.readFileSync(path.join(rootDir, "src/shared/storage.js"), "utf8");
  const optionsHtml = fs.readFileSync(path.join(rootDir, "src/options/options.html"), "utf8");

  assert.ok(
    storageJs.includes(`version: "${manifest.version}"`),
    "storage.js exportSettingsJson version must match manifest version"
  );
  assert.ok(
    optionsHtml.includes(`v${manifest.version}`),
    "options.html footer must display the current version"
  );
});

test("CHANGELOG.md and VERSIONING.md document current release and latest published version", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  const changelog = fs.readFileSync(path.join(rootDir, "CHANGELOG.md"), "utf8");
  const versioning = fs.readFileSync(path.join(rootDir, "VERSIONING.md"), "utf8");

  assert.ok(
    changelog.includes(`## [${manifest.version}]`),
    `CHANGELOG.md must contain a section for current version [${manifest.version}]`
  );
  // The published version is whatever VERSIONING.md declares; it must be documented and not ahead of the manifest.
  const published = versioning.match(/Latest Published Version:\*\* `(\d+\.\d+\.\d+)`/)?.[1];
  assert.ok(published, "VERSIONING.md must state the latest published version");
  assert.ok(
    changelog.includes(`## [${published}]`),
    `CHANGELOG.md must document latest published version [${published}]`
  );
  const toNums = (v) => v.split(".").map(Number);
  const [a, b] = [toNums(published), toNums(manifest.version)];
  const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  assert.ok(cmp <= 0, `Published version ${published} cannot be ahead of manifest version ${manifest.version}`);
});

// 8. Themes, Custom CSS & New Surface
console.log("\n8. Themes, Custom CSS & New Extension Surface");

const readManifest = () => JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));

function walkFiles(dir, ext, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}
const relToRoot = (full) => path.relative(rootDir, full).split(path.sep).join("/");

// Exhaustive-walk rules: every .js file under src/ must appear in EGRESS_SCANNED_FILES, except
// src/viewer/vendor/** (vendored, minified pdf.js; never scanned). The viewer, its parsers and the
// spreadsheet modules are walked like everything else. Any .mjs/.cjs under src/ outside vendor fails
// outright so a different extension cannot sidestep the .js filter.
// ALLOW_UNSCANNED holds any other file deliberately left out, with the reason. It must stay empty
// unless a file genuinely cannot be scanned.
const WALK_EXCLUDED_PREFIXES = ["src/viewer/vendor/"];
const ALLOW_UNSCANNED = {};
// Files allowed to touch the network. network.js is the only one that calls fetch(); the others only declare an
// endpoint URL. They are checked by the dedicated egress tests instead of the strict zero-egress patterns.
const NETWORK_PATH = "src/background/network.js";
const CLEANUP_PATH = "src/background/legacyTelemetryCleanup.js";
const REPORT_PATH = "src/shared/siteReport.js";
const EGRESS_ALLOWED = {
  [NETWORK_PATH]: "the only fetch(): JSON POST, credentials omitted, no referrer; see the dedicated egress tests",
  [CLEANUP_PATH]: "declares the delete endpoint used to erase 2.0.x usage-report data; see the dedicated egress tests",
  [REPORT_PATH]: "declares the broken-site report endpoint and what a report may contain; see the dedicated egress tests",
};
const ENDPOINT_FILES = [CLEANUP_PATH, REPORT_PATH];

test("every src/ .js file is covered by the egress scan or an explicit allow-list", () => {
  const found = walkFiles(path.join(rootDir, "src"), ".js").map(relToRoot);
  assert.ok(found.length >= 30, "expected to find the extension source files");
  const uncovered = found.filter(
    (rel) =>
      !WALK_EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix)) &&
      !EGRESS_SCANNED_FILES.includes(rel) &&
      !Object.prototype.hasOwnProperty.call(EGRESS_ALLOWED, rel) &&
      !Object.prototype.hasOwnProperty.call(ALLOW_UNSCANNED, rel)
  );
  assert.deepStrictEqual(uncovered, [], `JS files skipped by the egress scan: ${uncovered.join(", ")}`);
  for (const rel of EGRESS_SCANNED_FILES) {
    assert.ok(fs.existsSync(path.join(rootDir, rel)), `egress list names a missing file: ${rel}`);
  }
  for (const rel of [...Object.keys(ALLOW_UNSCANNED), ...Object.keys(EGRESS_ALLOWED)]) {
    assert.ok(fs.existsSync(path.join(rootDir, rel)), `allow-list names a missing file: ${rel}`);
    assert.ok(ALLOW_UNSCANNED[rel] || EGRESS_ALLOWED[rel], `allow-list entry ${rel} needs a documented reason`);
  }
});

test("no .mjs or .cjs source files under src/ outside the vendored viewer directory", () => {
  const odd = [...walkFiles(path.join(rootDir, "src"), ".mjs"), ...walkFiles(path.join(rootDir, "src"), ".cjs")]
    .map(relToRoot)
    .filter((rel) => !WALK_EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix)));
  assert.deepStrictEqual(odd, [], `Unscanned module files under src/: ${odd.join(", ")}`);
});

test("manifest permissions: storage, activeTab, contextMenus, sidePanel only; no host permissions of any kind", () => {
  const manifest = readManifest();
  assert.deepStrictEqual(manifest.permissions, ["storage", "activeTab", "contextMenus", "sidePanel"]);
  // The telemetry backend answers CORS for the extension origin instead (Ruling 13), so the update
  // never triggers a new permission warning or disables the extension for existing users.
  for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions", "externally_connectable"]) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(manifest, key), false, `manifest must not declare ${key}`);
  }
  const raw = fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8");
  assert.ok(!raw.includes("pshah.fun"), "manifest must not name the telemetry host");
});

test("no new web_accessible_resources", () => {
  const manifest = readManifest();
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(manifest, "web_accessible_resources"),
    false,
    "manifest must not expose web_accessible_resources"
  );
});

test("CSP unchanged and free of unsafe-eval, unsafe-inline and remote origins", () => {
  const manifest = readManifest();
  const csp = manifest.content_security_policy.extension_pages;
  assert.strictEqual(csp, "script-src 'self' 'wasm-unsafe-eval'; object-src 'none';");
  assert.strictEqual(Object.keys(manifest.content_security_policy).join(","), "extension_pages");
  // 'wasm-unsafe-eval' (WebAssembly only, needed by the viewer) is the one allowed token containing "unsafe-eval".
  assert.ok(!csp.replace("'wasm-unsafe-eval'", "").includes("unsafe-eval"), "CSP must not allow unsafe-eval");
  assert.ok(!csp.includes("unsafe-inline"), "CSP must not allow unsafe-inline");
  assert.ok(!/https?:|\*|data:|blob:/.test(csp), "CSP must not name remote origins or wildcards");
});

const DOM_AND_CODE_EXEC_PATTERNS = [
  [/\binnerHTML\b/, "innerHTML"],
  [/\bouterHTML\b/, "outerHTML"],
  [/\binsertAdjacentHTML\b/, "insertAdjacentHTML"],
  [/\bdocument\.write(ln)?\s*\(/, "document.write"],
  [/\beval\s*\(/, "eval("],
  [/\bnew\s+Function\b/, "new Function"],
  [/\bsetTimeout\s*\(\s*["'`]/, "string setTimeout"],
  [/\bsetInterval\s*\(\s*["'`]/, "string setInterval"],
];

test("extension pages and shared code never use HTML-string DOM writes, eval or string timers", () => {
  const files = ["src/options", "src/popup", "src/content", "src/shared"].flatMap((dir) =>
    walkFiles(path.join(rootDir, dir), ".js")
  );
  assert.ok(files.length >= 14, "expected to scan the options, popup, content and shared scripts");
  for (const full of files) {
    const code = fs.readFileSync(full, "utf8");
    for (const [pattern, label] of DOM_AND_CODE_EXEC_PATTERNS) {
      assert.strictEqual(pattern.test(code), false, `Prohibited pattern (${label}) detected in ${relToRoot(full)}`);
    }
  }
});

test("no HTML-string DOM writes, eval or string timers anywhere in src/ (background and viewer included)", () => {
  const files = walkFiles(path.join(rootDir, "src"), ".js").filter(
    (full) => !WALK_EXCLUDED_PREFIXES.some((prefix) => relToRoot(full).startsWith(prefix))
  );
  assert.ok(files.some((f) => relToRoot(f).startsWith("src/background/")), "background must be scanned");
  assert.ok(files.some((f) => relToRoot(f).startsWith("src/viewer/parsers/")), "viewer parsers must be scanned");
  for (const full of files) {
    const code = fs.readFileSync(full, "utf8");
    for (const [pattern, label] of DOM_AND_CODE_EXEC_PATTERNS) {
      assert.strictEqual(pattern.test(code), false, `Prohibited pattern (${label}) detected in ${relToRoot(full)}`);
    }
  }
});

// Origins an <a href> may point to. Scripts, stylesheets and images may never be remote.
const ALLOWED_ANCHOR_ORIGINS = [
  "https://chromewebstore.google.com/detail/force-dark-mode/",
  "https://darkmode.pshah.fun/",
  "https://github.com/pshah-lab/force-dark-mode-extension",
];

// Quoted, unquoted and protocol-relative remote values.
const REMOTE_ATTR_PATTERN = /\s(src|href|srcset|action|formaction|data)\s*=\s*(?:["']\s*)?(?:https?:)?\/\/[^\s"'>]*/i;

test("remote-attribute pattern catches quoted, unquoted and protocol-relative values", () => {
  const bad = [
    '<script src="https://cdn.example/a.js">',
    "<script src='//cdn.example/a.js'>",
    "<script src=https://cdn.example/a.js>",
    "<script src=//cdn.example/a.js>",
    '<link rel="stylesheet" href=//cdn.example/a.css>',
    '<link rel=stylesheet href="http://cdn.example/a.css">',
    "<img src=https://x.example/p.png>",
    '<iframe src="//x.example/">',
  ];
  for (const tag of bad) assert.ok(REMOTE_ATTR_PATTERN.test(tag), `should catch: ${tag}`);
  for (const tag of ['<script src="../shared/a.js">', '<link rel="stylesheet" href="viewer.css">', '<img src="icon.png">']) {
    assert.ok(!REMOTE_ATTR_PATTERN.test(tag), `should allow: ${tag}`);
  }
});

test("extension HTML pages have no inline handlers, inline scripts or remote resources", () => {
  const htmlFiles = walkFiles(path.join(rootDir, "src"), ".html");
  assert.ok(htmlFiles.length >= 3, "expected popup, options and viewer pages");
  for (const full of htmlFiles) {
    const rel = relToRoot(full);
    const html = fs.readFileSync(full, "utf8");
    const tags = html.match(/<[a-zA-Z][^>]*>/g) || [];
    for (const tag of tags) {
      assert.ok(!/\son[a-z]+\s*=/i.test(tag), `Inline event handler in ${rel}: ${tag.slice(0, 80)}`);
      assert.ok(!/\sstyle\s*=\s*["'][^"']*url\s*\(\s*["']?https?:/i.test(tag), `Remote url() in inline style in ${rel}`);
      if (/^<script\b/i.test(tag)) {
        assert.ok(/\ssrc\s*=/i.test(tag), `Inline <script> block (forbidden by MV3 CSP) in ${rel}`);
      }
      const remoteAttr = tag.match(REMOTE_ATTR_PATTERN);
      if (remoteAttr) {
        const isAnchor = /^<a\b/i.test(tag) && /\shref\s*=/i.test(remoteAttr[0]);
        const url = remoteAttr[0].replace(/^[^=]*=\s*["']?\s*/, "");
        assert.ok(
          isAnchor && ALLOWED_ANCHOR_ORIGINS.some((origin) => url.startsWith(origin)),
          `Remote reference in ${rel} is not an allowed anchor: ${tag.slice(0, 120)}`
        );
      }
    }
    assert.ok(!/<script\b(?![^>]*\ssrc\s*=)[^>]*>/i.test(html), `Inline <script> block in ${rel}`);
    assert.ok(!/<iframe\b[^>]*\ssrc\s*=\s*["']\s*(https?:)?\/\//i.test(html), `Remote iframe in ${rel}`);
  }
});

test("only chrome.storage.sync and chrome.storage.local are used; no cookies or web storage", () => {
  const allowedNamespaces = new Set(["sync", "local", "onChanged"]);
  const seen = new Set();
  for (const full of walkFiles(path.join(rootDir, "src"), ".js")) {
    const code = fs.readFileSync(full, "utf8");
    const rel = relToRoot(full);
    for (const match of code.matchAll(/\bchrome\.storage\.([A-Za-z_]+)/g)) {
      seen.add(match[1]);
      assert.ok(allowedNamespaces.has(match[1]), `Unexpected chrome.storage.${match[1]} in ${rel}`);
    }
    for (const [pattern, label] of [
      [/\bdocument\.cookie\b/, "document.cookie"],
      [/\bcookieStore\b/, "cookieStore"],
      [/\blocalStorage\b/, "localStorage"],
      [/\bsessionStorage\b/, "sessionStorage"],
      [/\bindexedDB\b/, "indexedDB"],
      [/\bchrome\.cookies\b/, "chrome.cookies"],
    ]) {
      assert.strictEqual(pattern.test(code), false, `Prohibited storage API (${label}) in ${rel}`);
    }
  }
  assert.ok(seen.has("sync") && seen.has("local"), "expected both sync and local storage to be in use");
});

// Loads the UMD files into a vm sandbox in which every network entry point throws and records itself.
function loadTrappedSandbox(overrides = {}) {
  const tripped = [];
  const trap = (name) => function () {
    tripped.push(name);
    throw new Error(`network API called: ${name}`);
  };
  const sandbox = {
    fetch: trap("fetch"),
    XMLHttpRequest: trap("XMLHttpRequest"),
    WebSocket: trap("WebSocket"),
    EventSource: trap("EventSource"),
    Image: trap("Image"),
    importScripts: trap("importScripts"),
    navigator: { sendBeacon: trap("navigator.sendBeacon") },
  };
  const ctx = vm.createContext(sandbox);
  for (const rel of [
    "src/shared/colorUtils.js",
    "src/shared/themeCore.js",
    "src/shared/builtinThemes.js",
    "src/shared/sitePacks.js",
    "src/shared/customCss.js",
  ]) {
    const code = overrides[rel] ?? fs.readFileSync(path.join(rootDir, rel), "utf8");
    vm.runInContext(code, ctx, { filename: rel });
  }
  return { ctx, tripped };
}

function exerciseThemeApis(ctx) {
  const T = ctx.ForceDarkThemes;
  const results = {};
  results.hostileCss = [
    "a { background: url(http://x) }",
    "a { background: URL( 'https://evil.example/x.png' ) }",
    "@import 'https://evil.example/a.css';",
    "a { background: u\\72l(http://x) }",
    "a { behavior: expression(alert(1)) }",
    "</style><script>alert(1)</script>",
    "a { width: expression(fetch('//x')) }",
  ].map((css) => T.validateCss(css));
  results.benignCss = [".x { color: #fff; }", "body > main { scroll-behavior: smooth }", ""].map((css) => T.validateCss(css));
  const goodTheme = { id: "user:abc", name: "Mine", colors: { background: "#101010" }, imageDim: 10 };
  results.themes = [
    goodTheme,
    { id: "user:evil", name: "<img src=x onerror=fetch(1)>", colors: { background: "#000000" } },
    { id: "user:b", name: "B", colors: { background: "url(http://x)" } },
    JSON.parse('{"id":"user:p","name":"P","colors":{"background":"#000000"},"__proto__":{"x":1}}'),
    null,
    "string",
  ].map((theme) => T.validateTheme(theme));
  results.palette = T.paletteFromTheme(goodTheme);
  results.packs = ["github.com", "www.youtube.com", "evil.example", "", null].map((host) => T.findSitePack(host));
  results.resolved = [
    T.resolveTheme({ config: { themeId: "default" }, host: "github.com", userThemes: [] }),
    T.resolveTheme({ config: {}, host: "github.com", userThemes: [goodTheme] }),
    T.resolveTheme({ config: { themeId: "user:abc" }, host: "x.com", userThemes: [goodTheme] }),
    T.resolveTheme({ config: { themeId: "nope" }, host: "x.com", userThemes: [] }),
    T.resolveTheme(undefined),
  ];
  results.imported = [
    JSON.stringify({ name: "Imp", colors: { background: "#202020" }, imageDim: 5 }),
    JSON.stringify({ name: "X", colors: { background: "#202020", text: "http://x" } }),
    "{ not json",
    "x".repeat(T.LIMITS.MAX_IMPORT_BYTES + 1),
  ].map((text) => T.importThemeFile(text));
  results.options = [T.buildThemeOptions([goodTheme], T.findSitePack("github.com")), T.buildThemeOptions(null, null)];
  return results;
}

test("custom CSS and themes never reach the network layer", () => {
  const { ctx, tripped } = loadTrappedSandbox();
  const results = exerciseThemeApis(ctx);
  assert.deepStrictEqual(tripped, [], `Network APIs were called: ${tripped.join(", ")}`);

  assert.strictEqual(results.hostileCss.filter((r) => r.ok).length, 0, "every hostile stylesheet must be rejected");
  assert.strictEqual(results.hostileCss[0].ok, false, "url(http://x) must be rejected");
  assert.ok(results.benignCss.every((r) => r.ok), "benign stylesheets must validate");
  assert.strictEqual(results.themes[0].ok, true);
  assert.strictEqual(results.themes.slice(1).filter((r) => r.ok).length, 0, "hostile themes must be rejected");
  assert.strictEqual(results.imported[0].ok, true);
  assert.strictEqual(results.imported.slice(1).filter((r) => r.ok).length, 0, "hostile imports must be rejected");
  assert.ok(results.palette, "paletteFromTheme returns a palette");
  assert.ok(results.options[0].length > 2 && results.options[1].length >= 2);
});

test("the network trap sandbox detects a violation (self-check)", () => {
  const rel = "src/shared/customCss.js";
  const original = fs.readFileSync(path.join(rootDir, rel), "utf8");
  const mutated = original.replace("function validateCss(css) {", "function validateCss(css) {\n    fetch('/leak');");
  assert.notStrictEqual(mutated, original, "mutation must apply");
  const { ctx, tripped } = loadTrappedSandbox({ [rel]: mutated });
  assert.throws(() => exerciseThemeApis(ctx), /network API called: fetch/);
  assert.ok(tripped.includes("fetch"), "trap must record the fetch call");
});

// 9. Opt-in usage statistics: egress confinement and policy text
console.log("\n9. Opt-in Usage Statistics: Egress Confinement & Policy Text");

const cleanupModule = await import("../src/background/legacyTelemetryCleanup.js");
const reportModule = await import("../src/shared/siteReport.js");
const srcJsFiles = () =>
  walkFiles(path.join(rootDir, "src"), ".js")
    .map(relToRoot)
    .filter((rel) => !WALK_EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix)));
// String-aware comment stripper: walks the source and drops // and /* */ comments but keeps
// everything inside '...', "..." and `...` literals (so "//" inside a string is not a comment).
function stripComments(code) {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== c) j += code[j] === "\\" ? 2 : 1;
      out += code.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && n === "/") {
      while (i < code.length && code[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 ? code.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

test("stripComments keeps string contents and drops real comments", () => {
  const sample = 'const u = "https://a//b"; document.x(); // document.y\n/* location */ let z = 1;';
  const out = stripComments(sample);
  assert.ok(out.includes('"https://a//b"'), "string with // must survive");
  assert.ok(out.includes("document.x()"), "code after a string containing // must survive");
  assert.ok(!out.includes("document.y") && !out.includes("location"), "comments must be removed");
});

test("EGRESS_ALLOWED exempts exactly the network file and the endpoint files", () => {
  assert.deepStrictEqual(Object.keys(EGRESS_ALLOWED).sort(), [NETWORK_PATH, ...ENDPOINT_FILES].sort());
});

test("fetch is called in exactly one src file: network.js", () => {
  const withFetch = srcJsFiles().filter((rel) => /\bfetch\s*\(/.test(stripComments(fs.readFileSync(path.join(rootDir, rel), "utf8"))));
  assert.deepStrictEqual(withFetch, [NETWORK_PATH], `fetch( found in: ${withFetch.join(", ")}`);
  for (const rel of srcJsFiles()) {
    if (rel === NETWORK_PATH) continue;
    assert.ok(!/\bfetch\b/.test(stripComments(fs.readFileSync(path.join(rootDir, rel), "utf8"))), `fetch referenced outside network.js: ${rel}`);
  }
});

test("XMLHttpRequest, WebSocket, sendBeacon, EventSource and axios appear nowhere in src", () => {
  for (const rel of srcJsFiles()) {
    const code = fs.readFileSync(path.join(rootDir, rel), "utf8");
    for (const pattern of [/\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bsendBeacon\b/, /\bEventSource\b/, /\baxios\b/]) {
      assert.strictEqual(pattern.test(code), false, `Prohibited network API (${pattern}) in ${rel}`);
    }
  }
});

const ENDPOINT_URLS = [cleanupModule.DELETE_URL, reportModule.REPORT_URL];

test("every http(s) URL in src/ is one of the declared endpoints, and only in the endpoint files", () => {
  for (const rel of srcJsFiles()) {
    const code = fs.readFileSync(path.join(rootDir, rel), "utf8");
    const urls = code.match(/https?:\/\/[^\s"'`)]+/g) || [];
    if (!ENDPOINT_FILES.includes(rel)) {
      assert.deepStrictEqual(urls, [], `${rel} must not contain URLs`);
      continue;
    }
    assert.ok(urls.length >= 1, `${rel} must declare its endpoint`);
    for (const url of urls) {
      assert.ok(ENDPOINT_URLS.includes(url), `unexpected URL in ${rel}: ${url}`);
    }
  }
});

test("endpoints are exactly the declared https constants, with no query or fragment", () => {
  assert.strictEqual(cleanupModule.DELETE_URL, "https://pshah.fun/api/darkmode-telemetry-delete");
  assert.strictEqual(reportModule.REPORT_URL, "https://pshah.fun/api/darkmode-report");
  for (const url of ENDPOINT_URLS) {
    const u = new URL(url);
    assert.strictEqual(u.protocol, "https:", `${url} must be https`);
    assert.strictEqual(u.host, "pshah.fun", `${url} must be the first-party host`);
    assert.strictEqual(u.search + u.hash, "", `${url} must carry no query or fragment`);
  }
});

test("network.js omits credentials and referrer on every request (no host permission needed)", () => {
  const code = stripComments(fs.readFileSync(path.join(rootDir, NETWORK_PATH), "utf8"));
  const fetchCalls = code.match(/\bfetch\(/g) || [];
  const omits = code.match(/credentials:\s*"omit"/g) || [];
  const noRef = code.match(/referrerPolicy:\s*"no-referrer"/g) || [];
  assert.ok(fetchCalls.length >= 1, "expected the network file to contain the request");
  assert.strictEqual(omits.length, fetchCalls.length, "every fetch must set credentials: omit");
  assert.strictEqual(noRef.length, fetchCalls.length, "every fetch must set referrerPolicy: no-referrer");
  assert.ok(!/mode:\s*"no-cors"/.test(code), "no-cors would hide failures; the default cors mode is required");
});

test("the network and endpoint files never read tabs, location or document", () => {
  for (const rel of [NETWORK_PATH, ...ENDPOINT_FILES]) {
  const code = stripComments(fs.readFileSync(path.join(rootDir, rel), "utf8"));
  for (const [pattern, label] of [
    [/\bchrome\.tabs\b/, "chrome.tabs"],
    [/\blocation\b/, "location"],
    [/\bdocument\b/, "document"],
    [/\bcookies?\b/i, "cookies"],
    [/\bchrome\.history\b/, "chrome.history"],
  ]) {
    assert.strictEqual(pattern.test(code), false, `${rel} must not use ${label}`);
  }
  // Raw source too (comments included): the sender should not even mention tabs, location or document access.
  const raw = fs.readFileSync(path.join(rootDir, rel), "utf8");
  for (const [pattern, label] of [[/\bchrome\.tabs\b/, "chrome.tabs"], [/\bwindow\.location\b|\bdocument\./, "window.location/document."]]) {
    assert.strictEqual(pattern.test(raw), false, `${rel} source must not contain ${label}`);
  }
  }
});

test("the telemetryState key is never stored in chrome.storage.sync", () => {
  for (const rel of srcJsFiles()) {
    const raw = fs.readFileSync(path.join(rootDir, rel), "utf8");
    for (const code of [raw, stripComments(raw)]) {
      assert.ok(!/storage\.sync[\s\S]{0,200}telemetryState/.test(code), `telemetryState used with storage.sync near in ${rel}`);
      assert.ok(!/telemetryState[\s\S]{0,200}storage\.sync/.test(code), `telemetryState used with storage.sync near in ${rel}`);
    }
  }
  assert.ok(srcJsFiles().some((rel) => fs.readFileSync(path.join(rootDir, rel), "utf8").includes("telemetryState")), "telemetryState must be in use");
});

const privacyDoc = fs.readFileSync(path.join(rootDir, "PRIVACY.md"), "utf8");
// The 2.0.x heartbeat field set, frozen: PRIVACY.md still documents it until the policy is rewritten for the
// broken-site report (plan task 7), and older clients still send it.
const LEGACY_HEARTBEAT_KEYS = [
  "id", "day", "version", "env.chrome", "env.os", "env.lang", "engines.auto", "engines.css", "engines.invert",
  "theme", "features.viewer", "features.editor", "features.customCss", "features.sitePack",
];

test("PRIVACY.md drops the zero-telemetry claim and says usage stats are off by default", () => {
  assert.ok(!privacyDoc.includes("Zero Telemetry"), "PRIVACY.md must not claim Zero Telemetry");
  assert.ok(!/zero data collection/i.test(privacyDoc), "PRIVACY.md must not claim Zero Data Collection");
  assert.ok(privacyDoc.includes("Anonymous, opt-in usage statistics"));
  assert.ok(privacyDoc.includes("off by default"));
  assert.ok(privacyDoc.includes("Options"), "PRIVACY.md must say where to turn it off");
  assert.ok(privacyDoc.includes("Delete my data"), "PRIVACY.md must name the delete control");
  assert.ok(/does not store IP addresses/.test(privacyDoc), "PRIVACY.md must say the server function does not store IP addresses");
  assert.ok(/request logs may transiently contain/.test(privacyDoc), "PRIVACY.md must scope the IP statement to the server function");
});

test("published-totals wording: policy docs say combined totals are published, groups under 10 hidden, and drop the no-sharing absolute", () => {
  const privacyHtml = fs.readFileSync(path.join(rootDir, "docs/privacy.html"), "utf8");
  const texts = {
    "PRIVACY.md": privacyDoc,
    "docs/privacy.html": privacyHtml,
    "CHROMEWEBSTORE.md": fs.readFileSync(path.join(rootDir, "CHROMEWEBSTORE.md"), "utf8"),
  };
  for (const [rel, text] of Object.entries(texts)) {
    assert.ok(text.includes("combined totals"), `${rel} must say combined totals are published`);
    assert.ok(text.includes("stats.html"), `${rel} must name the stats page`);
    assert.ok(text.includes("fewer than 10"), `${rel} must say groups of fewer than 10 installs are never shown`);
  }
  const all = [...Object.keys(texts), "README.md", "CHANGELOG.md", "docs/llms.txt", "backend/telemetry/README.md", "documentation/ThemeSwitcher_Privacy_Compliance_Report.md",
    ...fs.readdirSync(path.join(rootDir, "documentation/privacy")).map((f) => `documentation/privacy/${f}`)];
  for (const rel of all) {
    const text = fs.readFileSync(path.join(rootDir, rel), "utf8");
    assert.ok(!/never (sold or )?shared with anyone else/i.test(text), `${rel} has the stale no-sharing sentence`);
    assert.ok(!/used only to understand how many people use the extension and which features matter(?!, and to publish combined totals)/.test(text), `${rel} omits that combined totals are published`);
  }
  for (const rel of ["README.md", "documentation/ThemeSwitcher_Privacy_Compliance_Report.md", "documentation/privacy/privacy-policy.md", "CHANGELOG.md", "backend/telemetry/README.md"]) {
    assert.ok(fs.readFileSync(path.join(rootDir, rel), "utf8").includes("combined totals"), `${rel} must mention combined totals`);
  }
});

test("no page or doc still claims zero telemetry or that the extension sends nothing", () => {
  const banned = [/zero[- ]telemetry/i, /sends nothing(?! to us)/i, /does not collect or transmit/i, /(?<![^.\n]*(custom css|by default|opt-in)[^.\n]*)no network calls(?![^.\n]*(custom css|by default|opt-in))/i];
  // The patterns must flag the stale sentences and leave the legitimate ones alone.
  for (const bad of ["zero telemetry;", "our zero-telemetry architecture", "The extension itself sends nothing.", "does not collect or transmit your personal data", "The extension itself makes no network calls; only"])
    assert.ok(banned.some((re) => re.test(bad)), `pattern set must flag: ${bad}`);
  for (const good of ["If you click No, the extension sends nothing to us.", "Custom CSS makes no network calls.", "It makes no network calls by default."])
    assert.ok(!banned.some((re) => re.test(good)), `pattern set must not flag: ${good}`);
  const files = ["TERMS.md", "README.md", "PRIVACY.md", "CHROMEWEBSTORE.md", "docs/llms.txt", "tools/site-audit/README.md", "documentation/compliance/jurisdiction-matrix.md"];
  for (const dir of ["docs", "docs/blog"]) for (const f of fs.readdirSync(path.join(rootDir, dir))) if (f.endsWith(".html")) files.push(`${dir}/${f}`);
  for (const rel of files) {
    const text = fs.readFileSync(path.join(rootDir, rel), "utf8");
    for (const re of banned) assert.ok(!re.test(text), `${rel} matches banned pattern ${re}`);
  }
  assert.ok(/opt/i.test(fs.readFileSync(path.join(rootDir, "TERMS.md"), "utf8").split("\n").find((l) => l.startsWith("Your privacy is paramount"))), "TERMS.md privacy line must mention opt-in");
});

test("delete guidance: Delete my data is explained with 'before', no stale retention or no-server claims", () => {
  for (const rel of ["PRIVACY.md", "documentation/privacy/privacy-policy.md", "CHROMEWEBSTORE.md"]) {
    const text = fs.readFileSync(path.join(rootDir, rel), "utf8");
    assert.ok(text.includes("Delete my data"), `${rel} must name Delete my data`);
    assert.ok(/before/i.test(text), `${rel} must say to delete before turning off or uninstalling`);
    assert.ok(text.includes("13 months"), `${rel} must state the 13-month purge rule`);
  }
  for (const rel of ["PRIVACY.md", "CHROMEWEBSTORE.md", "README.md", ...fs.readdirSync(path.join(rootDir, "documentation/privacy")).map((f) => `documentation/privacy/${f}`), "documentation/ThemeSwitcher_Privacy_Compliance_Report.md"]) {
    const text = fs.readFileSync(path.join(rootDir, rel), "utf8");
    assert.ok(!/kept until the user requests deletion/i.test(text), `${rel} has the stale retention wording`);
    assert.ok(!text.includes("0 days (no server exists)"), `${rel} claims no server exists`);
    assert.ok(!/No user data is ever sold, transferred, or shared with third parties/.test(text), `${rel} has the absolute no-sharing sentence`);
  }
});

test("every line that mentions deleting usage data also says to do it before turning off or uninstalling", () => {
  const files = [
    "PRIVACY.md",
    "documentation/privacy/privacy-policy.md",
    "CHROMEWEBSTORE.md",
    "README.md",
    "documentation/privacy/user-rights.md",
    "documentation/ThemeSwitcher_Privacy_Compliance_Report.md",
  ];
  const mention = /delete (all )?(of )?your data|delete my data/i;
  for (const rel of files) {
    const lines = fs.readFileSync(path.join(rootDir, rel), "utf8").split("\n");
    let seen = 0;
    lines.forEach((line, i) => {
      if (!mention.test(line)) return;
      seen++;
      assert.ok(/before/i.test(line), `${rel}:${i + 1} mentions deleting data without saying 'before' on the same line: ${line.slice(0, 100)}`);
    });
    assert.ok(seen > 0, `${rel} must mention Delete my data`);
  }
});

test("IP statements are scoped to the server function and never absolute", () => {
  const files = ["PRIVACY.md", "CHROMEWEBSTORE.md", "README.md", "documentation/privacy/privacy-policy.md", "documentation/privacy/data-flow.md", "documentation/privacy/data-inventory.md", "documentation/privacy/retention-policy.md", "documentation/ThemeSwitcher_Privacy_Compliance_Report.md"];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(rootDir, rel), "utf8");
    assert.ok(!/never stores?[^.\n]*IP address/i.test(text), `${rel} has an unscoped 'never stores ... IP address'`);
    assert.ok(!/IP addresses? (is|are) (never|not) stored/i.test(text), `${rel} has an unscoped IP-not-stored claim`);
  }
});

test("PRIVACY.md lists every heartbeat field name, and exactly those", () => {
  const keys = LEGACY_HEARTBEAT_KEYS;
  const section = privacyDoc.match(/<!-- fields:start -->([\s\S]*?)<!-- fields:end -->/);
  assert.ok(section, "PRIVACY.md must delimit the field list with fields:start / fields:end markers");
  const documented = [...section[1].matchAll(/`([A-Za-z.]+)`/g)].map((m) => m[1]);
  assert.deepStrictEqual([...documented].sort(), [...keys].sort(), "documented fields must equal the heartbeat keys");
});

test("no document claims a telemetry host permission; the CORS design is described instead", () => {
  const files = [
    "PRIVACY.md", "CHROMEWEBSTORE.md", "README.md", "CHANGELOG.md",
    "documentation/ThemeSwitcher_Privacy_Compliance_Report.md",
    "documentation/specs/2026-10-14-opt-in-usage-telemetry-design.md",
    "documentation/plans/2026-10-14-opt-in-usage-telemetry.md",
    "backend/telemetry/README.md",
    ...fs.readdirSync(path.join(rootDir, "documentation/privacy")).map((f) => `documentation/privacy/${f}`),
  ];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(rootDir, rel), "utf8");
    assert.ok(!text.includes("darkmode-telemetry*"), `${rel} still names the host-permission pattern`);
    text.split("\n").forEach((line, i) => {
      if (!/pshah\.fun/.test(line)) return;
      // A line naming the telemetry host may mention host permissions only to say there are none.
      const claims = line.replace(/\bno host[ _]permissions?\b/gi, "").replace(/\bwithout (any )?host[ _]permissions?\b/gi, "");
      assert.ok(!/host[ _]permissions?/i.test(claims), `${rel}:${i + 1} ties a host permission to pshah.fun`);
    });
  }
  for (const rel of ["PRIVACY.md", "CHROMEWEBSTORE.md", "README.md", "documentation/ThemeSwitcher_Privacy_Compliance_Report.md", "backend/telemetry/README.md"]) {
    const text = fs.readFileSync(path.join(rootDir, rel), "utf8");
    assert.ok(/no host permissions?/i.test(text), `${rel} must say the extension needs no host permission`);
    assert.ok(/CORS/.test(text), `${rel} must say the endpoint answers CORS`);
  }
  const be = fs.readFileSync(path.join(rootDir, "backend/telemetry/README.md"), "utf8");
  assert.ok(be.includes("kmhhphbakbhohiohagkhhgdgfbplkfke") && /EXTENSION_ID/.test(be), "backend README must name the extension ID constant");
});

test("options.html and popup.html make no unqualified 'no network requests' claim", () => {
  for (const rel of ["src/options/options.html", "src/popup/popup.html"]) {
    const text = fs.readFileSync(path.join(rootDir, rel), "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const re of [/never makes? (any )?network requests?/i, /\bno network requests?\b/i, /makes? no network requests?/i, /never (contacts|talks to) (a|any) server/i]) {
      assert.ok(!re.test(text), `${rel} claims ${re}, which is false now that opt-in usage stats exist`);
    }
  }
  const opt = fs.readFileSync(path.join(rootDir, "src/options/options.html"), "utf8");
  assert.ok(opt.includes("Custom CSS can never cause a network request."), "options.html must keep the accurate custom-CSS claim");
});

test("every IP caveat also says request logs may contain the User-Agent and Accept-Language headers", () => {
  const files = ["PRIVACY.md", "CHROMEWEBSTORE.md", "README.md", "documentation/ThemeSwitcher_Privacy_Compliance_Report.md",
    "documentation/specs/2026-10-14-opt-in-usage-telemetry-design.md", "backend/telemetry/README.md",
    ...fs.readdirSync(path.join(rootDir, "documentation/privacy")).map((f) => `documentation/privacy/${f}`)];
  let seen = 0;
  for (const rel of files) {
    fs.readFileSync(path.join(rootDir, rel), "utf8").split("\n").forEach((line, i) => {
      if (!/transiently contain/i.test(line)) return;
      seen++;
      assert.ok(/User-Agent/.test(line) && /Accept-Language/.test(line), `${rel}:${i + 1} IP caveat must also name User-Agent and Accept-Language`);
    });
  }
  assert.ok(seen >= 8, "the IP caveat must still be present in the policy documents");
});

test("store listing: no blanket no-analytics or no-network claims; web PDF fetch disclosed", () => {
  const cws = fs.readFileSync(path.join(rootDir, "CHROMEWEBSTORE.md"), "utf8");
  assert.ok(!/No analytics, tracking pixels, or advertising of any kind/.test(cws), "blanket no-analytics claim");
  assert.ok(cws.includes("No third-party analytics"), "must say No third-party analytics");
  assert.ok(!/no other network calls/i.test(cws), "the viewer can download a web PDF the user opens");
  assert.ok(/web PDF/i.test(cws), "store listing must disclose the web PDF download");
  const priv = fs.readFileSync(path.join(rootDir, "PRIVACY.md"), "utf8");
  assert.ok(!/makes no network requests at all/i.test(priv), "PRIVACY.md must not claim no network requests at all");
});

test(".gitignore keeps backend docs tracked but ignores the backend node_modules", () => {
  const gi = fs.readFileSync(path.join(rootDir, ".gitignore"), "utf8").split("\n").map((l) => l.trim());
  assert.ok(gi.includes("!/backend/**/*.md"));
  assert.ok(gi.includes("backend/telemetry/node_modules/"));
  assert.ok(gi.indexOf("backend/telemetry/node_modules/") > gi.indexOf("!/backend/**/*.md"), "the node_modules rule must come after the .md negation");
});

// Final summary
console.log("\n=========================================");
console.log(`🎉 Privacy & Security Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
