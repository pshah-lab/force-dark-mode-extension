// Allow-list module for opt-in anonymous usage metrics.
// Pure functions only: no extension-API calls, no network. Every field that can ever leave the
// device is enumerated here; validateHeartbeat rejects (never sanitises) anything else.

export const ENGINES = ["auto", "css", "invert"];
export const FEATURES = ["viewer", "editor", "customCss", "sitePack"];
// Must stay in sync with src/shared/builtinThemes.js (parity test in tests/telemetry_test.mjs).
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
export const OS_FAMILIES = ["mac", "windows", "linux", "chromeos", "other"];

const DEFAULT_THEME = "builtin:midnight";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const LANG_RE = /^[a-z]{2,3}$/;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const sameKeys = (obj, keys) => {
  const a = Object.keys(obj).sort();
  const b = [...keys].sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
};
const allBooleans = (obj) => Object.values(obj).every((v) => typeof v === "boolean");

export function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

export function emptyTally(day) {
  return {
    day,
    engines: { auto: false, css: false, invert: false },
    theme: null,
    features: { viewer: false, editor: false, customCss: false, sitePack: false },
  };
}

export function sanitizeUsage(msg) {
  if (!isPlainObject(msg)) return null;
  const keys = Object.keys(msg);
  if (keys.length !== 1) return null;
  const key = keys[0];
  const value = msg[key];
  if (key === "engine") return ENGINES.includes(value) ? { engine: value } : null;
  if (key === "feature") return FEATURES.includes(value) ? { feature: value } : null;
  if (key === "theme") return typeof value === "string" && value.length > 0 && value.length <= 200 ? { theme: value } : null;
  return null;
}

export function recordUsage(tally, usage) {
  const next = {
    day: tally.day,
    engines: { ...tally.engines },
    theme: tally.theme,
    features: { ...tally.features },
  };
  if (!isPlainObject(usage)) return next;
  if (ENGINES.includes(usage.engine)) next.engines[usage.engine] = true;
  if (FEATURES.includes(usage.feature)) next.features[usage.feature] = true;
  if (typeof usage.theme === "string") {
    next.theme = BUILTIN_THEME_IDS.includes(usage.theme) ? usage.theme : "custom";
  }
  return next;
}

export function buildEnv({ userAgent, lang } = {}) {
  const ua = typeof userAgent === "string" ? userAgent : "";
  const m = /Chrome\/(\d{1,3})\./.exec(ua);
  const chrome = m ? parseInt(m[1], 10) : 1;
  let os = "other";
  if (/CrOS/.test(ua)) os = "chromeos";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "mac";
  else if (/Windows/.test(ua)) os = "windows";
  else if (/Linux|X11/.test(ua)) os = "linux";
  const l = typeof lang === "string" ? /^([a-z]{2,3})(?:[-_]|$)/i.exec(lang) : null;
  return { chrome: chrome >= 1 && chrome <= 999 ? chrome : 1, os, lang: l ? l[1].toLowerCase() : "en" };
}

export function buildHeartbeat({ id, version, tally, env }) {
  return {
    id,
    day: tally.day,
    version,
    env: { chrome: env.chrome, os: env.os, lang: env.lang },
    engines: { auto: tally.engines.auto, css: tally.engines.css, invert: tally.engines.invert },
    theme: tally.theme || DEFAULT_THEME,
    features: {
      viewer: tally.features.viewer,
      editor: tally.features.editor,
      customCss: tally.features.customCss,
      sitePack: tally.features.sitePack,
    },
  };
}

export function validateHeartbeat(obj) {
  if (!isPlainObject(obj)) return false;
  if (!sameKeys(obj, ["id", "day", "version", "env", "engines", "theme", "features"])) return false;
  if (typeof obj.id !== "string" || !UUID_RE.test(obj.id)) return false;
  if (typeof obj.day !== "string" || !DAY_RE.test(obj.day)) return false;
  if (typeof obj.version !== "string" || !SEMVER_RE.test(obj.version)) return false;
  if (typeof obj.theme !== "string" || !(obj.theme === "custom" || BUILTIN_THEME_IDS.includes(obj.theme))) return false;

  const { env, engines, features } = obj;
  if (!isPlainObject(env) || !sameKeys(env, ["chrome", "os", "lang"])) return false;
  if (!Number.isInteger(env.chrome) || env.chrome < 1 || env.chrome > 999) return false;
  if (!OS_FAMILIES.includes(env.os)) return false;
  if (typeof env.lang !== "string" || !LANG_RE.test(env.lang)) return false;

  if (!isPlainObject(engines) || !sameKeys(engines, ENGINES) || !allBooleans(engines)) return false;
  if (!isPlainObject(features) || !sameKeys(features, FEATURES) || !allBooleans(features)) return false;
  return true;
}
