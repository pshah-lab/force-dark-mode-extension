(function (global) {
  const THEME = "builtin:midnight";
  // [id, name, hosts...]. Hosts are bare lowercase hostnames matched as exact or parent domain.
  const TABLE = [
    ["bbc", "BBC", "bbc.com", "bbc.co.uk"],
    ["cnn", "CNN", "cnn.com"],
    ["forbes", "Forbes", "forbes.com"],
    ["npr", "NPR", "npr.org"],
    ["guardian", "The Guardian", "theguardian.com"],
    ["nytimes", "The New York Times", "nytimes.com"],
    ["reuters", "Reuters", "reuters.com"],
    ["aljazeera", "Al Jazeera", "aljazeera.com"],
    ["dailymail", "Daily Mail", "dailymail.co.uk", "dailymail.com"],
    ["hindustantimes", "Hindustan Times", "hindustantimes.com"],
    ["indianexpress", "The Indian Express", "indianexpress.com"],
    ["ndtv", "NDTV", "ndtv.com"],
    ["globo", "Globo", "globo.com"],
    ["medium", "Medium", "medium.com"],
    ["substack", "Substack", "substack.com"],
    ["wikipedia", "Wikipedia", "wikipedia.org"],
    ["github", "GitHub", "github.com"],
    ["mdn", "MDN Web Docs", "developer.mozilla.org"],
    ["reddit", "Reddit", "reddit.com"],
    ["hackernews", "Hacker News", "news.ycombinator.com"],
  ];

  const ACTIONS = ["invert-image", "keep-light", "surface:strong"];
  const SELECTOR_PATTERN = /^[A-Za-z0-9_\-#.\[\]="':>*,()~+^$| ]+$/;
  const MAX_SELECTOR = 200;

  function validateFix(fix) {
    if (!fix || typeof fix !== "object") return false;
    if (!ACTIONS.includes(fix.action)) return false;
    const s = fix.selector;
    return typeof s === "string" && s.length > 0 && s.length <= MAX_SELECTOR && SELECTOR_PATTERN.test(s);
  }

  function build(row) {
    const [id, name, ...match] = row;
    return { id, name, match: match.slice(), themeId: THEME, fixes: [] };
  }

  // Fresh copies on every call so callers can never alter the shared table.
  function getSitePacks() {
    return TABLE.map(build);
  }

  // Plain string comparison only: exact host or a real subdomain. No patterns built from data.
  function findSitePack(host) {
    if (typeof host !== "string") return null;
    let h = host.toLowerCase();
    if (h.endsWith(".")) h = h.slice(0, -1);
    if (!h || h.startsWith(".") || h.includes("..")) return null;
    for (const row of TABLE) {
      for (let i = 2; i < row.length; i++) {
        const m = row[i];
        if (h === m || h.endsWith("." + m)) return build(row);
      }
    }
    return null;
  }

  global.ForceDarkThemes = Object.assign(global.ForceDarkThemes || {}, {
    findSitePack,
    validateFix,
    getSitePacks,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
