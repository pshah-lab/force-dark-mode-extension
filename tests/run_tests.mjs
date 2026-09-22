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
  assert.ok(optionsJs.includes("getSiteConfig"), "options.js should import getSiteConfig");
  assert.ok(optionsJs.includes("setSiteConfig"), "options.js should import setSiteConfig");
  assert.ok(optionsJs.includes("../shared/storage.js"), "options.js should import from storage.js");
  assert.ok(optionsJs.includes("DEFAULT_ENGINE"), "options.js should import DEFAULT_ENGINE");
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

test("viewer.html sandboxes fallback iframe securely without same-origin", () => {
  const viewerHtml = fs.readFileSync(path.join(rootDir, "src/viewer/viewer.html"), "utf8");
  assert.ok(viewerHtml.includes('sandbox="allow-scripts"'), "iframe should be strictly sandboxed");
  assert.strictEqual(viewerHtml.includes("allow-same-origin"), false, "iframe must not grant allow-same-origin");
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

// 7. Compliance & Regulatory Standards Validation
console.log("\n7. Compliance & Regulatory Standards Validation");

test("zero cookies used across entire extension and website codebase", () => {
  const jsFiles = [
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
    "website/js/main.js",
  ];

  for (const relPath of jsFiles) {
    const code = fs.readFileSync(path.join(rootDir, relPath), "utf8");
    assert.strictEqual(
      code.includes("document.cookie"),
      false,
      `${relPath} must not access or set document.cookie`
    );
  }
});

test("no eval or new Function in extension code", () => {
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

  for (const relPath of extensionJsFiles) {
    const code = fs.readFileSync(path.join(rootDir, relPath), "utf8");
    assert.strictEqual(
      /\beval\s*\(/.test(code),
      false,
      `${relPath} must not call eval()`
    );
    assert.strictEqual(
      /\bnew\s+Function\s*\(/.test(code),
      false,
      `${relPath} must not use new Function()`
    );
  }
});

test("extension HTML files do not load remote scripts", () => {
  const htmlFiles = [
    "src/popup/popup.html",
    "src/options/options.html",
    "src/viewer/viewer.html",
  ];

  for (const relPath of htmlFiles) {
    const html = fs.readFileSync(path.join(rootDir, relPath), "utf8");
    const remoteScripts = html.match(/<script[^>]+src=["'](https?:|\/\/)[^"']+["']/gi);
    assert.strictEqual(
      remoteScripts,
      null,
      `${relPath} contains prohibited remote script tags: ${remoteScripts}`
    );
  }
});

test("external blank links in extension and website enforce noopener", () => {
  const htmlFiles = [
    "src/popup/popup.html",
    "src/viewer/viewer.html",
    "website/index.html",
    "website/features.html",
    "website/how-it-works.html",
    "website/support.html",
    "website/about.html",
    "website/privacy.html",
    "website/blog/how-to-force-dark-mode-chrome.html",
    "website/blog/dark-mode-pdf-guide.html",
    "website/blog/dark-mode-vs-night-mode.html",
    "website/blog/best-dark-mode-extension-guide.html",
  ];

  for (const relPath of htmlFiles) {
    const html = fs.readFileSync(path.join(rootDir, relPath), "utf8");
    const linkMatches = html.matchAll(/<a\s+[^>]*target=["']_blank["'][^>]*>/gi);
    for (const match of linkMatches) {
      const tag = match[0];
      assert.ok(
        tag.includes('rel="') && tag.includes("noopener"),
        `${relPath} contains target="_blank" without rel="noopener": ${tag}`
      );
    }
  }
});

test("all website HTML pages include security meta headers", () => {
  const pages = [
    "website/index.html",
    "website/features.html",
    "website/how-it-works.html",
    "website/support.html",
    "website/about.html",
    "website/privacy.html",
    "website/blog/how-to-force-dark-mode-chrome.html",
    "website/blog/dark-mode-pdf-guide.html",
    "website/blog/dark-mode-vs-night-mode.html",
    "website/blog/best-dark-mode-extension-guide.html",
  ];

  for (const relPath of pages) {
    const html = fs.readFileSync(path.join(rootDir, relPath), "utf8");
    assert.ok(
      html.includes('http-equiv="X-Content-Type-Options" content="nosniff"'),
      `${relPath} must specify X-Content-Type-Options nosniff`
    );
    assert.ok(
      html.includes('name="referrer" content="strict-origin-when-cross-origin"'),
      `${relPath} must specify strict-origin-when-cross-origin referrer`
    );
  }
});

test("CHROMEWEBSTORE.md and PRIVACY.md certify zero telemetry & limited use", () => {
  const storeDoc = fs.readFileSync(path.join(rootDir, "CHROMEWEBSTORE.md"), "utf8");
  const privacyDoc = fs.readFileSync(path.join(rootDir, "PRIVACY.md"), "utf8");

  assert.ok(storeDoc.includes("Single Purpose"), "CHROMEWEBSTORE.md missing Single Purpose");
  assert.ok(storeDoc.includes("Permissions Justification"), "CHROMEWEBSTORE.md missing Permissions Justification");
  assert.ok(storeDoc.includes("Data Collection"), "CHROMEWEBSTORE.md missing Data Collection");
  assert.ok(storeDoc.includes("Data is NOT sold"), "CHROMEWEBSTORE.md missing Data sale certification");
  assert.ok(privacyDoc.includes("Zero Telemetry"), "PRIVACY.md missing Zero Telemetry statement");
  assert.ok(privacyDoc.includes("100% locally"), "PRIVACY.md missing local execution guarantee");
});

// Final summary
console.log("\n=========================================");
console.log(`🎉 Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
