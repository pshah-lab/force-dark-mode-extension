/*
 * Vercel Routing Middleware for darkmode.pshah.fun: counts page requests from crawlers (search
 * engines, AI crawlers, link previews), split by family, in the same Upstash Redis as pshah.fun.
 * Crawlers mostly don't run JavaScript, so the visit beacon in docs/js/main.js never sees them.
 *
 * Only the family name is stored (a counter per family); people's visits, IP addresses and URLs
 * are not. The write happens after the response, so pages are never slowed down. Without the
 * Upstash variables (KV_REST_API_URL / KV_REST_API_TOKEN, set by connecting the store to this
 * project) it does nothing. This file is website-only; it is not part of the extension package.
 */

const FAMILIES = [
  ["Google", /googlebot|google-inspectiontool|googleother|storebot-google|adsbot-google|mediapartners-google|google-read-aloud/i],
  ["Bing", /bingbot|bingpreview|msnbot|adidxbot/i],
  ["OpenAI", /gptbot|chatgpt-user|oai-searchbot/i],
  ["Anthropic", /claudebot|claude-user|claude-searchbot|anthropic-ai/i],
  ["Perplexity", /perplexitybot|perplexity-user/i],
  ["Apple", /applebot/i],
  ["DuckDuckGo", /duckduckbot|duckassistbot/i],
  ["Yandex", /yandex/i],
  ["Baidu", /baiduspider/i],
  ["Meta", /meta-externalagent|meta-externalfetcher|facebookexternalhit|facebookbot/i],
  ["Amazon", /amazonbot/i],
  ["ByteDance", /bytespider/i],
  ["Common Crawl", /ccbot/i],
  ["SEO tools", /ahrefsbot|semrushbot|mj12bot|dotbot|rogerbot|dataforseobot|serpstatbot/i],
  ["Link previews", /twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|redditbot/i],
];
const GENERIC_BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|embedly|curl|wget|python-requests/i;

function crawlerFamily(ua) {
  for (const [name, pattern] of FAMILIES) if (pattern.test(ua)) return name;
  return !ua || GENERIC_BOT.test(ua) ? "Other" : null;
}

// Best-effort per-IP cap (per instance) so one client faking a crawler can't burn the Redis quota.
const recent = new Map();
function rateLimited(ip, max = 120) {
  const now = Date.now();
  if (recent.size > 5000) recent.clear();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 3600000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > max;
}

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
// Previews count separately so they never inflate the live numbers.
const KEY = `darkmode:crawlers:${process.env.VERCEL_ENV || "development"}`;

export default function middleware(request, context) {
  if (!url || !token || (request.method !== "GET" && request.method !== "HEAD")) return;
  const family = crawlerFamily(request.headers.get("user-agent") || "");
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!family || rateLimited(ip)) return;
  context.waitUntil(
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["HINCRBY", KEY, family, "1"]),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {})
  );
}

export const config = {
  // HTML pages, robots.txt, sitemap.xml and llms.txt; not images, styles, scripts or fonts.
  matcher: ["/((?!assets/|css/|js/|.*\\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?|css|js|map|pdf|zip|json|webmanifest)$).*)"],
};
