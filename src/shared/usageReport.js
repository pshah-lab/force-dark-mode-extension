// The opt-in daily usage report: what it may contain and how it is built.
// Pure functions only (no extension APIs, no network). The report has exactly five fields: a random install ID,
// the UTC day, the extension version, which engines were used that day, and how many sites dark mode was applied
// on. validateReport rejects (never sanitises) anything else, and it runs immediately before every send.

export const ENGINES = ["auto", "css", "invert"];
export const MAX_SITES = 9999;

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
  return { day, engines: { auto: false, css: false, invert: false }, sites: [] };
}

export function recordEngine(tally, engine) {
  const next = { day: tally.day, engines: { ...tally.engines }, sites: [...tally.sites] };
  if (ENGINES.includes(engine)) next.engines[engine] = true;
  return next;
}

export function recordSite(tally, host) {
  const next = { day: tally.day, engines: { ...tally.engines }, sites: [...tally.sites] };
  if (typeof host !== "string" || host.length === 0) return next;
  const h = hashSite(host);
  if (!next.sites.includes(h) && next.sites.length < MAX_SITES) next.sites.push(h);
  return next;
}

export function buildReport({ id, version, tally }) {
  return {
    id,
    day: tally.day,
    version,
    engines: { auto: tally.engines.auto, css: tally.engines.css, invert: tally.engines.invert },
    sites: tally.sites.length,
  };
}

export function validateReport(obj) {
  if (!isPlainObject(obj)) return false;
  if (!sameKeys(obj, ["id", "day", "version", "engines", "sites"])) return false;
  if (!isUuid(obj.id)) return false;
  if (typeof obj.day !== "string" || !DAY_RE.test(obj.day)) return false;
  if (typeof obj.version !== "string" || !SEMVER_RE.test(obj.version)) return false;
  const { engines } = obj;
  if (!isPlainObject(engines) || !sameKeys(engines, ENGINES)) return false;
  if (!Object.values(engines).every((v) => typeof v === "boolean")) return false;
  if (!Number.isInteger(obj.sites) || obj.sites < 0 || obj.sites > MAX_SITES) return false;
  return true;
}
