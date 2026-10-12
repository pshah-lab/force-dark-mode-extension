import {
  clampFilterValue,
  VALID_SCHEDULE_MODES,
  DEFAULT_SCHEDULE_START,
  DEFAULT_SCHEDULE_END,
  TIME_PATTERN,
  THEME_ID_PATTERN,
} from "./constants.js";
import "./colorUtils.js";
import "./themeCore.js";

// Single place to bump the exported settings version (the privacy test matches this literal).
const EXTENSION_VERSION_META = { version: "1.8.0" };
const EXTENSION_VERSION = EXTENSION_VERSION_META.version;
const THEMES_KEY = "__customThemes";
const CSS_PREFIX = "__css:";
const QUOTA_MESSAGE = "Browser storage is full. Delete a theme or some custom CSS and try again.";

function themes() {
  return globalThis.ForceDarkThemes;
}

function maxThemes() {
  return themes()?.LIMITS?.MAX_USER_THEMES ?? 20;
}

function maxCssSites() {
  return themes()?.LIMITS?.MAX_CSS_SITES ?? 30;
}

export function sanitizeThemeId(value) {
  return typeof value === "string" && (value === "" || value === "default" || THEME_ID_PATTERN.test(value))
    ? value
    : "";
}

const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SCHEDULE_KEY = "scheduleConfig";

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
      brightness: clampFilterValue("brightness", config?.brightness),
      contrast: clampFilterValue("contrast", config?.contrast),
      sepia: clampFilterValue("sepia", config?.sepia),
    };
    if (config && Object.prototype.hasOwnProperty.call(config, "themeId")) {
      safeConfig.themeId = sanitizeThemeId(config.themeId);
    }
    chrome.storage.sync.set({ [host]: safeConfig }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[ForceDark] Storage set error:", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

/**
 * Retrieve the global automatic-scheduling preference from chrome.storage.local.
 * Kept separate from per-site chrome.storage.sync data so it never gets
 * pulled into the per-site export/import/erasure flows.
 */
export function getScheduleConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SCHEDULE_KEY, (data) => {
      if (chrome.runtime.lastError) {
        console.warn("[ForceDark] Schedule get error:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(data[SCHEDULE_KEY] || null);
    });
  });
}

export function setScheduleConfig(config) {
  return new Promise((resolve) => {
    const mode = VALID_SCHEDULE_MODES.has(config?.mode) ? config.mode : "off";
    const start = TIME_PATTERN.test(config?.start) ? config.start : DEFAULT_SCHEDULE_START;
    const end = TIME_PATTERN.test(config?.end) ? config.end : DEFAULT_SCHEDULE_END;

    chrome.storage.local.set({ [SCHEDULE_KEY]: { mode, start, end } }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[ForceDark] Schedule set error:", chrome.runtime.lastError.message);
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
  const customCss = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(CSS_PREFIX)) {
      const host = key.slice(CSS_PREFIX.length);
      if (isSafeKey(host) && typeof value === "string") customCss[host] = value;
      continue;
    }
    if (key.startsWith("__")) continue;
    if (isSafeKey(key) && value && typeof value === "object") {
      sanitized[key] = value;
    }
  }
  return JSON.stringify(
    {
      version: EXTENSION_VERSION,
      exportDate: new Date().toISOString(),
      generator: "ThemeSwitcher - Force Dark Mode",
      settings: sanitized,
      themes: await getCustomThemes(),
      customCss,
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

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid settings payload.");
  }
  const hasSettings = parsed.settings && typeof parsed.settings === "object" && !Array.isArray(parsed.settings);
  const payload = hasSettings ? parsed.settings : parsed;
  const toSet = {};
  let configCount = 0;

  for (const [key, val] of Object.entries(payload)) {
    if (!isSafeKey(key) || !val || typeof val !== "object" || Array.isArray(val)) continue;
    if (key.startsWith("__")) continue;
    if (!hasSettings && ["version", "exportDate", "generator", "themes", "customCss"].includes(key)) continue;

    toSet[key] = {
      enabled: Boolean(val.enabled),
      engine: typeof val.engine === "string" ? val.engine : "auto",
      backgroundColor: typeof val.backgroundColor === "string" ? val.backgroundColor : "#0f1115",
      brightness: clampFilterValue("brightness", val.brightness),
      contrast: clampFilterValue("contrast", val.contrast),
      sepia: clampFilterValue("sepia", val.sepia),
    };
    if (Object.prototype.hasOwnProperty.call(val, "themeId")) {
      toSet[key].themeId = sanitizeThemeId(val.themeId);
    }
    configCount++;
  }

  let themeCount = 0;
  if (Array.isArray(parsed.themes)) {
    const merged = await getCustomThemes();
    for (const candidate of parsed.themes) {
      const result = themes()?.validateTheme?.(candidate);
      if (!result?.ok || !result.theme.id.startsWith("user:")) continue;
      const idx = merged.findIndex((t) => t.id === result.theme.id);
      if (idx >= 0) merged[idx] = result.theme;
      else if (merged.length < maxThemes()) merged.push(result.theme);
      else continue;
      themeCount++;
    }
    if (themeCount > 0) toSet[THEMES_KEY] = merged;
  }

  let cssCount = 0;
  const cssIn = parsed.customCss;
  if (cssIn && typeof cssIn === "object" && !Array.isArray(cssIn) && typeof themes()?.validateCss === "function") {
    const existing = await getAllConfigs();
    const used = new Set(Object.keys(existing).filter((k) => k.startsWith(CSS_PREFIX)));
    for (const [host, css] of Object.entries(cssIn)) {
      if (!isSafeKey(host) || host.startsWith("__") || typeof css !== "string" || css === "") continue;
      const result = themes().validateCss(css);
      if (!result?.ok) continue;
      const key = CSS_PREFIX + host;
      if (!used.has(key) && used.size >= maxCssSites()) continue;
      used.add(key);
      toSet[key] = typeof result.css === "string" ? result.css : css;
      cssCount++;
    }
  }

  const total = configCount + themeCount + cssCount;
  if (total === 0) {
    throw new Error("No valid configuration entries found to import.");
  }

  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(toSet, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(total);
    });
  });
}

