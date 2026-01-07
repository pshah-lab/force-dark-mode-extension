import { setSiteConfig, getSiteConfig } from "../shared/storage.js";

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type !== "TOGGLE") return;

  const tabId = msg.tabId || sender.tab?.id;
  const url = msg.url || sender.tab?.url;
  if (!tabId || !url) return;

  const host = new URL(url).hostname;
  const currentConfig = await getSiteConfig(host);
  const newEnabled =
  typeof msg.forceEnabled === "boolean"
    ? msg.forceEnabled
    : !currentConfig?.enabled;

  const engine = msg.engine || currentConfig?.engine || "css";

  await setSiteConfig(host, {
    enabled: newEnabled,
    engine
  });

  chrome.tabs.sendMessage(tabId, {
    type: "APPLY_CONFIG",
    config: {
      enabled: newEnabled,
      engine
    }
  }).catch(err => {
    console.warn(
      "[ForceDark] Could not send message to tab (content script may not be ready or page is restricted):",
      err
    );
  });
});