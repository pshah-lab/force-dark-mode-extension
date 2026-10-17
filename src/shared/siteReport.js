// The broken-site report: what it may contain and how a site name is reduced before anything is sent.
// Only four values ever leave the browser: the site's domain, the engine, a theme label and the version.
export const REPORT_URL = "https://pshah.fun/api/darkmode-report";

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
  // An all-numeric last label is an IP address, never a public site.
  return /[a-z]/.test(labels[labels.length - 1]);
}

// Accepts a page address or a bare host and returns the lowercase hostname, or null when it must not be sent.
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

export function buildReport(input) {
  if (!input || typeof input !== "object") return null;
  const { site, engine, themeId, version } = input;
  const normalized = normalizeSite(site);
  if (!normalized || !ENGINES.includes(engine) || typeof version !== "string" || !VERSION.test(version)) return null;
  let theme = "custom";
  if (themeId === undefined || themeId === null || themeId === "" || themeId === "default") theme = "default";
  else if (BUILTIN_THEME_IDS.includes(themeId)) theme = themeId;
  return { site: normalized, engine, theme, version };
}
