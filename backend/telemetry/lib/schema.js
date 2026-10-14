// Copy of the allow-lists and validateHeartbeat from src/shared/telemetry.js.
// The deployed project cannot import from the extension, so this file is duplicated and
// tests/telemetry_backend_test.mjs asserts parity (deep-equal lists, same accept/reject).
// Change both files together.

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

export const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

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
