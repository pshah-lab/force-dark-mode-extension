// Fail-closed check of the public statistics document built by supabase/public_stats.sql.
// The SQL function applies the disclosure control (groups under MIN_GROUP installs hidden or
// merged); this validator re-checks the published shape so a bug or bad row can never make
// the endpoint serve a small count, an ID, markup or a link. Anything unexpected -> false.

export const MIN_GROUP = 10;
export const WINDOW_DAYS = 30;
export const MAX_WEEKS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID_ANYWHERE_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const TOP_KEYS = ["generatedAt", "minGroup", "windowDays", "active", "newVsReturning", "retention",
  "engines", "themes", "features", "os", "chrome", "lang"];
const ENGINE_KEYS = ["auto", "css", "invert"];
const FEATURE_KEYS = ["viewer", "editor", "customCss", "sitePack"];
const RETENTION_KEYS = ["d1", "d7", "d30"];
const OS_KEYS = ["mac", "windows", "linux", "chromeos", "other"];

const CATEGORY_KEY = {
  themes: (k) => k === "custom" || k === "other" || /^builtin:[a-z0-9-]{1,40}$/.test(k),
  os: (k) => OS_KEYS.includes(k),
  chrome: (k) => k === "other" || /^[1-9]\d{0,2}$/.test(k),
  lang: (k) => k === "other" || /^[a-z]{2,3}$/.test(k),
};

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const hasExactKeys = (obj, keys) => {
  const a = Object.keys(obj).sort();
  const b = [...keys].sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
};
// n: a count published only when it rests on at least MIN_GROUP installs.
const isCount = (v) => v === null || (Number.isInteger(v) && v >= MIN_GROUP);
// p: an integer percent.
const isShare = (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100);

function dayToMs(day) {
  if (typeof day !== "string" || !DAY_RE.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10) === day ? t : null;
}

function isIsoTimestamp(v) {
  if (typeof v !== "string" || !ISO_RE.test(v)) return false;
  return dayToMs(v.slice(0, 10)) !== null && !Number.isNaN(Date.parse(v));
}

// Every string, key or value, anywhere in the document.
function stringsAreSafe(v) {
  if (typeof v === "string") {
    return !UUID_ANYWHERE_RE.test(v) && !v.includes("<") && !/http/i.test(v);
  }
  if (Array.isArray(v)) return v.every(stringsAreSafe);
  if (isPlainObject(v)) return Object.entries(v).every(([k, x]) => stringsAreSafe(k) && stringsAreSafe(x));
  return true;
}

function validActive(a) {
  if (!isPlainObject(a) || !hasExactKeys(a, ["dau", "wau", "mau"])) return false;
  if (!isCount(a.wau) || !isCount(a.mau)) return false;
  if (!Array.isArray(a.dau) || a.dau.length !== WINDOW_DAYS) return false;
  let prev = null;
  for (const e of a.dau) {
    if (!isPlainObject(e) || !hasExactKeys(e, ["day", "count"])) return false;
    const t = dayToMs(e.day);
    if (t === null) return false;
    if (prev !== null && t - prev !== DAY_MS) return false; // consecutive, oldest first
    prev = t;
    if (!isCount(e.count)) return false;
  }
  return true;
}

function validNewVsReturning(v) {
  if (v === null) return true;
  if (!isPlainObject(v) || !hasExactKeys(v, ["weeks"])) return false;
  if (!Array.isArray(v.weeks) || v.weeks.length > MAX_WEEKS) return false;
  return v.weeks.every((w) => {
    if (!isPlainObject(w) || !hasExactKeys(w, ["weekStart", "new", "returning"])) return false;
    const t = dayToMs(w.weekStart);
    if (t === null || new Date(t).getUTCDay() !== 1) return false; // Monday
    return isCount(w.new) && isCount(w.returning) && (w.new === null) === (w.returning === null); // Ruling 3: both hidden or neither
  });
}

// Share bounds implied by the MAU. A share p of a group with c installs is round(100 * c / mau).
// Every published group has c >= MIN_GROUP, so p >= round(100 * MIN_GROUP / mau); engine and
// feature flags also need mau - c >= MIN_GROUP (else the non-users are derivable), so
// p <= round(100 * (mau - MIN_GROUP) / mau). floor/ceil add slack so a legitimately rounded
// value is never rejected; only clearly impossible shares are.
const minShare = (mau) => Math.floor((100 * MIN_GROUP) / mau);
const maxFlagShare = (mau) => Math.ceil((100 * (mau - MIN_GROUP)) / mau);

function shareFits(p, mau, isFlag) {
  if (p === null) return true;
  if (!isShare(p)) return false;
  if (p < minShare(mau)) return false;
  return !isFlag || p <= maxFlagShare(mau);
}

function validFixedShares(v, keys, mau = null, isFlag = false) {
  if (v === null) return true;
  if (!isPlainObject(v) || !hasExactKeys(v, keys) || !Object.values(v).every(isShare)) return false;
  return mau === null || Object.values(v).every((p) => shareFits(p, mau, isFlag));
}

function validCategory(v, keyOk, mau) {
  if (v === null) return true;
  if (!isPlainObject(v)) return false;
  return Object.entries(v).every(([k, p]) => keyOk(k) && isShare(p) && shareFits(p, mau, false));
}

const GATED_SECTIONS = ["newVsReturning", "retention", "engines", "themes", "features", "os", "chrome", "lang"];

export function validatePublicStats(doc) {
  if (!isPlainObject(doc) || !hasExactKeys(doc, TOP_KEYS)) return false;
  if (!isIsoTimestamp(doc.generatedAt)) return false;
  if (doc.minGroup !== MIN_GROUP || doc.windowDays !== WINDOW_DAYS) return false;
  if (!validActive(doc.active)) return false;
  const mau = doc.active.mau;
  // MAU gate: with fewer than 10 active installs nothing but `active` (itself all null) is published.
  if (mau === null) {
    if (doc.active.wau !== null || doc.active.dau.some((e) => e.count !== null)) return false;
    if (GATED_SECTIONS.some((k) => doc[k] !== null)) return false;
  }
  if (!validNewVsReturning(doc.newVsReturning)) return false;
  if (!validFixedShares(doc.retention, RETENTION_KEYS)) return false; // relative to the cohort, not MAU
  if (!validFixedShares(doc.engines, ENGINE_KEYS, mau, true)) return false;
  if (!validFixedShares(doc.features, FEATURE_KEYS, mau, true)) return false;
  for (const [section, keyOk] of Object.entries(CATEGORY_KEY)) {
    if (!validCategory(doc[section], keyOk, mau)) return false;
  }
  return stringsAreSafe(doc);
}
