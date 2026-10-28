// Fail-closed shape check of the owner dashboard document built by supabase/daily_stats.sql
// (owner_dashboard()). Counts and category names only: no install IDs, markup or links.

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
  if (!isObj(d) || !exactKeys(d, DAY_KEYS) || !isDay(d.day)) return false;
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
