// CORS for the extension's background service worker. The extension declares no host
// permissions, so these functions must answer CORS themselves. The allowed origin is a
// single STATIC value: no request header (Origin included) is ever read.
//
// EXTENSION_ID must equal the Chrome Web Store ID of the published extension. If the store
// ID differs, or an unpacked development build has another ID, every telemetry request fails
// CORS (silently, nothing is sent) until this constant is changed and redeployed.
export const EXTENSION_ID = "kmhhphbakbhohiohagkhhgdgfbplkfke";
export const ALLOWED_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

export const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

export function setCorsHeaders(res) {
  if (typeof res.setHeader !== "function") return;
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
}

// CORS for the public statistics endpoint, read by the project website's stats page.
// Also a single STATIC origin; no request header is read.
export const STATS_ALLOWED_ORIGIN = "https://darkmode.pshah.fun";

export const STATS_CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": STATS_ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  Vary: "Origin",
});

export function setStatsCorsHeaders(res) {
  if (typeof res.setHeader !== "function") return;
  for (const [k, v] of Object.entries(STATS_CORS_HEADERS)) res.setHeader(k, v);
}
