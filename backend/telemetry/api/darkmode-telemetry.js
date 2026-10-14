// POST /api/darkmode-telemetry : validates and upserts one anonymous heartbeat.
// Only req.method and req.body are used. No header or network address is read or stored.
import { validateHeartbeat } from "../lib/schema.js";
import { readJsonBody, reply, createSupabaseClient } from "../lib/http.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseRealDay(day) {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  // Round trip rejects impossible dates such as 2026-02-30 or 2026-13-45.
  return new Date(t).toISOString().slice(0, 10) === day ? t : null;
}

export function dayWithinWindow(day, nowDate) {
  const t = parseRealDay(day);
  if (t === null) return false;
  const today = Date.parse(`${nowDate.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.abs(t - today) <= DAY_MS;
}

async function defaultStore() {
  const client = await createSupabaseClient();
  return {
    async upsertHeartbeat(row) {
      const { error } = await client.from("heartbeats").upsert(row, { onConflict: "install_id,day" });
      if (error) throw new Error("upsert failed");
    },
  };
}

export function createHandler({ store, now = () => new Date() } = {}) {
  let lazyStore = store;
  return async function handler(req, res) {
    if (req.method !== "POST") return reply(res, 405);
    const body = await readJsonBody(req);
    if (!body.ok) return reply(res, body.status);
    const hb = body.value;
    if (!validateHeartbeat(hb)) return reply(res, 400);
    if (!dayWithinWindow(hb.day, now())) return reply(res, 400);
    const row = {
      install_id: hb.id,
      day: hb.day,
      version: hb.version,
      chrome: hb.env.chrome,
      os: hb.env.os,
      lang: hb.env.lang,
      engines: hb.engines,
      theme: hb.theme,
      features: hb.features,
    };
    try {
      if (!lazyStore) lazyStore = await defaultStore();
      await lazyStore.upsertHeartbeat(row);
    } catch (e) {
      return reply(res, 500);
    }
    return reply(res, 204);
  };
}

export default async function handler(req, res) {
  return createHandler()(req, res);
}
