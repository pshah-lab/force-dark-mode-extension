// tests/privacy_security_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";

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

test("zero outbound network calls in extension core code", () => {
  const extensionJsFiles = [
    "src/background/serviceWorker.js",
    "src/content/index.js",
    "src/content/themeEngine/cssOverrideEngine.js",
    "src/content/themeEngine/invertEngine.js",
    "src/popup/popup.js",
    "src/options/options.js",
    "src/shared/storage.js",
    "src/shared/colorUtils.js",
    "src/shared/constants.js",
    "src/viewer/viewer.js",
  ];

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
  const websiteJs = fs.readFileSync(path.join(rootDir, "website/js/main.js"), "utf8");
  assert.strictEqual(
    websiteJs.includes("abacus.jasoncameron.dev"),
    false,
    "website/js/main.js must not call external counter abacus"
  );
  assert.strictEqual(
    websiteJs.includes("countapi.mileshilliard.com"),
    false,
    "website/js/main.js must not call external counter countapi"
  );
  assert.strictEqual(
    websiteJs.includes("google-analytics.com"),
    false,
    "website must not contain Google Analytics"
  );
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

  assert.strictEqual(parsed.version, "1.6.1");
  assert.ok(parsed.exportDate);
  assert.ok(parsed.settings["wikipedia.org"]);
  assert.strictEqual(parsed.settings["wikipedia.org"].engine, "css");
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
    "website/index.html",
    "website/about.html",
    "website/features.html",
    "website/how-it-works.html",
    "website/support.html",
    "website/privacy.html",
    "website/terms.html",
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
  assert.ok(
    changelog.includes("## [1.6.0]"),
    "CHANGELOG.md must document latest published version [1.6.0]"
  );
  assert.ok(
    versioning.includes("Latest Published Version:** `1.6.0`"),
    "VERSIONING.md must state latest published version as 1.6.0"
  );
});

// Final summary
console.log("\n=========================================");
console.log(`🎉 Privacy & Security Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
