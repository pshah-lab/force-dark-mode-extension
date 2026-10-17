// POST /api/darkmode-report : one user-confirmed broken-site report (OPTIONS: CORS preflight).
// Only req.method and the body are read. The day is the server's UTC date; no header or address is used.
import { validateReport } from "../lib/reportSchema.js";
import { readJsonBody, reply, isPreflight, createSupabaseClient } from "../lib/http.js";

async function defaultStore() {
  const client = await createSupabaseClient();
  return {
    async upsertReport(row) {
      const { error } = await client.rpc("report_site", {
        p_day: row.day,
        p_site: row.site,
        p_engine: row.engine,
        p_theme: row.theme,
        p_version: row.version,
      });
      if (error) throw new Error("report failed");
    },
  };
}

export function createReportHandler({ store, now = () => new Date() } = {}) {
  let lazyStore = store;
  return async function handler(req, res) {
    if (isPreflight(req)) return reply(res, 204);
    if (req.method !== "POST") return reply(res, 405);
    const body = await readJsonBody(req);
    if (!body.ok) return reply(res, body.status);
    const r = body.value;
    if (!validateReport(r)) return reply(res, 400);
    try {
      if (!lazyStore) lazyStore = await defaultStore();
      await lazyStore.upsertReport({
        day: now().toISOString().slice(0, 10),
        site: r.site,
        engine: r.engine,
        theme: r.theme,
        version: r.version,
      });
    } catch (e) {
      return reply(res, 500);
    }
    return reply(res, 204);
  };
}

// Created once per module so the lazily built Supabase client is reused across warm invocations.
const handler = createReportHandler();
export default (req, res) => handler(req, res);
