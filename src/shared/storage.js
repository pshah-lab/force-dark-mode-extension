const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isSafeKey(key) {
  return typeof key === "string" && key.length > 0 && !DISALLOWED_KEYS.has(key.trim().toLowerCase());
}

export function getSiteConfig(host) {
  return new Promise((resolve) => {
    if (!isSafeKey(host)) {
      resolve(null);
      return;
    }
    chrome.storage.sync.get(host, (data) => {
      if (chrome.runtime.lastError) {
        console.warn("[ForceDark] Storage get error:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(data[host] || null);
    });
  });
}

export function setSiteConfig(host, config) {
  return new Promise((resolve) => {
    if (!isSafeKey(host)) {
      resolve();
      return;
    }
    chrome.storage.sync.set({ [host]: config }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[ForceDark] Storage set error:", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}