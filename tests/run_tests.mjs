// tests/run_tests.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("=========================================");
console.log("🧪 Running Force Dark Mode Test Suite");
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

// 1. Manifest V3 & File Integrity Tests
console.log("1. Manifest & File Integrity Tests");
const manifestPath = path.join(rootDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

test("manifest.json is valid Manifest V3", () => {
  assert.strictEqual(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.ok(manifest.version);
  assert.ok(manifest.description);
});

test("manifest.json only contains valid MV3 permissions", () => {
  const allowedPermissions = new Set([
    "activeTab", "alarms", "background", "bookmarks", "browsingData",
    "certificateProvider", "clipboardRead", "clipboardWrite", "contentSettings",
    "contextMenus", "cookies", "debugger", "declarativeContent", "declarativeNetRequest",
    "declarativeNetRequestFeedback", "declarativeNetRequestWithHostAccess", "desktopCapture",
    "documentScan", "downloads", "downloads.open", "downloads.ui", "enterprise.deviceAttributes",
    "enterprise.hardwarePlatform", "enterprise.networkingAttributes", "enterprise.platformKeys",
    "favicon", "fileBrowserHandler", "fileSystemProvider", "fontSettings", "gcm",
    "history", "identity", "identity.email", "idle", "loginState", "management",
    "nativeMessaging", "notifications", "offscreen", "pageCapture", "power", "printerProvider",
    "printing", "printingMetrics", "privacy", "processes", "proxy", "readingList", "runtime",
    "scripting", "search", "sessions", "sidePanel", "storage", "system.cpu", "system.display",
    "system.memory", "system.storage", "tabCapture", "tabGroups", "tabs", "topSites",
    "tts", "ttsEngine", "unlimitedStorage", "vpnProvider", "wallpaper", "webAuthenticationProxy",
    "webNavigation", "webRequest", "webRequestAuthProvider", "webRequestBlocking"
  ]);

  for (const perm of manifest.permissions || []) {
    assert.ok(allowedPermissions.has(perm), `Invalid or unrecognized permission: ${perm}`);
  }
});

test("all files declared in manifest.json exist", () => {
  // Check icons
  for (const size of Object.keys(manifest.icons || {})) {
    const iconPath = path.join(rootDir, manifest.icons[size]);
    assert.ok(fs.existsSync(iconPath), `Icon file missing: ${manifest.icons[size]}`);
  }

  // Check background service worker
  if (manifest.background?.service_worker) {
    const swPath = path.join(rootDir, manifest.background.service_worker);
    assert.ok(fs.existsSync(swPath), `Service worker missing: ${manifest.background.service_worker}`);
  }

  // Check content scripts
  for (const cs of manifest.content_scripts || []) {
    for (const jsFile of cs.js || []) {
      const jsPath = path.join(rootDir, jsFile);
      assert.ok(fs.existsSync(jsPath), `Content script file missing: ${jsFile}`);
    }
  }

  // Check popup
  if (manifest.action?.default_popup) {
    const popupPath = path.join(rootDir, manifest.action.default_popup);
    assert.ok(fs.existsSync(popupPath), `Popup file missing: ${manifest.action.default_popup}`);
  }

  // Check options
  if (manifest.options_ui?.page) {
    const optPath = path.join(rootDir, manifest.options_ui.page);
    assert.ok(fs.existsSync(optPath), `Options file missing: ${manifest.options_ui.page}`);
  }
});

// 2. Color Utilities Tests
console.log("\n2. Color Utilities Tests");

// Load colorUtils.js in a global sandbox
const colorUtilsCode = fs.readFileSync(path.join(rootDir, "src/shared/colorUtils.js"), "utf8");
const sandboxGlobal = {};
const runColorUtils = new Function("global", "self", "globalThis", colorUtilsCode);
runColorUtils(sandboxGlobal, sandboxGlobal, sandboxGlobal);
const colorUtils = sandboxGlobal.ForceDarkColorUtils;

test("colorUtils exported properly", () => {
  assert.ok(colorUtils, "ForceDarkColorUtils should exist");
  assert.strictEqual(typeof colorUtils.parseCssColor, "function");
  assert.strictEqual(typeof colorUtils.getLuminance, "function");
  assert.strictEqual(typeof colorUtils.getContrastRatio, "function");
  assert.strictEqual(typeof colorUtils.hexToRgb, "function");
  assert.strictEqual(typeof colorUtils.rgbToHex, "function");
  assert.strictEqual(typeof colorUtils.mixColors, "function");
  assert.strictEqual(typeof colorUtils.normalizeHexColor, "function");
});

test("parseCssColor parses hex colors correctly", () => {
  assert.deepStrictEqual(colorUtils.parseCssColor("#ffffff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepStrictEqual(colorUtils.parseCssColor("#000000"), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepStrictEqual(colorUtils.parseCssColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepStrictEqual(colorUtils.parseCssColor("#0f1115"), { r: 15, g: 17, b: 21, a: 1 });
  assert.deepStrictEqual(colorUtils.parseCssColor("#11223380"), { r: 17, g: 34, b: 51, a: 0.5 });
});

test("parseCssColor parses rgb and rgba colors correctly", () => {
  assert.deepStrictEqual(colorUtils.parseCssColor("rgb(255, 255, 255)"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepStrictEqual(colorUtils.parseCssColor("rgba(0, 0, 0, 0.5)"), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepStrictEqual(colorUtils.parseCssColor("rgb(15 17 21 / 0.8)"), { r: 15, g: 17, b: 21, a: 0.8 });
  assert.deepStrictEqual(colorUtils.parseCssColor("rgba(100, 150, 200, 80%)"), { r: 100, g: 150, b: 200, a: 0.8 });
});

test("parseCssColor handles invalid and transparent inputs", () => {
  assert.strictEqual(colorUtils.parseCssColor(""), null);
  assert.strictEqual(colorUtils.parseCssColor("transparent"), null);
  assert.strictEqual(colorUtils.parseCssColor("inherit"), null);
  assert.strictEqual(colorUtils.parseCssColor("initial"), null);
  assert.strictEqual(colorUtils.parseCssColor("invalid-color-123"), null);
});

test("getLuminance calculates correct relative luminance values", () => {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const red = { r: 255, g: 0, b: 0, a: 1 };

  assert.strictEqual(colorUtils.getLuminance(white), 1);
  assert.strictEqual(colorUtils.getLuminance(black), 0);
  const redLum = colorUtils.getLuminance(red);
  assert.ok(redLum > 0.2 && redLum < 0.22, `Red luminance was ${redLum}`);
});

test("getContrastRatio calculates WCAG contrast ratios", () => {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 0, g: 0, b: 0, a: 1 };

  const maxContrast = colorUtils.getContrastRatio(white, black);
  assert.strictEqual(Math.round(maxContrast), 21);

  const sameContrast = colorUtils.getContrastRatio(white, white);
  assert.strictEqual(sameContrast, 1);
});

test("hexToRgb and rgbToHex convert accurately", () => {
  const hex = "#1a2b3c";
  const rgb = colorUtils.hexToRgb(hex);
  assert.deepStrictEqual(rgb, { r: 26, g: 43, b: 60 });
  const backToHex = colorUtils.rgbToHex(rgb);
  assert.strictEqual(backToHex, hex);
});

test("mixColors blends two colors proportionally", () => {
  const col1 = { r: 0, g: 0, b: 0 };
  const col2 = { r: 100, g: 100, b: 100 };
  const mixedHex = colorUtils.mixColors(col1, col2, 0.5);
  assert.strictEqual(mixedHex, "#323232"); // 50 in hex is 32

  const mixedWithHexTarget = colorUtils.mixColors(col1, "#646464", 0.5);
  assert.strictEqual(mixedWithHexTarget, "#323232");
});

test("normalizeHexColor normalizes valid 6-digit hex colors", () => {
  assert.strictEqual(colorUtils.normalizeHexColor("#0F1115"), "#0f1115");
  assert.strictEqual(colorUtils.normalizeHexColor("#fff"), "");
  assert.strictEqual(colorUtils.normalizeHexColor("invalid"), "");
  assert.strictEqual(colorUtils.normalizeHexColor(null), "");
});

// 3. Storage & Background Logic Tests
console.log("\n3. Storage & Background Logic Tests");

test("constants.js has valid defaults", async () => {
  const constants = await import("../src/shared/constants.js");
  assert.strictEqual(constants.DEFAULT_ENGINE, "auto");
  assert.strictEqual(constants.FALLBACK_ENGINE, "css");
  assert.ok(constants.VALID_ENGINES.has("auto"));
  assert.ok(constants.VALID_ENGINES.has("css"));
  assert.ok(constants.VALID_ENGINES.has("invert"));
  assert.ok(constants.HEX_COLOR_PATTERN.test(constants.DEFAULT_BACKGROUND_COLOR));
});

// 4. Content Script & Engine File Validation
console.log("\n4. Content Script & Engine File Validation");

test("content scripts do NOT contain top-level ES module import/export", () => {
  const contentScripts = [
    "src/shared/colorUtils.js",
    "src/content/themeEngine/cssOverrideEngine.js",
    "src/content/themeEngine/invertEngine.js",
    "src/content/index.js",
  ];

  for (const relPath of contentScripts) {
    const code = fs.readFileSync(path.join(rootDir, relPath), "utf8");
    const hasTopLevelImport = /^import\s+/m.test(code);
    const hasTopLevelExport = /^export\s+/m.test(code);
    assert.strictEqual(hasTopLevelImport, false, `${relPath} must not contain top-level import`);
    assert.strictEqual(hasTopLevelExport, false, `${relPath} must not contain top-level export`);
  }
});

test("invertEngine injects and removes style tag correctly", () => {
  const code = fs.readFileSync(path.join(rootDir, "src/content/themeEngine/invertEngine.js"), "utf8");
  assert.ok(code.includes("enableInvert"));
  assert.ok(code.includes("disableInvert"));
  assert.ok(code.includes("__force_dark_invert__"));
});

test("cssOverrideEngine supports palette generation and dark scanning", () => {
  const code = fs.readFileSync(path.join(rootDir, "src/content/themeEngine/cssOverrideEngine.js"), "utf8");
  assert.ok(code.includes("enableDarkMode"));
  assert.ok(code.includes("disableDarkMode"));
  assert.ok(code.includes("__force_dark_mode__"));
  assert.ok(code.includes("data-force-dark-mode"));
  assert.ok(code.includes("applyCustomPalette"));
});

test("palette calculation generates contrast-compliant CSS variables", () => {
  const base = "#0f1115";
  const baseRgb = colorUtils.hexToRgb(base);
  const baseLuminance = colorUtils.getLuminance(baseRgb);
  const isLight = baseLuminance > 0.5;
  assert.strictEqual(isLight, false, "Default background should be dark");

  const textColor = isLight ? "#14171c" : "#e8eaed";
  const surfaceColor = colorUtils.mixColors(baseRgb, isLight ? "#000000" : "#ffffff", 0.08);
  const textRgb = colorUtils.hexToRgb(textColor);

  const contrast = colorUtils.getContrastRatio(baseRgb, textRgb);
  assert.ok(contrast >= 7.0, `Contrast ratio should exceed AAA standards: ${contrast}`);
});

// 5. Options & Popup Files Validation
console.log("\n5. Options & Popup Files Validation");

test("popup HTML references valid popup.js and popup.css", () => {
  const popupHtml = fs.readFileSync(path.join(rootDir, "src/popup/popup.html"), "utf8");
  assert.ok(popupHtml.includes('src="popup.js"'));
  assert.ok(popupHtml.includes('href="popup.css"'));
  assert.ok(popupHtml.includes('id="open-pdf-viewer"'));
  assert.ok(popupHtml.includes('id="open-document-viewer"'));
});

test("options HTML references valid options.js and options.css", () => {
  const optionsHtml = fs.readFileSync(path.join(rootDir, "src/options/options.html"), "utf8");
  assert.ok(optionsHtml.includes('src="options.js"'));
  assert.ok(optionsHtml.includes('href="options.css"'));
});

test("options.js correctly imports storage and constants", () => {
  const optionsJs = fs.readFileSync(path.join(rootDir, "src/options/options.js"), "utf8");
  assert.ok(optionsJs.includes('import { getSiteConfig, setSiteConfig } from "../shared/storage.js"'));
  assert.ok(optionsJs.includes('import { DEFAULT_ENGINE, DEFAULT_BACKGROUND_COLOR } from "../shared/constants.js"'));
});

test("viewer files exist and provide PDF/document controls", () => {
  const viewerHtml = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.html"), "utf8");
  const viewerJs = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.js"), "utf8");
  const viewerCss = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.css"), "utf8");

  assert.ok(viewerHtml.includes('src="viewer.js"'));
  assert.ok(viewerHtml.includes('href="viewer.css"'));
  assert.ok(viewerHtml.includes('type="module"'));
  assert.ok(viewerHtml.includes('id="pdf-render-panel"'));
  assert.ok(viewerHtml.includes('id="pdf-frame"'));
  assert.ok(viewerHtml.includes('id="file-input"'));
  assert.ok(viewerJs.includes('import * as pdfjsLib from "./vendor/pdf.min.mjs"'));
  assert.ok(viewerJs.includes("VIEWER_STORAGE_KEY"));
  assert.ok(viewerJs.includes("renderPdfPage"));
  assert.ok(viewerJs.includes("renderPdfTextLayer"));
  assert.ok(viewerJs.includes("TextLayer"));
  assert.ok(viewerJs.includes("PDF_MIN_RENDER_SCALE"));
  assert.ok(viewerJs.includes("getPdfPageColors"));
  assert.ok(viewerJs.includes("pageColors"));
  assert.ok(viewerJs.includes("transformSmartPixel"));
  assert.ok(viewerJs.includes('settings.mode === "original" || settings.mode === "smart"'));
  assert.ok(viewerJs.includes("VerbosityLevel"));
  assert.ok(viewerJs.includes("openPdf"));
  assert.ok(viewerJs.includes("openTextDocument"));
  assert.ok(viewerCss.includes(".pdf-pages"));
  assert.ok(viewerCss.includes(".pdf-page-content"));
  assert.ok(viewerCss.includes(".pdf-text-layer"));
  assert.ok(viewerCss.includes('[data-mode="smart"]'));
  assert.ok(viewerCss.includes('[data-mode="sepia"]'));
});

test("PDF.js vendor files are bundled locally", () => {
  const pdfModule = path.join(rootDir, "src/viewer/vendor/pdf.min.mjs");
  const pdfWorker = path.join(rootDir, "src/viewer/vendor/pdf.worker.min.mjs");

  assert.ok(fs.existsSync(pdfModule), "PDF.js module is missing");
  assert.ok(fs.existsSync(pdfWorker), "PDF.js worker is missing");
  assert.ok(fs.statSync(pdfModule).size > 100_000, "PDF.js module looks incomplete");
  assert.ok(fs.statSync(pdfWorker).size > 100_000, "PDF.js worker looks incomplete");
  assert.ok(
    fs.readFileSync(pdfWorker, "utf8").includes("let nn=$t;function getVerbosityLevel()"),
    "PDF.js worker should default to errors-only verbosity"
  );
});

// 6. Security & Defense-in-Depth Validation
console.log("\n6. Security & Defense-in-Depth Validation");

test("manifest.json defines strict CSP with object-src none", () => {
  assert.ok(manifest.content_security_policy, "content_security_policy missing in manifest");
  assert.ok(
    manifest.content_security_policy.extension_pages?.includes("object-src 'none'"),
    "CSP should specify object-src 'none'"
  );
  assert.ok(
    manifest.content_security_policy.extension_pages?.includes("script-src 'self'"),
    "CSP should restrict script-src to 'self'"
  );
});

test("storage.js protects against prototype pollution keys", () => {
  const storageCode = fs.readFileSync(path.join(rootDir, "src/shared/storage.js"), "utf8");
  assert.ok(storageCode.includes("__proto__"), "storage.js should filter __proto__");
  assert.ok(storageCode.includes("constructor"), "storage.js should filter constructor");
});

test("viewer.js validates document URL protocols against allowlist", () => {
  const viewerJs = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.js"), "utf8");
  assert.ok(viewerJs.includes("ALLOWED_DOCUMENT_PROTOCOLS"), "viewer.js should define allowed protocols");
  assert.ok(viewerJs.includes("isSafeDocumentUrl"), "viewer.js should validate document URLs");
});

test("viewer.html sandboxes fallback iframe", () => {
  const viewerHtml = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.html"), "utf8");
  assert.ok(viewerHtml.includes('sandbox="allow-scripts allow-same-origin"'), "iframe should be sandboxed");
  assert.ok(viewerHtml.includes('referrerpolicy="no-referrer"'), "iframe should specify referrerpolicy");
});

test("popup.js does not use innerHTML for recommendations", () => {
  const popupJs = fs.readFileSync(path.join(rootDir, "src/popup/popup.js"), "utf8");
  assert.ok(!popupJs.includes("recommendation.innerHTML"), "popup.js should not assign recommendation.innerHTML");
});

test("message listeners perform sender validation", () => {
  const swCode = fs.readFileSync(path.join(rootDir, "src/background/serviceWorker.js"), "utf8");
  const contentCode = fs.readFileSync(path.join(rootDir, "src/content/index.js"), "utf8");
  assert.ok(swCode.includes("sender.id !== chrome.runtime.id"), "service worker should validate sender.id");
  assert.ok(contentCode.includes("sender.id !== chrome.runtime.id"), "content script should validate sender.id");
});

// Final summary
console.log("\n=========================================");
console.log(`🎉 Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
