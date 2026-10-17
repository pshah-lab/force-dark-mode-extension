// The only file in the extension that calls fetch(). Every request is a JSON POST to the developer's own
// first-party endpoint with no cookies and no referrer; callers decide what (little) goes in the body.
export async function postJson(url, body, { timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
