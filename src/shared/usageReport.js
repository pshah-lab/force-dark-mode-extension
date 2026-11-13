// The opt-in daily usage report: what it may contain and how it is built.
// Pure functions only (no extension APIs, no network). The report has five fields: a random install ID,
// the UTC day, the extension version, which engines were used that day, and how many sites dark mode was applied
// on. A sixth, optional field, featureUses, is present only when at least one viewer/export feature was used: a map
// of allow-listed feature keys to counts (1..999). No file names, contents or sites. validateReport rejects (never sanitises) anything else, and it runs immediately before every send.

export const ENGINES = ["auto", "css", "invert"];
export const MAX_SITES = 9999;
export const MAX_FEATURE_COUNT = 999;
export const FEATURE_KEYS = [
  "viewer_pdf", "viewer_docx", "viewer_pptx", "viewer_xlsx", "viewer_csv", "viewer_md", "viewer_txt", "viewer_rtf",
  "export_pdf_txt", "export_pdf_md", "export_pdf_png",
  "export_docx_txt", "export_docx_md", "export_docx_html",
  "export_pptx_txt", "export_pptx_md", "export_pptx_html",
  "export_xlsx_csv", "export_xlsx_json", "export_csv_xlsx",
  "export_md_html", "export_txt_html", "export_rtf_html",
];
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const sameKeys = (obj, keys) => {
  const a = Object.keys(obj).sort();
  const b = [...keys].sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
};

export const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

export function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

// FNV-1a, 32-bit, over the lower-cased host. Only this number is stored locally, never the host name.
export function hashSite(host) {
  let h = 0x811c9dc5;
  const s = String(host).toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function emptyTally(day) {
  return { day, engines: { auto: false, css: false, invert: false }, sites: [], features: {} };
}

const cloneTally = (tally) => ({
  day: tally.day,
  engines: { ...tally.engines },
  sites: [...tally.sites],
  features: { ...(isPlainObject(tally.features) ? tally.features : {}) },
});

export function recordEngine(tally, engine) {
  const next = cloneTally(tally);
  if (ENGINES.includes(engine)) next.engines[engine] = true;
  return next;
}

export function recordSite(tally, host) {
  const next = cloneTally(tally);
  if (typeof host !== "string" || host.length === 0) return next;
  const h = hashSite(host);
  if (!next.sites.includes(h) && next.sites.length < MAX_SITES) next.sites.push(h);
  return next;
}

export function recordFeature(tally, key) {
  const next = cloneTally(tally);
  if (typeof key !== "string" || !FEATURE_KEYS.includes(key)) return next;
  const cur = hasOwn(next.features, key) && Number.isInteger(next.features[key]) ? next.features[key] : 0;
  next.features[key] = Math.min(cur + 1, MAX_FEATURE_COUNT);
  return next;
}

export function buildReport({ id, version, tally }) {
  const report = {
    id,
    day: tally.day,
    version,
    engines: { auto: tally.engines.auto, css: tally.engines.css, invert: tally.engines.invert },
    sites: tally.sites.length,
  };
  const features = isPlainObject(tally.features) ? tally.features : {};
  const featureUses = {};
  for (const k of FEATURE_KEYS) {
    if (hasOwn(features, k) && Number.isInteger(features[k]) && features[k] > 0) {
      featureUses[k] = Math.min(features[k], MAX_FEATURE_COUNT);
    }
  }
  if (Object.keys(featureUses).length > 0) report.featureUses = featureUses;
  return report;
}

export function validateReport(obj) {
  if (!isPlainObject(obj)) return false;
  const base = ["id", "day", "version", "engines", "sites"];
  const hasFeatures = hasOwn(obj, "featureUses");
  if (!sameKeys(obj, hasFeatures ? [...base, "featureUses"] : base)) return false;
  if (!isUuid(obj.id)) return false;
  if (typeof obj.day !== "string" || !DAY_RE.test(obj.day)) return false;
  if (typeof obj.version !== "string" || !SEMVER_RE.test(obj.version)) return false;
  const { engines } = obj;
  if (!isPlainObject(engines) || !sameKeys(engines, ENGINES)) return false;
  if (!Object.values(engines).every((v) => typeof v === "boolean")) return false;
  if (!Number.isInteger(obj.sites) || obj.sites < 0 || obj.sites > MAX_SITES) return false;
  if (hasFeatures) {
    const fu = obj.featureUses;
    if (!isPlainObject(fu)) return false;
    const keys = Object.keys(fu);
    if (keys.length === 0) return false;
    for (const k of keys) {
      if (!FEATURE_KEYS.includes(k)) return false;
      const n = fu[k];
      if (!Number.isInteger(n) || n < 1 || n > MAX_FEATURE_COUNT) return false;
    }
  }
  return true;
}
