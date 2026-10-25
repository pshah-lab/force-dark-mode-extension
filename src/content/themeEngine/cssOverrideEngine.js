const STYLE_ID = "__force_dark_mode__";
const CUSTOM_CSS_STYLE_ID = "__force_dark_custom_css__";
const ENGINE_STYLE_IDS = [STYLE_ID, "__force_dark_invert__"];
const ROOT_MODE_ATTR = "data-force-dark-mode";
const SURFACE_ATTR = "data-force-dark-surface";
const TEXT_ATTR = "data-force-dark-text";
const BORDER_ATTR = "data-force-dark-border";
const IMAGE_ATTR = "data-force-dark-image";
const KEEP_ATTR = "data-force-dark-keep";
const MAX_PACK_FIXES = 50;
const IMAGE_BRIGHTNESS_PROPERTY = "--force-dark-image-brightness";
// Set on the root only while a theme dims images, so undimmed images keep filter: none.
// The dimming rule matches img and video, never picture (its img is already dimmed).
const IMAGE_DIM_ATTR = "data-force-dark-image-dim";
const CUSTOM_PROPERTIES = [
  "--force-dark-bg",
  "--force-dark-surface",
  "--force-dark-surface-soft",
  "--force-dark-elevated",
  "--force-dark-text",
  "--force-dark-muted",
  "--force-dark-border",
  "--force-dark-link",
  "--force-dark-input",
  "--force-dark-selection",
  IMAGE_BRIGHTNESS_PROPERTY,
];
const EXCLUDED_SELECTOR = [
  "area",
  "audio",
  "br",
  "canvas",
  "embed",
  "iframe",
  "link",
  "map",
  "meta",
  "noscript",
  "object",
  "picture",
  "script",
  "source",
  "style",
  "template",
  "track",
  "video",
].join(",");

const STYLESHEET_RESCAN_DELAY_MS = 150;
// CSS-in-JS libraries add rules through the stylesheet API after hydration, which
// fires no DOM event; a few bounded checks after load catch the colours they set.
// Each check rescans only if the document grew since the last full scan (element
// count, stylesheet count or CSSOM rule count changed); the last one runs only if
// an earlier check found growth.
const LATE_RESCAN_DELAYS_MS = [800, 2500, 6000];

// Scans run in slices: the first in an animation frame, the rest in idle callbacks
// (setTimeout fallback). A slice classifies at most SCAN_SLICE_MAX elements and stops
// early once its time budget is spent (checked after SCAN_SLICE_MIN elements).
const SCAN_SLICE_MAX = 300;
const SCAN_SLICE_MIN = 50;
const SCAN_SLICE_BUDGET_MS = 8;
const SCAN_IDLE_TIMEOUT_MS = 100;
const SCAN_TIMEOUT_FALLBACK_MS = 16;
// An attribute-only change rescans the element plus this many nearest descendants.
const ATTR_RESCAN_DESCENDANTS = 100;
const SCAN_FULL = 3;
const SCAN_SUBTREE = 2;
const SCAN_SHALLOW = 1;

let darkModeObserver = null;
let styleRescanTimer = 0;
let lateRescanTimers = [];
let lateRescanFoundGrowth = false;
let scanFrame = 0;
let scanContinuation = 0;
let scanContinuationKind = "";
// Requested roots (element -> SCAN_* mode), coalesced when the next slice starts.
let pendingScanRoots = new Map();
// Elements waiting to be classified, in document order, and the same set for dedupe.
let scanQueue = [];
let scanQueueIndex = 0;
let scanQueued = new Set();
let scanMarks = null;
// Elements classified at least once (used to ignore no-op attribute mutations).
let scanClassified = new WeakSet();
let lastFullScanSignature = "";
// Site pack fixes: validated {selector, action} entries, re-applied on every scan.
let packFixes = [];
let packFixMarks = { invert: new Set(), surface: new Set(), keep: new Set() };

function getColorUtils() {
  return window.ForceDarkColorUtils || {};
}

// Google Docs / Sheets canvas documents (path-scoped, see canvasDocumentKind in sitePacks.js): the root gets this
// attribute with the kind, and the page/grid canvases then get the Invert engine's page inversion (no re-invert),
// so the white paper turns dark and text light. Every other canvas keeps filter: none.
const CANVAS_DOC_ATTR = "data-force-dark-canvas-doc";
const CANVAS_DOC_KINDS = ["document", "spreadsheet"];
const CANVAS_DOC_FILTER = "invert(0.92) hue-rotate(180deg)"; // = invertEngine's PAGE_INVERT_AMOUNT page step

