// The 2.0.x usage heartbeat validator. The extension no longer sends heartbeats (removed in 2.1.0) but 2.0.x
// clients still do, so this file is frozen to what the extension module accepted; tests/telemetry_backend_test.mjs
// pins its lists and accept/reject table.

export const ENGINES = ["auto", "css", "invert"];
export const FEATURES = ["viewer", "editor", "customCss", "sitePack"];
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
