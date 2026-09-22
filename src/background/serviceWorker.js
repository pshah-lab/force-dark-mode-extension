import { setSiteConfig, getSiteConfig, isSafeKey } from "../shared/storage.js";
import {
  DEFAULT_ENGINE,
  VALID_ENGINES,
  DEFAULT_BACKGROUND_COLOR,
  HEX_COLOR_PATTERN,
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

  handleToggleMessage(msg, sender);
});

async function handleToggleMessage(msg, sender) {
  const host =
    typeof msg.host === "string" && isSafeKey(msg.host)
      ? msg.host.trim().toLowerCase()
      : getHostFromUrl(msg.url || sender.tab?.url);

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

  await setSiteConfig(host, {
    enabled: newEnabled,
    engine,
    backgroundColor,
  });
}
