// POST /api/darkmode-telemetry-delete : body {id}; removes every row for that install ID (OPTIONS: CORS preflight).
import { isUuid } from "../lib/schema.js";
import { readJsonBody, reply, isPreflight, createSupabaseClient } from "../lib/http.js";

async function defaultStore() {
  const client = await createSupabaseClient();
  return {
    async deleteById(id) {
      const { error } = await client.from("heartbeats").delete().eq("install_id", id);
      if (error) throw new Error("delete failed");
    },
  };
}

export function createHandler({ store } = {}) {
  let lazyStore = store;
  return async function handler(req, res) {
    if (isPreflight(req)) return reply(res, 204);
    if (req.method !== "POST") return reply(res, 405);
    const body = await readJsonBody(req);
    if (!body.ok) return reply(res, body.status);
    const v = body.value;
    if (!v || typeof v !== "object" || Array.isArray(v)) return reply(res, 400);
    if (Object.keys(v).length !== 1 || !isUuid(v.id)) return reply(res, 400);
    try {
      if (!lazyStore) lazyStore = await defaultStore();
      await lazyStore.deleteById(v.id);
    } catch (e) {
      return reply(res, 500);
    }
    return reply(res, 204);
  };
}

// Created once per module so the lazily built Supabase client is reused across warm invocations.
const handler = createHandler();
export default (req, res) => handler(req, res);
