import { setSiteConfig, getSiteConfig, isSafeKey } from "../shared/storage.js";
import {
  DEFAULT_ENGINE,
  VALID_ENGINES,
  DEFAULT_BACKGROUND_COLOR,
  HEX_COLOR_PATTERN,
  clampFilterValue,
  THEME_ID_PATTERN,
} from "../shared/constants.js";
import { createTelemetry, handleTelemetryMessage } from "./telemetrySender.js";

const telemetry = createTelemetry({
  storage: {
    get: async (key) => (await chrome.storage.local.get(key))[key],
    set: (key, value) => chrome.storage.local.set({ [key]: value }),
    remove: (key) => chrome.storage.local.remove(key),
  },
  now: () => new Date(),
  version: chrome.runtime.getManifest().version,
  env: () => ({ userAgent: navigator.userAgent, lang: chrome.i18n.getUILanguage() }),
});

function getHostFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "file:") {
      return "local_files";
    }
    return parsedUrl.hostname;
  } catch {
    return "";
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  const telemetryReply = handleTelemetryMessage(telemetry, msg);
  if (telemetryReply) {
    telemetryReply.then(sendResponse);
    return true;
  }
  if (!msg || typeof msg !== "object" || msg.type !== "TOGGLE") return;

  handleToggleMessage(msg, sender.tab?.url);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-dark-mode") {
    toggleForTab(tab);
    return;
  }

  if (command === "open-file-viewer") {
    openFileViewer();
    return;
  }

  if (command === "open-current-document-in-viewer") {
    openCurrentDocumentInViewer(tab);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "force-dark-mode-toggle",
    title: "Toggle Force Dark Mode",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "force-dark-mode-open-viewer",
    title: "Open Dark Document Viewer",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "force-dark-mode-open-current-document",
    title: "Open This PDF in Dark Viewer",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "force-dark-mode-toggle") {
    toggleForTab(tab);
    return;
  }

  if (info.menuItemId === "force-dark-mode-open-viewer") {
    openFileViewer();
    return;
  }

  if (info.menuItemId === "force-dark-mode-open-current-document") {
    openCurrentDocumentInViewer(tab);
  }
});

function toggleForTab(tab) {
  if (!isTogglableUrl(tab?.url)) return;
  handleToggleMessage({ type: "TOGGLE" }, tab.url);
}

function openFileViewer() {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/viewer/viewer.html") });
}

function openCurrentDocumentInViewer(tab) {
  if (!tab?.url || !isPdfUrl(tab.url)) return;

  const viewerUrl = new URL(chrome.runtime.getURL("src/viewer/viewer.html"));
  viewerUrl.searchParams.set("src", tab.url);
  viewerUrl.searchParams.set("name", getNameFromUrl(tab.url) || "PDF document");
  chrome.tabs.create({ url: viewerUrl.href });
}

function isTogglableUrl(url) {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "file:";
  } catch {
    return false;
  }
}

function isPdfUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.pathname.toLowerCase().endsWith(".pdf") || url.search.toLowerCase().includes(".pdf");
  } catch {
    return false;
  }
}

function getNameFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const name = url.pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : "";
  } catch {
    return "";
  }
}

async function handleToggleMessage(msg, tabUrl) {
  const host =
    typeof msg.host === "string" && isSafeKey(msg.host)
      ? msg.host.trim().toLowerCase()
      : getHostFromUrl(msg.url || tabUrl);

  if (!host || !isSafeKey(host)) return;

  const currentConfig = await getSiteConfig(host);
  const newEnabled =
    typeof msg.forceEnabled === "boolean"
      ? msg.forceEnabled
      : !currentConfig?.enabled;

  const requestedEngine = msg.engine || currentConfig?.engine || DEFAULT_ENGINE;
  const engine = VALID_ENGINES.has(requestedEngine)
    ? requestedEngine
    : DEFAULT_ENGINE;
  const requestedBackgroundColor =
    msg.backgroundColor || currentConfig?.backgroundColor || DEFAULT_BACKGROUND_COLOR;
  const backgroundColor = HEX_COLOR_PATTERN.test(requestedBackgroundColor)
    ? requestedBackgroundColor
    : DEFAULT_BACKGROUND_COLOR;

  const brightness = clampFilterValue(
    "brightness",
    msg.brightness ?? currentConfig?.brightness
  );
  const contrast = clampFilterValue(
    "contrast",
    msg.contrast ?? currentConfig?.contrast
  );
  const sepia = clampFilterValue("sepia", msg.sepia ?? currentConfig?.sepia);

  const themeId =
    typeof msg.themeId === "string" &&
    (msg.themeId === "" || msg.themeId === "default" || THEME_ID_PATTERN.test(msg.themeId))
      ? msg.themeId
      : currentConfig?.themeId;

  const nextConfig = {
    enabled: newEnabled,
    engine,
    backgroundColor,
    brightness,
    contrast,
    sepia,
  };
  if (typeof themeId === "string") nextConfig.themeId = themeId;

  await setSiteConfig(host, nextConfig);
}
