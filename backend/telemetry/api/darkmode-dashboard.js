// GET /api/darkmode-dashboard : the private owner dashboard page. The page itself holds no data; it asks
// for the token, keeps it in memory only and sends it as a bearer header to /api/darkmode-dashboard-data.
import { DASHBOARD_HTML } from "../lib/dashboardPage.js";

export const DASHBOARD_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function createDashboardPageHandler() {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405);
      return res.end();
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Security-Policy", DASHBOARD_CSP);
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.status(200);
    res.end(DASHBOARD_HTML);
  };
}

const handler = createDashboardPageHandler();
export default (req, res) => handler(req, res);
