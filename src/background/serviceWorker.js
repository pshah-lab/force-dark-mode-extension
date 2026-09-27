import { setSiteConfig, getSiteConfig, isSafeKey } from "../shared/storage.js";
import {
  DEFAULT_ENGINE,
  VALID_ENGINES,
  DEFAULT_BACKGROUND_COLOR,
  HEX_COLOR_PATTERN,
  clampFilterValue,
} from "../shared/constants.js";

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

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!msg || typeof msg !== "object" || msg.type !== "TOGGLE") return;

  handleToggleMessage(msg, sender.tab?.url);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "toggle-dark-mode") return;
  if (!isTogglableUrl(tab?.url)) return;

  handleToggleMessage({ type: "TOGGLE" }, tab.url);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "force-dark-mode-toggle",
    title: "Toggle Force Dark Mode",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "force-dark-mode-toggle") return;
  if (!isTogglableUrl(tab?.url)) return;

  handleToggleMessage({ type: "TOGGLE" }, tab.url);
});

function isTogglableUrl(url) {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "file:";
  } catch {
    return false;
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

  await setSiteConfig(host, {
    enabled: newEnabled,
    engine,
    backgroundColor,
    brightness,
    contrast,
    sepia,
  });
}
