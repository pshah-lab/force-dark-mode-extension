// Decides when the side panel must re-render. A popup is rebuilt every time it opens; a side panel
// stays open, so it follows the active tab instead.
(function (root) {
  // event: { kind: "activated" | "updated" | "focus", tabId?: number, changeInfo?: object }
  function shouldRefresh(event, activeTabId) {
    if (!event || typeof event !== "object") return false;
    if (event.kind === "activated" || event.kind === "focus") return true;
    if (event.kind !== "updated") return false;
    if (typeof activeTabId !== "number" || event.tabId !== activeTabId) return false;
    const info = event.changeInfo;
    if (!info || typeof info !== "object") return false;
    return typeof info.url === "string" || info.status === "complete";
  }

  const api = { shouldRefresh };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PanelTabEvents = api;
})(typeof window !== "undefined" ? window : globalThis);
