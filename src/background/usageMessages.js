// Routes the usage-report messages. Returns undefined for anything it does not own, so the caller can fall through;
// otherwise a Promise of the reply. The caller has already checked sender.id === chrome.runtime.id. Never rejects.
//  - DARK_APPLIED comes from a content script only. The site is taken from the sender's own tab (http/https only),
//    never from anything inside the message, and the message carries just an engine name.
//  - USAGE_CONSENT and USAGE_STATUS come from the extension's own pages only (never from a tab).
const ENGINES = ["auto", "css", "invert"];

function webHost(tab) {
  try {
    const url = new URL(tab && tab.url);
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : "";
  } catch (e) {
    return "";
  }
}

export function handleUsageMessage(usage, msg, sender) {
  if (!msg || typeof msg !== "object") return undefined;
  const fromTab = !!(sender && sender.tab);
  switch (msg.type) {
    case "DARK_APPLIED": {
      if (!fromTab || !ENGINES.includes(msg.engine)) return undefined;
      const host = webHost(sender.tab);
      if (!host) return undefined;
      return usage.recordDarkApplied({ engine: msg.engine, host }).then(() => ({ ok: true }), () => ({ ok: false }));
    }
    case "USAGE_CONSENT":
      if (fromTab) return undefined;
      if (typeof msg.enabled !== "boolean") return Promise.resolve({ ok: false });
      return usage.setConsent(msg.enabled).catch(() => ({ ok: false }));
    case "USAGE_STATUS":
      if (fromTab) return undefined;
      return usage.status().catch(() => ({ enabled: false, consentNeeded: null }));
    default:
      return undefined;
  }
}
