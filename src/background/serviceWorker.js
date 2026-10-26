import { setSiteConfig, getSiteConfig, isSafeKey } from "../shared/storage.js";
import {
  DEFAULT_ENGINE,
  VALID_ENGINES,
  DEFAULT_BACKGROUND_COLOR,
  HEX_COLOR_PATTERN,
  clampFilterValue,
  THEME_ID_PATTERN,
  mediaFieldsFor,
  nativeDarkFieldsFor,
  imageDimFieldsFor,
} from "../shared/constants.js";
import { postJson } from "./network.js";
import { createUsage } from "./usageSender.js";
import { handleUsageMessage } from "./usageMessages.js";
import { createReportSender } from "./siteReportSender.js";
import { buildWelcomeState, WELCOME_KEY } from "./welcomeState.js";

// The optional usage report: nothing exists or is sent until the user turns it on (side panel card or Options).
// People who opted in on 2.0.x are asked to confirm once; until then nothing is sent. Pending deletes (from turning
// it off while offline) are retried on every worker start.
const usage = createUsage({
  storage: {
    get: async (key) => (await chrome.storage.local.get(key))[key],
    set: (key, value) => chrome.storage.local.set({ [key]: value }),
    remove: (key) => chrome.storage.local.remove(key),
  },
  post: postJson,
  now: () => new Date(),
  version: chrome.runtime.getManifest().version,
});
usage.retryPendingDelete().catch(() => {});

// The toolbar icon opens the side panel (there is no popup). Runs on every worker start.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// A broken-site report is sent only when the user confirms it in the side panel. The sender validates
// everything again and remembers only which sites were reported today.
const reportSender = createReportSender({
  storage: {
    get: async (key) => (await chrome.storage.local.get(key))[key],
    set: (key, value) => chrome.storage.local.set({ [key]: value }),
  },
  post: postJson,
  now: () => new Date(),
  version: chrome.runtime.getManifest().version,
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
  const usageReply = handleUsageMessage(usage, msg, sender, chrome.runtime.getURL(""));
  if (usageReply) {
    usageReply.then(sendResponse);
    return true;
  }
  if (msg && typeof msg === "object" && msg.type === "SITE_REPORT") {
    if (sender.tab) return;
    reportSender.send(msg).then(sendResponse);
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

chrome.runtime.onInstalled.addListener((details) => {
  // A one-time card in the side panel: best features for new installs, what is new for updates.
  const welcome = buildWelcomeState(details, chrome.runtime.getManifest().version);
  if (welcome) chrome.storage.local.set({ [WELCOME_KEY]: welcome }).catch(() => {});

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
  // Invert's photos & media setting: kept across every toggle; a missing field means "on".
  Object.assign(nextConfig, mediaFieldsFor(msg, currentConfig));
  // Natively dark pages: respect (missing) or theme anyway; kept across every toggle.
  Object.assign(nextConfig, nativeDarkFieldsFor(msg, currentConfig));
  // CSS engine image dimming override (0-60); missing means the theme's value. Kept across every toggle.
  Object.assign(nextConfig, imageDimFieldsFor(msg, currentConfig));

  await setSiteConfig(host, nextConfig);
}
