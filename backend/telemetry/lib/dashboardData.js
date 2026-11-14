// Fail-closed shape check of the owner dashboard document built by supabase/daily_stats.sql
// (owner_dashboard()). Counts and category names only: no install IDs, markup or links.
// Each day may carry featureUses (feature key -> uses summed over all installs that day; absent before usage_v3.sql)
// and surfaceUses ("<feature>__<surface>" -> uses summed over all installs that day; absent before usage_v4.sql).

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MAX_DAYS = 800;
const MAX_TOP_SITES = 50;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const exactKeys = (o, keys) => {
  const a = Object.keys(o).sort();
  const b = [...keys].sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
};
const isDay = (v) => {
  if (typeof v !== "string" || !DAY_RE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};
const safeString = (s) => typeof s === "string" && s.length <= 253 && !UUID_RE.test(s) && !/[<>]/.test(s) && !/http/i.test(s);
const countMap = (m) => isObj(m) && Object.entries(m).every(([k, v]) => safeString(k) && isCount(v));

const DAY_KEYS = ["day", "active", "newInstalls", "returning", "siteReports", "avgSites", "sites", "versions",
  "engines", "themes", "os", "chrome", "lang"];
const SITE_KEYS = ["s0", "s1_5", "s6_20", "s21p"];

function validDay(d) {
  if (!isObj(d) || !isDay(d.day)) return false;
  const hasOwn = (k) => Object.prototype.hasOwnProperty.call(d, k);
  const keys = [...DAY_KEYS];
  if (hasOwn("featureUses")) keys.push("featureUses");
  if (hasOwn("surfaceUses")) keys.push("surfaceUses");
  if (!exactKeys(d, keys)) return false;
  if (hasOwn("featureUses") && !countMap(d.featureUses)) return false;
  if (hasOwn("surfaceUses") && !countMap(d.surfaceUses)) return false;
  if (![d.active, d.newInstalls, d.returning, d.siteReports].every(isCount)) return false;
  if (d.avgSites !== null && !(typeof d.avgSites === "number" && d.avgSites >= 0 && d.avgSites <= 9999)) return false;
  if (!isObj(d.sites) || !exactKeys(d.sites, SITE_KEYS) || !Object.values(d.sites).every(isCount)) return false;
  return ["versions", "engines", "themes", "os", "chrome", "lang"].every((k) => countMap(d[k]));
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;
function validTopSite(s) {
  return isObj(s) && exactKeys(s, ["site", "reports", "days", "lastDay"]) && typeof s.site === "string" && DOMAIN_RE.test(s.site) && !UUID_RE.test(s.site) &&
    isCount(s.reports) && isCount(s.days) && isDay(s.lastDay);
}

export function validateDashboardData(doc) {
  if (!isObj(doc) || !exactKeys(doc, ["generatedAt", "days", "topSites"])) return false;
  if (typeof doc.generatedAt !== "string" || !ISO_RE.test(doc.generatedAt)) return false;
  if (!Array.isArray(doc.days) || doc.days.length > MAX_DAYS || !doc.days.every(validDay)) return false;
  return Array.isArray(doc.topSites) && doc.topSites.length <= MAX_TOP_SITES && doc.topSites.every(validTopSite);
}

// The "Top features" table: total uses per feature key over the last windowDays days (never per install), keys not
// in `allowed` ignored, largest first. Self-contained (no closure) because dashboardPage.js embeds its source.
export const FEATURE_WINDOW_DAYS = 30;
export function topFeatures(days, windowDays, allowed) {
  var totals = Object.create(null);
  var list = Array.isArray(days) ? days.slice(-windowDays) : [];
  for (var i = 0; i < list.length; i++) {
    var m = list[i] && list[i].featureUses;
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    var keys = Object.keys(m);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j], v = m[k];
      if (allowed.indexOf(k) < 0 || !Number.isInteger(v) || v <= 0) continue;
      totals[k] = (totals[k] || 0) + v;
    }
  }
  return Object.keys(totals).map(function (k) { return [k, totals[k]]; })
    .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
}

// The "Top features by surface" table: total uses per "<feature>__<surface>" key over the last windowDays days
// (never per install), split on the single "__" into [feature, surface, uses]. Keys whose halves are not in
// `features` / `surfaces`, and days without surfaceUses (before usage_v4.sql), are ignored. Largest first.
// Self-contained (no closure) because dashboardPage.js embeds its source.
export function topSurfaceFeatures(days, windowDays, features, surfaces) {
  var totals = Object.create(null);
  var list = Array.isArray(days) ? days.slice(-windowDays) : [];
  for (var i = 0; i < list.length; i++) {
    var m = list[i] && list[i].surfaceUses;
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    var keys = Object.keys(m);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j], v = m[k], parts = k.split("__");
      if (parts.length !== 2 || features.indexOf(parts[0]) < 0 || surfaces.indexOf(parts[1]) < 0) continue;
      if (!Number.isInteger(v) || v <= 0) continue;
      totals[k] = (totals[k] || 0) + v;
    }
  }
  return Object.keys(totals).map(function (k) { var p = k.split("__"); return [p[0], p[1], totals[k]]; })
    .sort(function (a, b) { return b[2] - a[2] || (a[0] + "__" + a[1] < b[0] + "__" + b[1] ? -1 : 1); });
}

// "Where dark mode is used": the dark_applied rows of topSurfaceFeatures as [surface, uses]. Self-contained.
export function darkBySurface(rows) {
  return rows.filter(function (r) { return r[0] === "dark_applied"; }).map(function (r) { return [r[1], r[2]]; });
}