function canvasDocumentCss() {
  const themes = window.ForceDarkThemes;
  if (!themes || typeof themes.canvasDocumentSelectors !== "function") return "";
  return CANVAS_DOC_KINDS.map((kind) => {
    const selectors = themes.canvasDocumentSelectors(kind);
    if (!selectors.length) return "";
    return `
    :root[${ROOT_MODE_ATTR}="css"][${CANVAS_DOC_ATTR}="${kind}"] :is(${selectors.join(", ")}) {
      filter: ${CANVAS_DOC_FILTER} !important;
    }
`;
  }).join("");
}

function markCanvasDocument(kind) {
  if (CANVAS_DOC_KINDS.includes(kind)) {
    document.documentElement.setAttribute(CANVAS_DOC_ATTR, kind);
  } else {
    document.documentElement.removeAttribute(CANVAS_DOC_ATTR);
  }
}

function enableDarkMode(config = {}) {
  applyCustomPalette(config);
  applyPackFixes(config && config.fixes);
  markCanvasDocument(config && config.canvasDocument);

  if (document.getElementById(STYLE_ID)) {
    scheduleScan(document.documentElement);
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :root[${ROOT_MODE_ATTR}="css"] {
      color-scheme: dark !important;
      --force-dark-bg: #0f1115;
      --force-dark-surface: #171a20;
      --force-dark-surface-soft: #1d222a;
      --force-dark-elevated: #242a33;
      --force-dark-text: #e8eaed;
      --force-dark-muted: #b8bec7;
      --force-dark-border: #343b46;
      --force-dark-link: #8ab4f8;
      --force-dark-input: #151922;
      --force-dark-selection: #34517d;
    }

    :root[${ROOT_MODE_ATTR}="css"],
    :root[${ROOT_MODE_ATTR}="css"] body {
      color: var(--force-dark-text) !important;
    }

    /* A transparent child frame (marked by the content script) keeps showing its embedding page. */
    :root[${ROOT_MODE_ATTR}="css"]:not([data-force-dark-frame="transparent"]),
    :root[${ROOT_MODE_ATTR}="css"]:not([data-force-dark-frame="transparent"]) body {
      background-color: var(--force-dark-bg) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] [${SURFACE_ATTR}="strong"] {
      background-color: var(--force-dark-surface) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] [${SURFACE_ATTR}="soft"] {
      background-color: var(--force-dark-surface-soft) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(dialog, [popover], [role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"]) {
      background-color: var(--force-dark-elevated) !important;
      color: var(--force-dark-text) !important;
      border-color: var(--force-dark-border) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] [${TEXT_ATTR}="true"] {
      color: var(--force-dark-text) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(p, li, td, th, span, dt, dd) > :is(a, [role="link"]):not([${KEEP_ATTR}], [${KEEP_ATTR}] *),
    :root[${ROOT_MODE_ATTR}="css"] :is(a, [role="link"]):not(:has(div, p, span, h1, h2, h3, h4, h5, h6)):not([${KEEP_ATTR}], [${KEEP_ATTR}] *) {
      color: var(--force-dark-link) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] [${BORDER_ATTR}="true"],
    :root[${ROOT_MODE_ATTR}="css"] :is(table, thead, tbody, tfoot, tr, td, th, hr) {
      border-color: var(--force-dark-border) !important;
      outline-color: var(--force-dark-border) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(button, input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]):not([type="file"]), textarea, select, option, optgroup):not([${KEEP_ATTR}], [${KEEP_ATTR}] *) {
      background-color: var(--force-dark-input) !important;
      color: var(--force-dark-text) !important;
      border-color: var(--force-dark-border) !important;
      caret-color: var(--force-dark-text) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(input, textarea)::placeholder {
      color: var(--force-dark-muted) !important;
      opacity: 1 !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(code, pre, kbd, samp):not([${KEEP_ATTR}], [${KEEP_ATTR}] *) {
      background-color: var(--force-dark-elevated) !important;
      color: var(--force-dark-text) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] ::selection {
      background-color: var(--force-dark-selection) !important;
      color: #ffffff !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(img, picture, video, canvas, iframe, embed, object, svg) {
      filter: none !important;
      background-color: transparent !important;
    }

    :root[${ROOT_MODE_ATTR}="css"][${IMAGE_DIM_ATTR}] :is(img, video):not([${IMAGE_ATTR}="invert"]) {
      filter: brightness(var(--force-dark-image-brightness, 100%)) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] [${IMAGE_ATTR}="invert"] {
      filter: invert(0.9) hue-rotate(180deg) !important;
    }
${canvasDocumentCss()}
    :root[${ROOT_MODE_ATTR}="css"] [${KEEP_ATTR}] {
      background-color: #ffffff !important;
      color: #111111 !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] [${KEEP_ATTR}] * {
      color: inherit !important;
    }

    /* keep-light subtrees are exempt from the link, control and code rules above
       (their :not guards); links get a readable colour for the white panel. */
    :root[${ROOT_MODE_ATTR}="css"] [${KEEP_ATTR}] :is(a, [role="link"]) {
      color: #0b57d0 !important;
    }

    :root[${ROOT_MODE_ATTR}="css"][data-force-dark-filter="true"] {
      filter: brightness(var(--force-dark-brightness, 100%)) contrast(var(--force-dark-contrast, 100%)) sepia(var(--force-dark-sepia, 0%)) !important;
    }
  `;

  const target = document.head || document.documentElement;
  target.appendChild(style);
  document.documentElement.setAttribute(ROOT_MODE_ATTR, "css");

  observePageChanges();
  scheduleScan(document.documentElement);
}

// Sites often attach their stylesheets after the first scan. Computed colours
// change without any DOM mutation on the affected elements, so a late stylesheet
// must trigger a full, debounced rescan or light panels stay white.
function isSiteStylesheet(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE || node.id === STYLE_ID) return false;
  const tag = node.tagName.toLowerCase();
  if (tag === "style") return true;
  return tag === "link" && /\bstylesheet\b/i.test(node.getAttribute("rel") || "");
}

function scheduleFullRescan() {
  if (styleRescanTimer) clearTimeout(styleRescanTimer);
  styleRescanTimer = setTimeout(() => {
    styleRescanTimer = 0;
    scheduleScan(document.documentElement);
  }, STYLESHEET_RESCAN_DELAY_MS);
}

function clearLateRescans() {
  lateRescanTimers.forEach((id) => clearTimeout(id));
  lateRescanTimers = [];
}

function scheduleLateRescans() {
  clearLateRescans();
  scheduleFullRescan();
  lateRescanFoundGrowth = false;
  lateRescanTimers = LATE_RESCAN_DELAYS_MS.map((delay, index) =>
    setTimeout(() => runLateRescanCheck(index), delay)
  );
}

function runLateRescanCheck(index) {
  const lastIndex = LATE_RESCAN_DELAYS_MS.length - 1;
  if (index === lastIndex && !lateRescanFoundGrowth) return;
  if (documentGrowthSignature() !== lastFullScanSignature) {
    lateRescanFoundGrowth = true;
    scheduleScan(document.documentElement);
  } else if (index === lastIndex - 1 && !lateRescanFoundGrowth) {
    // Settled through every earlier check: the last rescan is not needed.
    clearTimeout(lateRescanTimers[lastIndex]);
  }
}

// Cheap measure of whether the page is still changing: element count (a live
// collection's length), stylesheet count and CSSOM rule count (insertRule adds
// rules without any DOM mutation). Cross-origin sheets throw on cssRules: skipped.
function documentGrowthSignature() {
  let elements = 0;
  try {
    elements = typeof document.getElementsByTagName === "function"
      ? document.getElementsByTagName("*").length
      : document.querySelectorAll("*").length;
  } catch (error) {
    elements = 0;
  }
  let sheetCount = 0;
  let rules = 0;
  const sheets = document.styleSheets;
  if (sheets && typeof sheets.length === "number") {
    sheetCount = sheets.length;
    for (let i = 0; i < sheets.length; i++) {
      try {
        const list = sheets[i] && sheets[i].cssRules;
        rules += list ? list.length : 0;
      } catch (error) {
        // cross-origin stylesheet
      }
    }
  }
  return `${elements}:${sheetCount}:${rules}`;
}

function onResourceLoad(event) {
  if (isSiteStylesheet(event.target)) scheduleFullRescan();
}

// The user's per-site CSS. It is validated again here, right before it reaches the page,
// so CSS tampered into storage is never injected; no validator or a failed check means
// nothing is injected. It goes after the active engine's style element (same parent) so
// it wins on equal specificity, and is written with textContent only. Never throws.
function applyCustomCss(css) {
  try {
    removeCustomCss();
    if (typeof css !== "string" || css === "") return;
    const validate = window.ForceDarkThemes && window.ForceDarkThemes.validateCss;
    if (typeof validate !== "function") return;
    const result = validate(css);
    if (!result || result.ok !== true || typeof result.css !== "string" || result.css === "") return;

    const style = document.createElement("style");
    style.id = CUSTOM_CSS_STYLE_ID;
    style.textContent = result.css;
    const anchor = ENGINE_STYLE_IDS.map((id) => document.getElementById(id)).find(Boolean);
    const parent = (anchor && (anchor.parentElement || anchor.parentNode)) || document.head || document.documentElement;
    parent.appendChild(style);
  } catch (error) {
    try { removeCustomCss(); } catch (ignored) { /* never throw into the page */ }
  }
}

function removeCustomCss() {
  document.getElementById(CUSTOM_CSS_STYLE_ID)?.remove();
}

function hasActiveEngineStyle() {
  return ENGINE_STYLE_IDS.some((id) => document.getElementById(id));
}

function disableDarkMode() {
  removeCustomCss();
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.removeAttribute(ROOT_MODE_ATTR);
  document.documentElement.removeAttribute(CANVAS_DOC_ATTR);
  clearCustomPalette();

  if (darkModeObserver) {
    darkModeObserver.disconnect();
    darkModeObserver = null;
  }

  document.removeEventListener("load", onResourceLoad, true);
  document.removeEventListener("DOMContentLoaded", scheduleFullRescan);
  window.removeEventListener("load", scheduleLateRescans);
  clearLateRescans();
  if (styleRescanTimer) {
    clearTimeout(styleRescanTimer);
    styleRescanTimer = 0;
  }

  if (scanFrame) {
    cancelAnimationFrame(scanFrame);
    scanFrame = 0;
  }
  cancelScanContinuation();

  pendingScanRoots.clear();
  resetScanQueue();
  scanClassified = new WeakSet();
  lastFullScanSignature = "";
  clearPackFixes();
  clearDarkAttributes(document.documentElement);
}

function observePageChanges() {
  if (darkModeObserver) return;

  darkModeObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        if (!attributeMutationMatters(record)) continue;
        const target = record.target;
        // html/body class or style changes (site theme toggles) can restyle the whole page.
        if (target === document.documentElement || target === document.body) {
          scheduleScan(target);
        } else {
          scheduleScan(target, SCAN_SHALLOW);
        }
        continue;
      }

      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (isSiteStylesheet(node)) scheduleFullRescan();
          scheduleScan(node);
        }
      });
    }
  });

  darkModeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "bgcolor", "color"],
    attributeOldValue: true,
    childList: true,
    subtree: true,
  });

  document.addEventListener("load", onResourceLoad, true);
  document.addEventListener("DOMContentLoaded", scheduleFullRescan);
  window.addEventListener("load", scheduleLateRescans);
  if (document.readyState === "complete") scheduleLateRescans();
}

// Our own markers are never observed (attributeFilter), and are skipped here too. A
// style change that only touches our --force-dark-* custom properties, or any change
// that leaves an already classified element's attribute as it was, cannot change
// its colours, so it schedules nothing.
function attributeMutationMatters(record) {
  const attr = record.attributeName || "";
  if (attr.startsWith("data-force-dark")) return false;
  const target = record.target;
  if (!target || target.nodeType !== Node.ELEMENT_NODE) return false;
  if (typeof target.getAttribute !== "function" || record.oldValue === undefined) return true;
  const current = target.getAttribute(attr);
  if (attr === "style" && withoutOwnStyle(record.oldValue) === withoutOwnStyle(current)) return false;
  return !(scanClassified.has(target) && record.oldValue === current);
}

function withoutOwnStyle(value) {
  return String(value || "")
    .replace(/--force-dark-[\w-]*\s*:[^;]*;?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Queues a scan of `root`. The default mode scans its whole subtree (the document
// element always means a full scan); SCAN_SHALLOW scans the element plus a bounded
// set of its nearest descendants. Roots are coalesced when the next slice starts.
function scheduleScan(root, mode = SCAN_SUBTREE) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return;

  const effective = root === document.documentElement ? SCAN_FULL : mode;
  if ((pendingScanRoots.get(root) || 0) < effective) pendingScanRoots.set(root, effective);
  if (scanFrame || scanContinuation) return;

  scanFrame = requestAnimationFrame(runScanSlice);
}

function scheduleScanContinuation() {
  if (scanContinuation) return;
  if (typeof requestIdleCallback === "function") {
    scanContinuationKind = "idle";
    scanContinuation = requestIdleCallback(runScanSlice, { timeout: SCAN_IDLE_TIMEOUT_MS });
    return;
  }
  // A synchronous timer (test doubles) would run the slice before the id is stored.
  let ran = false;
  const id = setTimeout(() => { ran = true; runScanSlice(); }, SCAN_TIMEOUT_FALLBACK_MS);
  if (!ran) {
    scanContinuationKind = "timeout";
    scanContinuation = id;
  }
}

function cancelScanContinuation() {
  if (!scanContinuation) return;
  if (scanContinuationKind === "idle" && typeof cancelIdleCallback === "function") {
    cancelIdleCallback(scanContinuation);
  } else if (scanContinuationKind === "timeout") {
    clearTimeout(scanContinuation);
  }
  scanContinuation = 0;
  scanContinuationKind = "";
}

function resetScanQueue() {
  scanQueue = [];
  scanQueueIndex = 0;
  scanQueued = new Set();
  scanMarks = null;
}

function enqueueForScan(element) {
  if (scanQueued.has(element)) return;
  scanQueued.add(element);
  scanQueue.push(element);
}

function isInsideAny(element, roots) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const mode = roots.get(node);
    if (mode === SCAN_SUBTREE || mode === SCAN_FULL) return true;
  }
  return false;
}

// Breadth-first: the element's nearest descendants, at most `limit` of them.
function boundedDescendants(root, limit) {
  const out = [];
  const queue = [root];
  for (let i = 0; i < queue.length && out.length < limit; i++) {
    const children = queue[i].children || [];
    for (let c = 0; c < children.length && out.length < limit; c++) {
      out.push(children[c]);
      queue.push(children[c]);
    }
  }
  return out;
}

// Moves requested roots into the scan queue. A full scan restarts the queue (every
// element is re-read); a root inside another queued subtree root is dropped.
function drainPendingScanRoots() {
  if (!pendingScanRoots.size) return;
  const roots = pendingScanRoots;
  pendingScanRoots = new Map();

  const full = Array.from(roots.keys()).find((root) => roots.get(root) === SCAN_FULL);
  if (full) {
    resetScanQueue();
    lastFullScanSignature = documentGrowthSignature();
    enqueueForScan(full);
    full.querySelectorAll("*").forEach(enqueueForScan);
  } else {
    roots.forEach((mode, root) => {
      if (isInsideAny(root, roots)) return;
      enqueueForScan(root);
      if (mode === SCAN_SHALLOW) {
        boundedDescendants(root, ATTR_RESCAN_DESCENDANTS).forEach(enqueueForScan);
      } else {
        root.querySelectorAll("*").forEach(enqueueForScan);
      }
    });
  }

  // Pack fixes are re-applied on every scan batch so late-added matches are caught.
  scanMarks = markPackFixes();
}

function scanNow() {
  return typeof performance !== "undefined" && performance && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function runScanSlice(deadline) {
  scanFrame = 0;
  scanContinuation = 0;
  scanContinuationKind = "";

  drainPendingScanRoots();
  if (scanQueueIndex >= scanQueue.length) {
    resetScanQueue();
    return;
  }

  const { parseCssColor, getLuminance } = getColorUtils();
  if (!parseCssColor || !getLuminance) {
    resetScanQueue();
    return;
  }

  const idleBudget = deadline && !deadline.didTimeout && typeof deadline.timeRemaining === "function"
    ? Math.max(1, Math.min(deadline.timeRemaining(), SCAN_SLICE_BUDGET_MS))
    : SCAN_SLICE_BUDGET_MS;
  const sliceEnd = scanNow() + idleBudget;
  const marks = scanMarks || markPackFixes();

  // READ PASS: Gather styles without mutating DOM to prevent forced reflows
  const updates = [];
  const settleRoots = [];
  while (scanQueueIndex < scanQueue.length) {
    if (updates.length >= SCAN_SLICE_MAX) break;
    if (updates.length >= SCAN_SLICE_MIN && scanNow() >= sliceEnd) break;
    const element = scanQueue[scanQueueIndex++];
    scanQueued.delete(element);
    const update = classifyElement(element, marks, settleRoots, parseCssColor, getLuminance);
    if (update) updates.push(update);
  }

  // WRITE PASS: Apply this slice's attribute updates in a single batch
  updates.forEach(applyScanUpdate);

  if (scanQueueIndex >= scanQueue.length) resetScanQueue();

  // One follow-up scan per newly text-marked svg whose shapes only matched the text
  // colour. It runs once: the svg then carries the text marker, so it is not re-queued.
  settleRoots.forEach((svg) => scheduleScan(svg));

  // Remaining work continues in the next slice, unless a follow-up above already claimed a frame.
  if ((scanQueueIndex < scanQueue.length || pendingScanRoots.size) && !scanFrame) {
    scheduleScanContinuation();
  }
}

function classifyElement(element, marks, settleRoots, parseCssColor, getLuminance) {
  if (!(element instanceof Element) || element.isConnected === false || shouldSkipElement(element)) return null;
  scanClassified.add(element);

  // keep-light subtrees are never darkened; markers from an earlier scan are dropped.
  if (marks.keep.has(element)) {
    return { element, surfaceAttr: null, textAttr: false, borderAttr: false, imageAttr: null };
  }

  const tag = element.tagName.toLowerCase();
  const styles = getComputedStyle(element);
  const background = parseCssColor(styles.backgroundColor);
  const text = parseCssColor(styles.color);

  // Computed colours already include this engine's own overrides, so a marker
  // that is already set is kept: otherwise a rescan would read the darkened
  // colours, drop the marker, and flip the element back to its light colours.
  let surfaceAttr = null;
  if (background && background.a > 0.35) {
    const bgLum = getLuminance(background);
    if (bgLum > 0.82) {
      surfaceAttr = "strong";
    } else if (bgLum > 0.55) {
      surfaceAttr = "soft";
    }
  }
  if (!surfaceAttr) surfaceAttr = element.getAttribute(SURFACE_ATTR);

  let textAttr = false;
  if (text && text.a > 0.45 && getLuminance(text) < 0.48) {
    textAttr = true;
  }
  if (!textAttr && element.hasAttribute(TEXT_ATTR)) textAttr = true;

  const borderAttr =
    hasLightBorder(styles, parseCssColor, getLuminance) || element.hasAttribute(BORDER_ATTR);

  // Smart logo / SVG inversion check
  let imageAttr = null;
  if (tag === "img" || tag === "svg") {
    const src = (element.getAttribute("src") || "").toLowerCase();
    const className = (element.getAttribute("class") || "").toLowerCase();
    const id = (element.getAttribute("id") || "").toLowerCase();
    const alt = (element.getAttribute("alt") || "").toLowerCase();

    const isLogoOrTextGraphic =
      tag === "svg" ||
      src.includes("logo") ||
      src.includes("brand") ||
      src.includes("text") ||
      src.includes(".svg") ||
      className.includes("logo") ||
      className.includes("brand") ||
      className.includes("text") ||
      id.includes("logo") ||
      id.includes("brand") ||
      id.includes("text") ||
      alt.includes("logo") ||
      alt.includes("wikipedia");

    // An svg's own fill is often not what is painted (fill="none" on the root, or the
    // initial black when unset). When its shapes follow the text colour or are all
    // light, it is never inverted; otherwise the svg's own colours decide, as before.
    const shapes = tag === "svg" ? classifySvgShapes(element, parseCssColor, getLuminance) : null;

    // A paint that only *equals* the text colour (no currentColor attribute) may be a
    // hard-coded fill that happens to match. Once the text marker recolours `color`,
    // the next scan tells the two apart, so an svg marked for the first time now is
    // rescanned right after this write pass instead of waiting for an unrelated one.
    if (shapes === SVG_MATCHES_TEXT && textAttr && !element.hasAttribute(TEXT_ATTR)) {
      settleRoots.push(element);
    }

    if (isLogoOrTextGraphic && !shapes) {
      const fill = parseCssColor(styles.fill);
      const color = parseCssColor(styles.color);
      const fillLum = fill ? getLuminance(fill) : 0;
      const colorLum = color ? getLuminance(color) : 0;
      const isDarkGraphic =
        (fill && fillLum < 0.45) || (color && colorLum < 0.45) || (!fill && !color);

      if (isDarkGraphic) {
        imageAttr = "invert";
      }
    }
  }

  if (marks.invert.has(element)) imageAttr = "invert";
  if (marks.surface.has(element)) surfaceAttr = "strong";

  return { element, surfaceAttr, textAttr, borderAttr, imageAttr };
}

function applyScanUpdate({ element, surfaceAttr, textAttr, borderAttr, imageAttr }) {
  if (surfaceAttr) {
    element.setAttribute(SURFACE_ATTR, surfaceAttr);
  } else {
    element.removeAttribute(SURFACE_ATTR);
  }

  if (textAttr) {
    element.setAttribute(TEXT_ATTR, "true");
  } else {
    element.removeAttribute(TEXT_ATTR);
  }

  if (borderAttr) {
    element.setAttribute(BORDER_ATTR, "true");
  } else {
    element.removeAttribute(BORDER_ATTR);
  }

  if (imageAttr) {
    element.setAttribute(IMAGE_ATTR, imageAttr);
  } else {
    element.removeAttribute(IMAGE_ATTR);
  }
}

// Site pack fixes. Each fix is re-validated here (the pack data is trusted, but the
// engine never relies on that) and its selector is run inside try/catch so a selector
// the browser rejects is skipped. Fixes only ever run under the CSS engine.
function applyPackFixes(fixes) {
  const themes = window.ForceDarkThemes;
  const validate = themes && typeof themes.validateFix === "function" ? themes.validateFix : null;
  const valid = [];
  if (validate && Array.isArray(fixes)) {
    for (const fix of fixes) {
      if (valid.length >= MAX_PACK_FIXES) break;
      let ok = false;
      try {
        ok = validate(fix) === true;
      } catch (error) {
        ok = false;
      }
      if (ok) valid.push({ selector: fix.selector, action: fix.action });
    }
  }

  removePackFixMarkers();
  packFixes = valid;
  markPackFixes();
}

function clearPackFixes() {
  const hadFixes = packFixes.length > 0;
  removePackFixMarkers();
  packFixes = [];
  // While dark mode is on, let the regular scan re-evaluate the formerly fixed elements.
  if (hadFixes && document.getElementById(STYLE_ID)) scheduleScan(document.documentElement);
}

function queryFixTargets(selector) {
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch (error) {
    return [];
  }
}

// Sets the fix markers and returns the marked elements. keep-light covers the
// matched element and all its descendants.
function markPackFixes() {
  const marks = { invert: new Set(), surface: new Set(), keep: new Set() };
  packFixes.forEach(({ selector, action }) => {
    queryFixTargets(selector).forEach((element) => {
      if (action === "invert-image") {
        element.setAttribute(IMAGE_ATTR, "invert");
        marks.invert.add(element);
      } else if (action === "surface:strong") {
        element.setAttribute(SURFACE_ATTR, "strong");
        marks.surface.add(element);
      } else if (action === "keep-light") {
        element.setAttribute(KEEP_ATTR, "");
        marks.keep.add(element);
        element.querySelectorAll("*").forEach((child) => marks.keep.add(child));
      }
    });
  });
  packFixMarks = marks;
  return marks;
}

function removePackFixMarkers() {
  packFixMarks.invert.forEach((element) => element.removeAttribute(IMAGE_ATTR));
  packFixMarks.surface.forEach((element) => element.removeAttribute(SURFACE_ATTR));
  document.querySelectorAll(`[${KEEP_ATTR}]`).forEach((element) => element.removeAttribute(KEEP_ATTR));
  packFixMarks = { invert: new Set(), surface: new Set(), keep: new Set() };
}

function applyCustomPalette(config) {
  const themes = window.ForceDarkThemes;
  if (!themes || !themes.derivePalette) return;

  // Any missing or non-string entry falls back to the colour derived from backgroundColor.
  const derived = themes.derivePalette(config && config.backgroundColor);
  const given = config && config.palette && typeof config.palette === "object" ? config.palette : {};
  const palette = {};
  for (const key of Object.keys(derived)) {
    palette[key] = typeof given[key] === "string" && given[key] ? given[key] : derived[key];
  }
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty("--force-dark-bg", palette.bg);
  rootStyle.setProperty("--force-dark-surface", palette.surface);
  rootStyle.setProperty("--force-dark-surface-soft", palette.surfaceSoft);
  rootStyle.setProperty("--force-dark-elevated", palette.elevated);
  rootStyle.setProperty("--force-dark-text", palette.text);
  rootStyle.setProperty("--force-dark-muted", palette.muted);
  rootStyle.setProperty("--force-dark-border", palette.border);
  rootStyle.setProperty("--force-dark-link", palette.link);
  rootStyle.setProperty("--force-dark-input", palette.input);
  rootStyle.setProperty("--force-dark-selection", palette.selection);

  const dim = config && Number.isFinite(config.imageDim) ? Math.min(60, Math.max(0, config.imageDim)) : 0;
  if (dim > 0) {
    rootStyle.setProperty(IMAGE_BRIGHTNESS_PROPERTY, `${100 - dim}%`);
    document.documentElement.setAttribute(IMAGE_DIM_ATTR, "true");
  } else {
    rootStyle.removeProperty(IMAGE_BRIGHTNESS_PROPERTY);
    document.documentElement.removeAttribute(IMAGE_DIM_ATTR);
  }
}

function clearCustomPalette() {
  CUSTOM_PROPERTIES.forEach((property) => {
    document.documentElement.style.removeProperty(property);
  });
  document.documentElement.removeAttribute(IMAGE_DIM_ATTR);
}

function clearDarkAttributes(root) {
  if (!root) return;

  [
    root,
    ...root.querySelectorAll(
      `[${SURFACE_ATTR}], [${TEXT_ATTR}], [${BORDER_ATTR}], [${IMAGE_ATTR}]`
    ),
  ].forEach((element) => {
    element.removeAttribute(SURFACE_ATTR);
    element.removeAttribute(TEXT_ATTR);
    element.removeAttribute(BORDER_ATTR);
    element.removeAttribute(IMAGE_ATTR);
  });
}

function shouldSkipElement(element) {
  if (element === document.documentElement || element === document.body) {
    return false;
  }

  if (element.matches(EXCLUDED_SELECTOR)) {
    return true;
  }

  if (element.tagName.toLowerCase() === "svg") {
    return false;
  }

  return element.closest("svg, canvas, video, picture") !== null;
}

const SVG_SHAPE_TAGS = new Set([
  "path", "circle", "rect", "ellipse", "line", "polyline", "polygon", "text", "use",
]);
// Containers whose shapes are never painted directly; their subtrees are not walked.
const SVG_UNPAINTED_CONTAINERS = new Set([
  "defs", "clippath", "mask", "symbol", "pattern", "marker", "lineargradient", "radialgradient",
]);
const MAX_SVG_SHAPES = 40;
const MAX_SVG_NODES = 200;
// classifySvgShapes results (null: no decision, the svg's own colours decide).
const SVG_FOLLOWS_TEXT = "follows"; // a paint follows the text colour via a currentColor attribute
const SVG_MATCHES_TEXT = "matches"; // a paint equals the text colour, with no attribute saying why
const SVG_ALL_LIGHT = "light"; // every colour paint is already light

function sameColor(a, b) {
  return Boolean(a && b) && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

// Classifies what an svg's painted shapes will look like on the dark page. A non-null
// result means the svg must not be inverted: a paint that follows the text colour is
// made light by the text marker (inverting would darken it again), and light paints are
// already readable. A paint follows the text colour when it equals the shape's computed
// colour and its nearest fill/stroke attribute is currentColor or absent; an explicit
// colour attribute is hard-coded even if it happens to match. With no attribute the
// match is ambiguous (SVG_MATCHES_TEXT): the caller rescans once after the text marker
// is set, when a coincidental hard-coded match no longer equals the recoloured text.
// Anything else (dark or saturated hard-coded paints, gradients only, no shapes) gives
// null and the caller keeps its earlier decision.
// The walk skips unpainted subtrees, stops at the first paint that follows the text
// colour, and visits at most MAX_SVG_NODES nodes and MAX_SVG_SHAPES painted shapes.
function classifySvgShapes(svg, parseCssColor, getLuminance) {
  let visited = 0;
  let shapes = 0;
  let lightPaints = 0;
  let otherPaints = 0;
  const stack = [];
  const pushChildren = (node, fill, stroke) => {
    const children = node.children || [];
    for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], fill, stroke });
  };
  pushChildren(svg, svg.getAttribute("fill"), svg.getAttribute("stroke"));

  while (stack.length && visited < MAX_SVG_NODES && shapes < MAX_SVG_SHAPES) {
    const { node, fill: inheritedFill, stroke: inheritedStroke } = stack.pop();
    visited++;
    const tag = String(node.tagName || "").toLowerCase();
    if (SVG_UNPAINTED_CONTAINERS.has(tag)) continue;
    const fillAttr = node.getAttribute("fill");
    const strokeAttr = node.getAttribute("stroke");
    const fill = fillAttr !== null ? fillAttr : inheritedFill;
    const stroke = strokeAttr !== null ? strokeAttr : inheritedStroke;

    if (SVG_SHAPE_TAGS.has(tag)) {
      shapes++;
      const styles = getComputedStyle(node);
      for (const [property, attribute] of [["fill", fill], ["stroke", stroke]]) {
        const value = (styles[property] || "").trim();
        if (!value || value === "none") continue;
        if (value.startsWith("url(")) continue; // gradient or pattern paint
        const paint = parseCssColor(value);
        if (!paint || paint.a <= 0.35) continue;
        const attr = attribute === null || attribute === undefined ? null : attribute.trim().toLowerCase();
        if ((attr === null || attr === "currentcolor") && sameColor(paint, parseCssColor(styles.color))) {
          return attr === "currentcolor" ? SVG_FOLLOWS_TEXT : SVG_MATCHES_TEXT;
        }
        if (getLuminance(paint) >= 0.45) {
          lightPaints++;
        } else {
          otherPaints++;
        }
      }
    }
    pushChildren(node, fill, stroke);
  }
  return lightPaints > 0 && otherPaints === 0 ? SVG_ALL_LIGHT : null;
}

function hasLightBorder(styles, parseCssColor, getLuminance) {
  return [
    styles.borderTopColor,
    styles.borderRightColor,
    styles.borderBottomColor,
    styles.borderLeftColor,
    styles.outlineColor,
  ].some((value) => {
    const color = parseCssColor(value);
    return color && color.a > 0.35 && getLuminance(color) > 0.55;
  });
}
