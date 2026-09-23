const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isSafeKey(key) {
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
    const safeConfig = {
      enabled: Boolean(config?.enabled),
      engine: typeof config?.engine === "string" ? config.engine : "auto",
      backgroundColor: typeof config?.backgroundColor === "string" ? config.backgroundColor : "#0f1115",
    };
    chrome.storage.sync.set({ [host]: safeConfig }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[ForceDark] Storage set error:", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

/**
 * Retrieve all stored configuration items from chrome.storage.sync.
 */
export function getAllConfigs() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (data) => {
      if (chrome.runtime.lastError) {
        console.warn("[ForceDark] Storage getAll error:", chrome.runtime.lastError.message);
        resolve({});
        return;
      }
      resolve(data || {});
    });
  });
}

/**
 * Clear all stored data from chrome.storage.sync (Right to Erasure / Reset).
 */
export function clearAllConfigs() {
  return new Promise((resolve) => {
    chrome.storage.sync.clear(() => {
      if (chrome.runtime.lastError) {
        console.warn("[ForceDark] Storage clear error:", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

/**
 * Export all preferences as a sanitized, portable JSON object (Right to Data Portability).
 */
export async function exportSettingsJson() {
  const raw = await getAllConfigs();
  const sanitized = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isSafeKey(key) && value && typeof value === "object") {
      sanitized[key] = value;
    }
  }
  return JSON.stringify(
    {
      version: "1.6.1",
      exportDate: new Date().toISOString(),
      generator: "ThemeSwitcher - Force Dark Mode",
      settings: sanitized,
    },
    null,
    2
  );
}

/**
 * Import settings from a validated JSON string.
 */
export async function importSettingsJson(jsonString) {
  if (typeof jsonString !== "string" || !jsonString.trim()) {
    throw new Error("Empty or invalid settings payload.");
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("Invalid JSON format.");
  }

  const payload = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : parsed;
  const toSet = {};
  let validCount = 0;

  for (const [key, val] of Object.entries(payload)) {
    if (!isSafeKey(key) || !val || typeof val !== "object") continue;

    toSet[key] = {
      enabled: Boolean(val.enabled),
      engine: typeof val.engine === "string" ? val.engine : "auto",
      backgroundColor: typeof val.backgroundColor === "string" ? val.backgroundColor : "#0f1115",
    };
    validCount++;
  }

  if (validCount === 0) {
    throw new Error("No valid configuration entries found to import.");
  }

  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(toSet, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(validCount);
    });
  });
}