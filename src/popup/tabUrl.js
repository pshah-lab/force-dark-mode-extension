// Works out which page the side panel is showing. Chrome hides a tab's address from an extension that only
// has activeTab once the user switches to a tab they did not click the icon on, so the panel then asks the
// page's own content script. No answer means a restricted page (no content script) and the panel disables itself.
(function (root) {
  // askPage(tabId) must resolve to the page's address, or reject / resolve to anything else when it has none.
  async function resolveTabUrl(tab, askPage) {
    if (!tab || typeof tab !== "object") return null;
    if (typeof tab.url === "string" && tab.url) return tab.url;
    if (typeof tab.id !== "number") return null;
    try {
      const url = await askPage(tab.id);
      return typeof url === "string" && url ? url : null;
    } catch (e) {
      return null;
    }
  }

  // Pages where the extension cannot run, even though they use https.
  function isStorePage(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return false;
    }
    if (parsed.hostname === "chromewebstore.google.com") return true;
    return parsed.hostname === "chrome.google.com" && parsed.pathname.startsWith("/webstore");
  }

  function isSameView(a, b) {
    return !!a && !!b && a.id === b.id && a.url === b.url;
  }

  const api = { resolveTabUrl, isStorePage, isSameView };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TabUrl = api;
})(typeof window !== "undefined" ? window : globalThis);
