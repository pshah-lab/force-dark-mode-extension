// Copy of the broken-site report rules in src/shared/siteReport.js. The deployed project cannot import from the
// extension, so this file is duplicated and tests/site_report_backend_test.mjs asserts the two agree
// (same lists, same site normalisation). Change both files together.

export const ENGINES = ["auto", "css", "invert"];
export const BUILTIN_THEME_IDS = [
  "builtin:midnight",
  "builtin:oled",
  "builtin:dracula",
  "builtin:nord",
  "builtin:solarized",
  "builtin:contrast",
  "builtin:dim",
  "builtin:sepia",
];

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const PRIVATE_SUFFIXES = [".local", ".internal", ".test", ".localhost"];
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

function isReportableHostname(host) {
  if (host.length === 0 || host.length > 253 || host === "localhost") return false;
  if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return false;
  return /[a-z]/.test(labels[labels.length - 1]);
}

export function normalizeSite(input) {
  if (typeof input !== "string") return null;
  let host = input.trim();
  if (!host) return null;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  return isReportableHostname(host) ? host : null;
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The body must already be exactly what the extension sends: four keys, a normalized lowercase host.
export function validateReport(obj) {
  if (!isPlainObject(obj)) return false;
  const keys = Object.keys(obj).sort();
  if (keys.join(",") !== "engine,site,theme,version") return false;
  if (typeof obj.site !== "string" || normalizeSite(obj.site) !== obj.site) return false;
  if (!ENGINES.includes(obj.engine)) return false;
  if (!(obj.theme === "default" || obj.theme === "custom" || BUILTIN_THEME_IDS.includes(obj.theme))) return false;
  return typeof obj.version === "string" && VERSION.test(obj.version);
}
