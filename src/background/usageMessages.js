// Routes the usage-report messages. Returns undefined for anything it does not own, so the caller can fall through;
// otherwise a Promise of the reply. The caller has already checked sender.id === chrome.runtime.id. Never rejects.
//  - DARK_APPLIED comes from a content script only. The site is taken from the sender's own tab (http/https only),
//    never from anything inside the message, and the message carries just an engine name.
//  - USAGE_CONSENT and USAGE_STATUS come from the extension's own pages only: the side panel and the Options page.
//    The Options page runs in a tab, so "has a tab" does not tell a content script from an extension page; the
//    sender's own URL does (an extension page's URL starts with the extension's base URL, a web page's never does).
const ENGINES = ["auto", "css", "invert"];

function webHost(tab) {
  try {
    const url = new URL(tab && tab.url);
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : "";
  } catch (e) {
    return "";
  }
}

export function handleUsageMessage(usage, msg, sender, extensionUrl = "") {
  if (!msg || typeof msg !== "object") return undefined;
  const isExtensionPage =
    typeof extensionUrl === "string" &&
    extensionUrl.length > 0 &&
    !!sender &&
    typeof sender.url === "string" &&
    sender.url.startsWith(extensionUrl);
  const fromContentScript = !!(sender && sender.tab) && !isExtensionPage;
  switch (msg.type) {
    case "DARK_APPLIED": {
      if (!fromContentScript || !ENGINES.includes(msg.engine)) return undefined;
      const host = webHost(sender.tab);
      if (!host) return undefined;
      return usage.recordDarkApplied({ engine: msg.engine, host }).then(() => ({ ok: true }), () => ({ ok: false }));
    }
    case "USAGE_CONSENT":
      if (fromContentScript) return undefined;
      if (typeof msg.enabled !== "boolean") return Promise.resolve({ ok: false });
      return usage.setConsent(msg.enabled).catch(() => ({ ok: false }));
    case "USAGE_STATUS":
      if (fromContentScript) return undefined;
      return usage.status().catch(() => ({ enabled: false, consentNeeded: null }));
    default:
      return undefined;
  }
}
