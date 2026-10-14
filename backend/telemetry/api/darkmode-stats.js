// GET /api/darkmode-stats : the public aggregate usage statistics document (OPTIONS: CORS preflight).
// Only req.method is used. No header, body or network address is read. The document is built by the
// SQL function public_stats() (supabase/public_stats.sql), which applies the small-group suppression,
// and is re-validated here; anything invalid fails closed with an empty 500.
import { setStatsCorsHeaders } from "../lib/cors.js";
import { createSupabaseClient } from "../lib/http.js";
import { validatePublicStats } from "../lib/publicStats.js";

export const STATS_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=600";

async function defaultStore() {
  const client = await createSupabaseClient();
  return {
    async getPublicStats() {
      const { data, error } = await client.rpc("public_stats");
      if (error) throw new Error("public_stats failed");
      return data;
    },
  };
}

function finish(res, status, { body, cache, allow } = {}) {
  setStatsCorsHeaders(res);
  if (typeof res.setHeader === "function") {
    if (allow) res.setHeader("Allow", allow);
    res.setHeader("Cache-Control", cache || "no-store");
    if (body !== undefined) res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  res.status(status);
  if (body !== undefined) res.end(body);
  else res.end();
}

// generatedAt comes from the database, so the handler takes no clock.
export function createStatsHandler({ store } = {}) {
  let lazyStore = store;
  return async function handler(req, res) {
    const method = req.method;
    if (method === "OPTIONS") return finish(res, 204);
    if (method !== "GET") return finish(res, 405, { allow: "GET, OPTIONS" });
    let body;
    try {
      if (!lazyStore) lazyStore = await defaultStore();
      const doc = await lazyStore.getPublicStats();
      if (!validatePublicStats(doc)) return finish(res, 500);
      body = JSON.stringify(doc);
    } catch (e) {
      return finish(res, 500);
    }
    return finish(res, 200, { body, cache: STATS_CACHE_CONTROL });
  };
}

// Created once per module so the lazily built Supabase client is reused across warm invocations.
const handler = createStatsHandler();
export default (req, res) => handler(req, res);
