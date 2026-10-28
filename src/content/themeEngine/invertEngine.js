const INVERT_STYLE_ID = "__force_dark_invert__";

// The page filter's invert amount. 0.92 (not 1) keeps the inverted page off pure black/white.
const PAGE_INVERT_AMOUNT = 0.92;

// Per-site "media" setting: "on" restores photos to their natural colours, "dim" restores and darkens them by
// mediaDim percent, "off" leaves them inverted like the rest of the page. A missing field means "on".
const MEDIA_MODES = ["on", "dim", "off"];
const DEFAULT_MEDIA_MODE = "on";
const DEFAULT_MEDIA_DIM = 20;
const MAX_MEDIA_DIM = 80;

// Elements whose stylesheet background is a url() image get this attribute (from the scan below).
const MEDIA_BG_ATTR = "data-force-dark-bg";
const MEDIA_SCAN_BATCH = 150; // computed-style reads per task
const MEDIA_SCAN_MAX = 8000; // computed-style reads per page (initial pass plus added nodes)
const MEDIA_SCAN_MIN_SIZE = 48; // smaller backgrounds are icons/sprites: they follow the inverted theme
const MEDIA_SCAN_MAX_HEIGHT_RATIO = 1.2; // taller than this many viewports: a layout wrapper, not a photo
const MEDIA_SCAN_SKIP_TAGS = new Set([
  "HEAD", "SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "NOSCRIPT", "TITLE",
  "IMG", "VIDEO", "CANVAS", "IFRAME", "EMBED", "OBJECT", "PICTURE", "SVG", "svg",
]);

const MEDIA_SELECTORS = [
  "img",
  "video",
  "canvas",
  "embed",
  "object",
  '[style*="background-image"]',
  `[${MEDIA_BG_ATTR}]`,
];

// <img> whose source is an SVG (logos, illustrations). Restored like any image in "on"; in "dim" they are
// restored but not dimmed (dimming a logo only makes it muddy); in "off" they are inverted with the page.
const SVG_IMAGE_SELECTORS = ['img[src$=".svg" i]', 'img[src*=".svg?" i]', 'img[src^="data:image/svg" i]'];

function normalizeMediaMode(value) {
  return MEDIA_MODES.includes(value) ? value : DEFAULT_MEDIA_MODE;
}

function normalizeMediaDim(value) {
  if (value === null || value === undefined || value === "") return DEFAULT_MEDIA_DIM;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MEDIA_DIM;
  return Math.min(MAX_MEDIA_DIM, Math.max(0, Math.round(numeric)));
}

function invertMediaOptions(config) {
  return { media: normalizeMediaMode(config?.media), mediaDim: normalizeMediaDim(config?.mediaDim) };
}

// The exact inverse of the page's colour step, `invert(a) hue-rotate(180deg)`.
// Filters on an element run first, then its ancestors' filters run on the result, so a media pixel x is shown
// as Page(Media(x)) and Media must be Page^-1 = invert(a)^-1 after hue-rotate(180deg)^-1:
//  - hue-rotate(180deg) is its own inverse (its matrix squared is the identity; rows sum to 1).
//  - invert(a) maps x to a + (1 - 2a)x. Its inverse (a - y) / (2a - 1) has slope -1/(2a - 1), steeper than any
//    invert() can give, so it is built as invert(1) (y -> 1 - y) then contrast(c) (z -> cz + (1 - c)/2) with
//    c = 1 / (2a - 1): the intercept (1 - c)/2 = -(1 - a)/(2a - 1) matches exactly.
// For a = 0.92: contrast(1.1905). The net effect on a photo is the identity on 8%..92% per channel, with the
// outer 8% clipped (the page's invert(0.92) can never output darker than 8% or lighter than 92%). The old
// invert(1) hue-rotate(180deg) instead squeezed every photo into 8%..92% (lifted blacks, dull whites, ~6% off).
// Residual either way: hue-rotate clamps out-of-gamut values, so very saturated colours lose some saturation.
// The user's brightness/contrast/sepia sit after the page's hue-rotate and are not undone, so media get them once.
function invertCompensationFilter(amount = PAGE_INVERT_AMOUNT) {
  const contrast = Number((1 / (2 * amount - 1)).toFixed(4));
  return `hue-rotate(180deg) invert(1) contrast(${contrast})`;
}

