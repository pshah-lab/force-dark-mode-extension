#!/usr/bin/env node
// tools/site-audit/audit.mjs
//
// Dev-only visual audit harness for the Force Dark Mode extension. It is never
// packaged (package-extension.sh zips only manifest.json, assets/ and src/) and is
// not part of `npm test`. See README.md in this folder for usage and caveats.
//
// For every site it loads the page once with the extension switched off for that
// host and once per requested engine, waits WAIT ms, saves a screenshot
// `<name>-<engine>.png` into OUT and prints one JSON array of measurements.
//
// Environment:
//   EXT     extension directory to load            (default: the repo containing this file)
//   B       Chromium / Chrome for Testing executable (required)
//   G       global node_modules dir that contains @playwright/cli/node_modules/playwright
//           (optional if `playwright` itself resolves from here)
//   SITES   JSON array of [name, url] pairs        (required)
//   ENGINES comma list of auto,css,invert          (default: auto)
//   WAIT    ms to wait after the load event         (default: 2500)
//   SCHEME  emulated prefers-color-scheme light|dark (default: light)
//   OUT     output directory, must be outside the repo (default: <tmpdir>/fdm-site-audit)

import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const VALID_ENGINES = new Set(["auto", "css", "invert"]);
const NAME_PATTERN = /^[A-Za-z0-9_-]{1,60}$/;

function fail(message) {
  console.error(`site-audit: ${message}\nSee tools/site-audit/README.md for usage.`);
  process.exit(2);
}

function loadPlaywright(globalModules) {
  const candidates = [];
  if (globalModules) {
    candidates.push(path.join(globalModules, "@playwright", "cli", "node_modules", "playwright"));
    candidates.push(path.join(globalModules, "playwright"));
  }
  candidates.push("playwright");
  const require = createRequire(import.meta.url);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      // try the next location
    }
  }
  fail(`could not load playwright (tried: ${candidates.join(", ")}). Set G to your global node_modules.`);
}

function readConfig(env) {
  const ext = path.resolve(env.EXT || REPO);
  if (!fs.existsSync(path.join(ext, "manifest.json"))) fail(`EXT has no manifest.json: ${ext}`);

  const browser = env.B;
  if (!browser || !fs.existsSync(browser)) fail("B must point to a Chromium / Chrome for Testing executable.");

  let sites;
  try {
    sites = JSON.parse(env.SITES || "");
  } catch (error) {
    fail('SITES must be JSON like [["bbc","https://www.bbc.com/"]].');
  }
  if (!Array.isArray(sites) || !sites.length) fail("SITES must be a non-empty JSON array.");
  for (const entry of sites) {
    if (!Array.isArray(entry) || entry.length !== 2 || !NAME_PATTERN.test(String(entry[0]))) {
      fail(`bad SITES entry ${JSON.stringify(entry)}: expected [name, url] with name matching ${NAME_PATTERN}`);
    }
    let url;
    try {
      url = new URL(entry[1]);
    } catch (error) {
      fail(`bad URL in SITES: ${entry[1]}`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") fail(`only http(s) URLs are audited: ${entry[1]}`);
  }

  const engines = (env.ENGINES || "auto").split(",").map((e) => e.trim()).filter(Boolean);
  for (const engine of engines) if (!VALID_ENGINES.has(engine)) fail(`unknown engine "${engine}"`);

  const wait = env.WAIT === undefined ? 2500 : Number(env.WAIT);
  if (!Number.isFinite(wait) || wait < 0 || wait > 60000) fail("WAIT must be a number of ms between 0 and 60000.");

  const scheme = env.SCHEME || "light";
  if (scheme !== "light" && scheme !== "dark") fail("SCHEME must be light or dark.");

  const out = path.resolve(env.OUT || path.join(os.tmpdir(), "fdm-site-audit"));
  // Screenshots and the Chromium profile must never end up in the repository.
  if (out === REPO || out.startsWith(REPO + path.sep)) fail(`OUT must be outside the repository: ${out}`);

  return { ext, browser, sites, engines, wait, scheme, out, globalModules: env.G };
}

// The same per-host shape the popup writes; "off" disables the extension for the host.
function siteConfig(engine) {
  return {
    enabled: engine !== "off",
    engine: engine === "off" ? "auto" : engine,
    backgroundColor: "#0f1115",
    brightness: 100,
    contrast: 100,
    sepia: 0,
  };
}

async function main() {
  const config = readConfig(process.env);
  const { chromium } = loadPlaywright(config.globalModules);
  fs.mkdirSync(config.out, { recursive: true });

  // Extensions need a persistent context; --headless=new keeps them working headless.
  const context = await chromium.launchPersistentContext(path.join(config.out, "profile"), {
    headless: false,
    executablePath: config.browser,
    args: [`--disable-extensions-except=${config.ext}`, `--load-extension=${config.ext}`, "--headless=new"],
    viewport: { width: 1280, height: 800 },
    colorScheme: config.scheme,
  });

  const results = [];
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));

    for (const [name, url] of config.sites) {
      const host = new URL(url).hostname;
      for (const engine of ["off", ...config.engines]) {
        await worker.evaluate(
          ([key, value]) => new Promise((resolve) => chrome.storage.sync.set({ [key]: value }, resolve)),
          [host, siteConfig(engine)]
        );

        const page = await context.newPage();
        await page.addInitScript(() => {
          window.__fdmLongTaskMs = 0;
          try {
            new PerformanceObserver((list) => {
              list.getEntries().forEach((entry) => (window.__fdmLongTaskMs += entry.duration));
            }).observe({ type: "longtask", buffered: true });
          } catch (error) {
            // longtask timing is unavailable; report 0
          }
        });

        const started = Date.now();
        let error = null;
        try {
          await page.goto(url, { waitUntil: "load", timeout: 30000 });
        } catch (navError) {
          error = String(navError.message || navError).split("\n")[0];
        }
        await page.waitForTimeout(config.wait);
        const loadMs = Date.now() - started;

        const info = await page
          .evaluate(() => ({
            longTaskMs: Math.round(window.__fdmLongTaskMs || 0),
            // "css" when the CSS override engine is active; invert shows up as its style tag.
            mode: document.documentElement.getAttribute("data-force-dark-mode"),
            invert: Boolean(document.getElementById("__force_dark_invert__")),
            title: document.title.slice(0, 60),
          }))
          .catch(() => ({}));

        const file = `${name}-${engine}.png`;
        await page.screenshot({ path: path.join(config.out, file) }).catch(() => {});
        results.push({ name, engine, url, loadMs, error, screenshot: file, ...info });
        await page.close();
      }
    }
  } finally {
    await context.close();
  }

  console.log(JSON.stringify(results, null, 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
