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
    ["kasi", "Kasi", "kasi.money"],
  ];

  // Evidence-backed fixes per pack id (tools/site-audit, Auto engine, WAIT=9000).
  // Packs not listed keep fixes: []. Each entry names the defect and its screenshot.
  const FIXES = {
    // Wordmark <img class="logoImage"> sits in a <picture>, which the scan skips, so it stays black on the dark header (hindustantimes-auto.png).
    hindustantimes: [{ selector: ".logoGroup img.logoImage", action: "invert-image" }],
    // Native mid-grey #main-menu bar keeps its grey while links turn blue: about 3.3:1 contrast (npr-auto-closed.png).
    npr: [{ selector: "#main-menu", action: "surface:strong" }],
    // Highlights carousel edge fade is a white linear-gradient background image left white on dark (guardian-auto-declined.png).
    // Hero section paints a white linear-gradient background-image and .home-welcome__top::after a white glow shadow; the text turned light on white (kasi-auto.png).
    kasi: [
      { selector: "section.home-welcome", action: "flatten" },
      { selector: ".home-welcome__top", action: "flatten" },
    ],
    guardian: [{ selector: 'gu-island[name="ScrollableHighlights"] [aria-roledescription="carousel"] > span > div', action: "invert-image" }],
  };

  const ACTIONS = ["invert-image", "keep-light", "surface:strong", "flatten"];
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
    const fixes = (FIXES[id] || []).map((fix) => ({ selector: fix.selector, action: fix.action }));
    return { id, name, match: match.slice(), themeId: THEME, fixes };
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

  // Canvas documents: Google Docs paints its pages and Sheets its grid on <canvas>, which both engines normally
  // keep at natural colours (a white page inside a dark UI). On these editor paths only, the engines give the
  // canvases below the page inversion instead. Site packs are host-only and pick a theme, so this is a separate,
  // path-scoped table. Slides is not listed: its editor draws with SVG, not canvas.
  // The selectors are assumptions about the Docs/Sheets DOM (no public contract); they target canvases only,
  // never the hidden text-event iframe or the DOM overlays used for typing, selection and cell editing.
  const CANVAS_DOCUMENT_HOST = "docs.google.com";
  const CANVAS_DOCUMENTS = {
    document: [".kix-page-paginated canvas", "canvas.kix-canvas-tile-content"],
    spreadsheet: ["#waffle-grid-container canvas", ".grid-container canvas"],
  };
  // /document/... or /spreadsheets/..., optionally after a Workspace /a/<domain>/ prefix.
  const CANVAS_DOCUMENT_PATH = /^\/(?:a\/[^/]+\/)?(document|spreadsheets)\//;

  // "document", "spreadsheet" or "" from a hostname and pathname (strings; anything else is "").
  function canvasDocumentKind(hostname, pathname) {
    if (typeof hostname !== "string" || typeof pathname !== "string") return "";
    let h = hostname.toLowerCase();
    if (h.endsWith(".")) h = h.slice(0, -1);
    if (h !== CANVAS_DOCUMENT_HOST) return "";
    const match = CANVAS_DOCUMENT_PATH.exec(pathname);
    if (!match) return "";
    return match[1] === "document" ? "document" : "spreadsheet";
  }

  // Google Docs / Sheets editor header widgets whose colours are intentional and must never be recoloured by the
  // CSS engine (verified against the real DOM): the "Ask Gemini" sparkle button (#docs-sidekick-button-container,
  // coloured ring lines and shapes over a transparent button) and the Share pill with its dropdown arrow half
  // (.scb-gm3.scb-container, light-blue pill with dark-blue label and sprite icon, arrow drawn with CSS borders).
  // Whole subtrees are left alone: no surface/text/border/image marks. Only applied when canvasDocumentKind() is
  // "document" or "spreadsheet". Add more selectors here (must pass SELECTOR_PATTERN).
  const DOCS_UI_KEEP_ORIGINAL = ["#docs-sidekick-button-container", ".scb-gm3.scb-container"];

  // Fresh copy of the keep-original selectors for a Docs/Sheets kind, [] for anything else.
  function docsUiKeepOriginalSelectors(kind) {
    return Object.prototype.hasOwnProperty.call(CANVAS_DOCUMENTS, kind) ? DOCS_UI_KEEP_ORIGINAL.slice() : [];
  }

  function isCanvasDocumentSite(loc) {
    return Boolean(loc && canvasDocumentKind(loc.hostname, loc.pathname));
  }

  // Fresh copy, [] for an unknown kind.
  function canvasDocumentSelectors(kind) {
    return Object.prototype.hasOwnProperty.call(CANVAS_DOCUMENTS, kind) ? CANVAS_DOCUMENTS[kind].slice() : [];
  }

  global.ForceDarkThemes = Object.assign(global.ForceDarkThemes || {}, {
    findSitePack,
    validateFix,
    getSitePacks,
    canvasDocumentKind,
    isCanvasDocumentSite,
    canvasDocumentSelectors,
    docsUiKeepOriginalSelectors,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