// The filter a restored media element gets. Dimming goes first, on the original pixels, so it reads as darker.
function mediaRestoreFilter(mode, dim = DEFAULT_MEDIA_DIM) {
  const media = normalizeMediaMode(mode);
  if (media === "off") return "";
  const base = invertCompensationFilter();
  if (media !== "dim") return base;
  const factor = Number((1 - normalizeMediaDim(dim) / 100).toFixed(2));
  return `brightness(${factor}) ${base}`;
}

function buildInvertCss(options = {}) {
  const { media, mediaDim } = invertMediaOptions(options);
  const compensation = invertCompensationFilter();
  const restore = mediaRestoreFilter(media, mediaDim);

  let css = `
    :root {
      color-scheme: dark !important;
    }

    html:not([data-force-dark-frame="transparent"]) {
      background-color: #121212 !important;
    }

    html {
      filter: invert(${PAGE_INVERT_AMOUNT}) hue-rotate(180deg) brightness(var(--force-dark-brightness, 100%)) contrast(var(--force-dark-contrast, 100%)) sepia(var(--force-dark-sepia, 0%)) !important;
    }

    /*
     * No double inversion across frames: the html filter above would also invert every child frame's
     * pixels, and the content script themes each child frame itself (with the top site's settings). So the
     * iframe element is re-inverted here (in every media mode), cancelling this frame's filter, and the
     * child's own engine alone decides its colours. Without this a dark child frame would be flipped back
     * to light.
     */
    iframe {
      filter: ${compensation} !important;
    }
  `;

  if (media === "off") return css + canvasDocumentInvertCss(options?.canvasDocument);

  css += `
    /*
     * Known limitation: this unconditionally re-inverts every image/canvas
     * regardless of whether the site already inverted it itself (e.g. an
     * icon with a Tailwind "dark:invert" class driven by the real system
     * prefers-color-scheme). On those sites this double-inverts the icon
     * back to its original (now-invisible) color. See README's Theme
     * Engines section. No general fix without risking the common case this
     * rule exists for: un-inverting ordinary images on the vast majority
     * of sites that don't do their own conditional icon inversion.
     *
     * <picture> is deliberately not filtered: it is inline (or display:contents) and its filter may not
     * reach a block <img> inside it, so the <img> itself is restored by the img rule.
     *
     * Inline <svg> is deliberately left inverted by the page filter: most are icons and logos drawn with
     * currentColor or dark fills, which should follow the dark theme (like the CSS engine's logo handling).
     * Inline SVG illustrations therefore show inverted colours.
     */
    ${MEDIA_SELECTORS.join(",\n    ")} {
      filter: ${restore} !important;
    }
  `;

  if (media === "dim") {
    css += `
    ${SVG_IMAGE_SELECTORS.join(",\n    ")} {
      filter: ${compensation} !important;
    }
  `;
  }

  // A restored ancestor already cancels the page filter for its whole subtree: media inside it must not be
  // compensated again (that would show them as negatives). Higher specificity than every rule above.
  const all = [...MEDIA_SELECTORS, "iframe"].join(", ");
  css += `
    :is(${all}) :is(${all}) {
      filter: none !important;
    }
  `;
  return css + canvasDocumentInvertCss(options?.canvasDocument);
}

// Google Docs / Sheets (path-scoped, see canvasDocumentKind in sitePacks.js): the page and grid canvases are
// left to the html filter, so the white paper turns dark and text light, instead of being restored. Each
// selector has a class or id, so it outranks the plain `canvas` restore rule above; emitted in every media mode.
function canvasDocumentInvertCss(kind) {
  const selectors = window.ForceDarkThemes?.canvasDocumentSelectors?.(kind) || [];
  if (!selectors.length) return "";
  return `
    ${selectors.join(",\n    ")} {
      filter: none !important;
    }
  `;
}

