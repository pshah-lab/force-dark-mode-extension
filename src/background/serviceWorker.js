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
    // "frame": a right-click inside an embedded PDF frame passes that frame's address (info.frameUrl).
    contexts: ["page", "frame"],
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
    openCurrentDocumentInViewer(tab, info.frameUrl);
  }
});

function toggleForTab(tab) {
  if (!isTogglableUrl(tab?.url)) return;
  handleToggleMessage({ type: "TOGGLE" }, tab.url);
}

function openFileViewer() {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/viewer/viewer.html") });
}

// Opens the viewer only on the user's command (shortcut or context menu), never on its own. A .pdf address is
// decided at once, as before. Otherwise the tab's top frame is asked what PDF it shows: Chrome's built-in viewer
// (document.contentType) or exactly one embedded PDF. No per-tab state is kept, so a worker restart loses nothing.
// The PDF address is used only to open the local viewer tab.
async function openCurrentDocumentInViewer(tab, frameUrl) {
  if (!tab?.url) return;
  if (isPdfUrl(tab.url)) {
    openPdfInViewer(tab.url, getNameFromUrl(tab.url) || "PDF document");
    return;
  }
  if (typeof frameUrl === "string" && isPdfUrl(frameUrl) && readOpenableUrl(frameUrl)) {
    openPdfInViewer(frameUrl, getNameFromUrl(frameUrl) || "PDF document");
    return;
  }
  if (!isTogglableUrl(tab.url) || typeof tab.id !== "number") return;
  const info = await askPageForPdf(tab.id);
  if (info) openPdfInViewer(info.url, pdfDocumentName(info.url, info.title));
}

function openPdfInViewer(src, name) {
  const viewerUrl = new URL(chrome.runtime.getURL("src/viewer/viewer.html"));
  viewerUrl.searchParams.set("src", src);
  viewerUrl.searchParams.set("name", name);
  chrome.tabs.create({ url: viewerUrl.href });
}

// Only the top frame answers (frameId 0). No content script (restricted page) or no PDF resolves to null.
function askPageForPdf(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: "PDF_INFO" }, { frameId: 0 }, (reply) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(readPdfInfoReply(reply));
      });
    } catch {
      resolve(null);
    }
  });
}

const MAX_PDF_URL_LENGTH = 4096;
const MAX_PDF_NAME_LENGTH = 120;
const OPENABLE_PDF_PROTOCOLS = new Set(["http:", "https:", "file:"]);

function readOpenableUrl(value) {
  if (typeof value !== "string" || !value || value.length > MAX_PDF_URL_LENGTH) return "";
  try {
    const url = new URL(value);
    return OPENABLE_PDF_PROTOCOLS.has(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function readPdfInfoReply(reply) {
  if (!reply || typeof reply !== "object" || reply.type !== "PDF_INFO") return null;
  const url = readOpenableUrl(reply.url);
  if (!url) return null;
  const title = typeof reply.title === "string" ? reply.title : "";
  return { url, title };
}

// A ".pdf" file name in the path wins, then the page title, then the last path segment.
export function pdfDocumentName(urlString, title) {
  const segment = getNameFromUrl(urlString);
  if (segment && segment.toLowerCase().endsWith(".pdf")) return segment.slice(0, MAX_PDF_NAME_LENGTH);
  const cleanTitle = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  return (cleanTitle || segment || "PDF document").slice(0, MAX_PDF_NAME_LENGTH);
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

export function isPdfUrl(urlString) {
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
