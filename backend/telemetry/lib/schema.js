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

// The opt-in usage report (2.1.0+): five fields, plus an optional sixth, featureUses (a map of allow-listed feature
// keys to counts 1..999, never empty). Copy of validateReport in src/shared/usageReport.js, except that the allow-list
// is a superset: the extension's FEATURE_KEYS plus reserved tool_* keys for a later release, so the backend can be
// deployed first. tests/usage_backend_test.mjs asserts the two agree on every case, so change both together.
export const MAX_SITES = 9999;
export const MAX_FEATURE_COUNT = 999;
export const FEATURE_KEYS_ACCEPTED = Object.freeze([
  "viewer_pdf", "viewer_docx", "viewer_pptx", "viewer_xlsx", "viewer_csv", "viewer_md", "viewer_txt", "viewer_rtf",
  "export_pdf_txt", "export_pdf_md", "export_pdf_png",
  "export_docx_txt", "export_docx_md", "export_docx_html",
  "export_pptx_txt", "export_pptx_md", "export_pptx_html",
  "export_xlsx_csv", "export_xlsx_json", "export_csv_xlsx",
  "export_md_html", "export_txt_html", "export_rtf_html",
  // Reserved (not sent by the extension yet).
  "tool_merge", "tool_split", "tool_extract", "tool_remove", "tool_reorder", "tool_rotate", "tool_images_to_pdf",
  "tool_page_numbers", "tool_watermark", "tool_strip_metadata", "tool_color_copy_dark", "tool_color_copy_sepia",
  "tool_color_copy_gray",
]);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const USAGE_KEYS = ["id", "day", "version", "engines", "sites"];

export function validateUsage(obj) {
  if (!isPlainObject(obj)) return false;
  const hasFeatures = hasOwn(obj, "featureUses");
  if (!sameKeys(obj, hasFeatures ? [...USAGE_KEYS, "featureUses"] : USAGE_KEYS)) return false;
  if (typeof obj.id !== "string" || !UUID_RE.test(obj.id)) return false;
  if (typeof obj.day !== "string" || !DAY_RE.test(obj.day)) return false;
  if (typeof obj.version !== "string" || !SEMVER_RE.test(obj.version)) return false;
  const { engines } = obj;
  if (!isPlainObject(engines) || !sameKeys(engines, ENGINES) || !allBooleans(engines)) return false;
  if (!Number.isInteger(obj.sites) || obj.sites < 0 || obj.sites > MAX_SITES) return false;
  if (hasFeatures) {
    const fu = obj.featureUses;
    if (!isPlainObject(fu)) return false;
    const keys = Object.keys(fu);
    if (keys.length === 0) return false;
    for (const k of keys) {
      if (!FEATURE_KEYS_ACCEPTED.includes(k)) return false;
      const n = fu[k];
      if (!Number.isInteger(n) || n < 1 || n > MAX_FEATURE_COUNT) return false;
    }
  }
  return true;
}
