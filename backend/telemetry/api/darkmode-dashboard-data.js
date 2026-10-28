// POST /api/darkmode-dashboard-data : private owner dashboard data. Body {token}, compared with DASHBOARD_TOKEN.
// Same-origin only (no CORS headers), never cached. Reads only the method and the body (no request headers).
// Missing or short DASHBOARD_TOKEN -> 503 and nothing is fetched. The document comes from the SQL
// function owner_dashboard() (supabase/daily_stats.sql) and is re-validated; invalid -> empty 500.
import { createSupabaseClient, readJsonBody } from "../lib/http.js";
import { isAuthorized } from "../lib/dashboardAuth.js";
import { validateDashboardData } from "../lib/dashboardData.js";

async function defaultStore() {
  const client = await createSupabaseClient();
  return {
    async getDashboard() {
      const { data, error } = await client.rpc("owner_dashboard");
      if (error) throw new Error("owner_dashboard failed");
      return data;
    },
  };
}

function finish(res, status, { body, allow } = {}) {
  if (typeof res.setHeader === "function") {
    if (allow) res.setHeader("Allow", allow);
    res.setHeader("Cache-Control", "no-store");
    if (body !== undefined) res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  res.status(status);
  if (body !== undefined) res.end(body);
  else res.end();
}

export function createDashboardDataHandler({ store, token } = {}) {
  let lazyStore = store;
  return async function handler(req, res) {
    if (req.method !== "POST") return finish(res, 405, { allow: "POST" });
    const secret = token !== undefined ? token : process.env.DASHBOARD_TOKEN;
    if (typeof secret !== "string" || secret.length < 32) return finish(res, 503);
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return finish(res, parsed.status);
    const v = parsed.value;
    if (!v || typeof v !== "object" || !isAuthorized(v.token, secret)) return finish(res, 401);
    let body;
    try {
      if (!lazyStore) lazyStore = await defaultStore();
      const doc = await lazyStore.getDashboard();
      if (!validateDashboardData(doc)) return finish(res, 500);
      body = JSON.stringify(doc);
    } catch (e) {
      return finish(res, 500);
    }
    return finish(res, 200, { body });
  };
}

const handler = createDashboardDataHandler();
export default (req, res) => handler(req, res);