function writeItems(items) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(items, () => {
      if (chrome.runtime.lastError) {
        console.warn("[ForceDark] Storage set error:", chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

export function getCustomThemes() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(THEMES_KEY, (data) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      const raw = data?.[THEMES_KEY];
      if (!Array.isArray(raw)) {
        resolve([]);
        return;
      }
      const seen = new Set();
      const out = [];
      for (const entry of raw) {
        const result = themes()?.validateTheme?.(entry);
        if (!result?.ok || !result.theme.id.startsWith("user:") || seen.has(result.theme.id)) continue;
        seen.add(result.theme.id);
        out.push(result.theme);
        if (out.length >= maxThemes()) break;
      }
      resolve(out);
    });
  });
}

export async function saveCustomTheme(theme) {
  const result = themes()?.validateTheme?.(theme);
  if (!result?.ok) return { ok: false, error: result?.error || "Theme is invalid." };
  if (!result.theme.id.startsWith("user:")) {
    return { ok: false, error: "Only custom themes can be saved." };
  }
  const list = await getCustomThemes();
  const idx = list.findIndex((t) => t.id === result.theme.id);
  if (idx >= 0) {
    list[idx] = result.theme;
  } else {
    if (list.length >= maxThemes()) {
      return { ok: false, error: `You can keep up to ${maxThemes()} custom themes. Delete one first.` };
    }
    list.push(result.theme);
  }
  if (!(await writeItems({ [THEMES_KEY]: list }))) return { ok: false, error: QUOTA_MESSAGE };
  return { ok: true, theme: result.theme };
}

export async function deleteCustomTheme(id) {
  const list = await getCustomThemes();
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) return;
  await writeItems({ [THEMES_KEY]: next });
}

export function getCustomCss(host) {
  return new Promise((resolve) => {
    if (!isSafeKey(host)) {
      resolve("");
      return;
    }
    const key = CSS_PREFIX + host;
    chrome.storage.sync.get(key, (data) => {
      const value = chrome.runtime.lastError ? "" : data?.[key];
      resolve(typeof value === "string" ? value : "");
    });
  });
}

export async function setCustomCss(host, css) {
  if (!isSafeKey(host)) return { ok: false, error: "Invalid site." };
  const key = CSS_PREFIX + host;
  if (css === "" || css === undefined || css === null) {
    await new Promise((resolve) => chrome.storage.sync.remove(key, () => resolve()));
    return { ok: true };
  }
  const validate = themes()?.validateCss;
  if (typeof validate !== "function") return { ok: false, error: "Custom CSS is not available yet." };
  const result = validate(css);
  if (!result?.ok) return { ok: false, error: result?.error || "Custom CSS is invalid." };
  const all = await getAllConfigs();
  const others = Object.keys(all).filter((k) => k.startsWith(CSS_PREFIX) && k !== key);
  if (others.length >= maxCssSites()) {
    return { ok: false, error: `Custom CSS is limited to ${maxCssSites()} sites. Remove one first.` };
  }
  const value = typeof result.css === "string" ? result.css : css;
  if (!(await writeItems({ [key]: value }))) return { ok: false, error: QUOTA_MESSAGE };
  return { ok: true };
}
