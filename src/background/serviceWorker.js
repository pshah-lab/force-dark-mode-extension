import { setSiteConfig, getSiteConfig } from "../shared/storage.js";

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "TOGGLE") {
    // Use tabId and url from payload (from popup) or sender (from content script)
    const tabId = msg.tabId || sender.tab?.id;
    const url = msg.url || sender.tab?.url;
    if (!tabId || !url) return;

    const host = new URL(url).hostname;
    const currentConfig = await getSiteConfig(host);
    const newEnabled = !currentConfig?.enabled;
    await setSiteConfig(host, { enabled: newEnabled });

    chrome.tabs.sendMessage(tabId, {
      type: newEnabled ? "ENABLE" : "DISABLE"
    }).catch(err => {
      console.warn("[ForceDark] Could not send message to tab (content script may not be ready or page is restricted):", err);
    });
  }
});