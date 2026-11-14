// Shared request helpers. Reads only the method and body; nothing else about the request
// (no headers, no address) is ever accessed, logged or stored.
import { setCorsHeaders } from "./cors.js";

export const MAX_BODY_BYTES = 2048;
// Only the usage ingest endpoint (api/darkmode-telemetry.js) uses this: the largest valid consent-v4 report
// (44 featureUses + 120 surfaceUses entries) is about 4.75 KB. Every other endpoint keeps MAX_BODY_BYTES.
export const MAX_USAGE_BODY_BYTES = 8192;

// Returns { ok: true, value } or { ok: false, status }. maxBytes defaults to MAX_BODY_BYTES.
export async function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  let raw;
  try {
    raw = req.body;
  } catch (e) {
    return { ok: false, status: 400 };
  }
  if (raw === undefined || raw === null) return { ok: false, status: 400 };
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  let text;
  if (typeof raw === "string") text = raw;
  else if (typeof raw === "object") {
    try { text = JSON.stringify(raw); } catch (e) { return { ok: false, status: 400 }; }
  } else return { ok: false, status: 400 };
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, status: 413 };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, status: 400 };
  }
}

// Every response, success or error, carries the static CORS headers.
export function reply(res, status) {
  setCorsHeaders(res);
  res.status(status);
  if (status === 405 && typeof res.setHeader === "function") res.setHeader("Allow", "POST, OPTIONS");
  res.end();
}

// CORS preflight: answered with 204 before any body read or store access.
export function isPreflight(req) {
  return req.method === "OPTIONS";
}

// Lazily built so tests (and cold starts that never run a handler) never load supabase-js.
export async function createSupabaseClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