function enableInvert(options = {}) {
  const css = buildInvertCss(options);
  let style = document.getElementById(INVERT_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = INVERT_STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = css;

  stopMediaScan();
  if (normalizeMediaMode(options?.media) !== "off") startMediaScan();
}

function disableInvert() {
  if (typeof removeCustomCss === "function") removeCustomCss();
  stopMediaScan();
  document.getElementById(INVERT_STYLE_ID)?.remove();
}

// --- stylesheet background images ---------------------------------------------------------------------------
// Inline background-image styles are matched by the rule above; backgrounds from stylesheets are not visible to
// selectors, so a bounded scan reads computed styles in small idle-time batches and marks url() backgrounds.
// Only added nodes are watched (later class/style changes are not), and the scan stops after MEDIA_SCAN_MAX reads.

let mediaScanQueue = [];
let mediaScanHandle = 0;
let mediaScanHandleKind = "";
let mediaScanReads = 0;
let mediaScanObserver = null;

function startMediaScan() {
  mediaScanReads = 0;
  mediaScanQueue = [];
  if (document.documentElement) mediaScanQueue.push(document.documentElement);

  if (typeof MutationObserver === "function" && document.documentElement) {
    mediaScanObserver = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes?.forEach?.((node) => {
          if (node && node.nodeType === 1 && node.id !== INVERT_STYLE_ID) enqueueMediaScan(node);
        });
      }
    });
    mediaScanObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  scheduleMediaScan();
}

function stopMediaScan() {
  if (mediaScanObserver) {
    mediaScanObserver.disconnect();
    mediaScanObserver = null;
  }
  cancelMediaScanTask();
  mediaScanQueue = [];
  document.querySelectorAll?.(`[${MEDIA_BG_ATTR}]`)?.forEach?.((el) => el.removeAttribute(MEDIA_BG_ATTR));
}

function enqueueMediaScan(node) {
  if (mediaScanReads >= MEDIA_SCAN_MAX || mediaScanQueue.length >= MEDIA_SCAN_MAX) return;
  mediaScanQueue.push(node);
  scheduleMediaScan();
}

function scheduleMediaScan() {
  if (mediaScanHandle || !mediaScanQueue.length) return;
  if (typeof requestIdleCallback === "function") {
    mediaScanHandleKind = "idle";
    mediaScanHandle = requestIdleCallback(runMediaScanBatch, { timeout: 1000 });
  } else if (typeof requestAnimationFrame === "function") {
    mediaScanHandleKind = "frame";
    mediaScanHandle = requestAnimationFrame(() => runMediaScanBatch());
  }
}

function cancelMediaScanTask() {
  if (!mediaScanHandle) return;
  if (mediaScanHandleKind === "idle" && typeof cancelIdleCallback === "function") cancelIdleCallback(mediaScanHandle);
  if (mediaScanHandleKind === "frame" && typeof cancelAnimationFrame === "function") cancelAnimationFrame(mediaScanHandle);
  mediaScanHandle = 0;
  mediaScanHandleKind = "";
}

function runMediaScanBatch(deadline) {
  mediaScanHandle = 0;
  mediaScanHandleKind = "";
  let reads = 0;
  while (mediaScanQueue.length && reads < MEDIA_SCAN_BATCH && mediaScanReads < MEDIA_SCAN_MAX) {
    if (reads > 0 && deadline && typeof deadline.timeRemaining === "function" && !deadline.didTimeout
      && deadline.timeRemaining() < 1) break;
    const element = mediaScanQueue.shift();
    if (!element || element.nodeType !== 1 || MEDIA_SCAN_SKIP_TAGS.has(element.tagName)) continue;
    reads++;
    mediaScanReads++;
    if (scanMediaElement(element) && element.children) {
      for (const child of element.children) mediaScanQueue.push(child);
    }
  }
  if (mediaScanReads >= MEDIA_SCAN_MAX) mediaScanQueue = [];
  scheduleMediaScan();
}

// Marks one element if it shows a url() background image; returns whether its children are worth visiting.
function scanMediaElement(element) {
  let styles;
  try {
    styles = getComputedStyle(element);
  } catch {
    return false;
  }
  if (!styles || styles.display === "none") return false;
  if (element === document.documentElement || element === document.body) return true;
  if (styles.visibility === "hidden" || !/url\(/i.test(styles.backgroundImage || "")) return true;

  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || 0;
  const tooSmall = rect.width < MEDIA_SCAN_MIN_SIZE || rect.height < MEDIA_SCAN_MIN_SIZE;
  const wrapper = viewportHeight > 0 && rect.height > viewportHeight * MEDIA_SCAN_MAX_HEIGHT_RATIO;
  if (!tooSmall && !wrapper) element.setAttribute(MEDIA_BG_ATTR, "");
  return true;
}
