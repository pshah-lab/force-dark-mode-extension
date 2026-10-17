// Sends one broken-site report when the user confirms it. Nothing is queued or retried in the background,
// and the only thing remembered is which sites were reported today (to stop accidental double reports).
import { REPORT_URL, buildReport } from "../shared/siteReport.js";

const STATE_KEY = "siteReportState";

const utcDay = (date) => date.toISOString().slice(0, 10);

function readState(raw, today) {
  const sites =
    raw && typeof raw === "object" && raw.day === today && Array.isArray(raw.sites)
      ? raw.sites.filter((s) => typeof s === "string")
      : [];
  return { day: today, sites };
}

// post(url, body) must resolve to an object with an `ok` flag; storage is { get(key), set(key, value) }.
export function createReportSender({ storage, post, now, version }) {
  const inFlight = new Set();

  // Resolves to "sent", "already", "invalid" or "failed"; never rejects.
  async function send(msg) {
    const report =
      msg && typeof msg === "object"
        ? buildReport({ site: msg.host, engine: msg.engine, themeId: msg.themeId, version })
        : null;
    if (!report) return "invalid";
    if (inFlight.has(report.site)) return "already";
    inFlight.add(report.site);
    try {
      const today = utcDay(now());
      const before = readState(await storage.get(STATE_KEY), today);
      if (before.sites.includes(report.site)) return "already";
      const res = await post(REPORT_URL, report);
      if (!res || !res.ok) return "failed";
      // The server already has the report: failing to remember it must not make the panel say it failed.
      try {
        const latest = readState(await storage.get(STATE_KEY), today);
        if (!latest.sites.includes(report.site)) latest.sites.push(report.site);
        await storage.set(STATE_KEY, latest);
      } catch (e) {
        // ignore
      }
      return "sent";
    } catch (e) {
      return "failed";
    } finally {
      inFlight.delete(report.site);
    }
  }

  return { send };
}
