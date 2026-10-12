const STYLE_ID = "__force_dark_mode__";
const ROOT_MODE_ATTR = "data-force-dark-mode";
const SURFACE_ATTR = "data-force-dark-surface";
const TEXT_ATTR = "data-force-dark-text";
const BORDER_ATTR = "data-force-dark-border";
const IMAGE_ATTR = "data-force-dark-image";
const IMAGE_BRIGHTNESS_PROPERTY = "--force-dark-image-brightness";
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
// fires no DOM event; a few bounded rescans after load catch the colours they set.
const LATE_RESCAN_DELAYS_MS = [800, 2500, 6000];

let darkModeObserver = null;
let styleRescanTimer = 0;
let lateRescanTimers = [];
let scanFrame = 0;
let pendingScanRoots = new Set();

function getColorUtils() {
  return window.ForceDarkColorUtils || {};
}

function enableDarkMode(config = {}) {
  applyCustomPalette(config);

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
      background-color: var(--force-dark-bg) !important;
      color: var(--force-dark-text) !important;
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

    :root[${ROOT_MODE_ATTR}="css"] :is(p, li, td, th, span, dt, dd) > :is(a, [role="link"]),
    :root[${ROOT_MODE_ATTR}="css"] :is(a, [role="link"]):not(:has(div, p, span, h1, h2, h3, h4, h5, h6)) {
      color: var(--force-dark-link) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] [${BORDER_ATTR}="true"],
    :root[${ROOT_MODE_ATTR}="css"] :is(table, thead, tbody, tfoot, tr, td, th, hr) {
      border-color: var(--force-dark-border) !important;
      outline-color: var(--force-dark-border) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(button, input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]):not([type="file"]), textarea, select, option, optgroup) {
      background-color: var(--force-dark-input) !important;
      color: var(--force-dark-text) !important;
      border-color: var(--force-dark-border) !important;
      caret-color: var(--force-dark-text) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(input, textarea)::placeholder {
      color: var(--force-dark-muted) !important;
      opacity: 1 !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(code, pre, kbd, samp) {
      background-color: var(--force-dark-elevated) !important;
      color: var(--force-dark-text) !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] ::selection {
      background-color: var(--force-dark-selection) !important;
      color: #ffffff !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(img, picture, video, canvas, iframe, embed, object, svg) {
      filter: brightness(var(--force-dark-image-brightness, 100%)) !important;
      background-color: transparent !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(img, svg)[${IMAGE_ATTR}="invert"] {
      filter: invert(0.9) hue-rotate(180deg) !important;
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
  lateRescanTimers = LATE_RESCAN_DELAYS_MS.map((delay) =>
    setTimeout(() => scheduleScan(document.documentElement), delay)
  );
}

function onResourceLoad(event) {
  if (isSiteStylesheet(event.target)) scheduleFullRescan();
}

function disableDarkMode() {
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.removeAttribute(ROOT_MODE_ATTR);
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

  pendingScanRoots.clear();
  clearDarkAttributes(document.documentElement);
}

function observePageChanges() {
  if (darkModeObserver) return;

  darkModeObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        const attr = record.attributeName || "";
        if (attr.startsWith("data-force-dark")) continue;
        scheduleScan(record.target);
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
    childList: true,
    subtree: true,
  });

  document.addEventListener("load", onResourceLoad, true);
  document.addEventListener("DOMContentLoaded", scheduleFullRescan);
  window.addEventListener("load", scheduleLateRescans);
  if (document.readyState === "complete") scheduleLateRescans();
}

function scheduleScan(root) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return;

  pendingScanRoots.add(root);
  if (scanFrame) return;

  scanFrame = requestAnimationFrame(() => {
    const roots = Array.from(pendingScanRoots);
    pendingScanRoots.clear();
    scanFrame = 0;

    batchScanTrees(roots);
  });
}

function batchScanTrees(roots) {
  const elementsToScan = new Set();

  roots.forEach((root) => {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    elementsToScan.add(root);
    root.querySelectorAll("*").forEach((el) => elementsToScan.add(el));
  });

  const { parseCssColor, getLuminance } = getColorUtils();
  if (!parseCssColor || !getLuminance) return;

  // READ PASS: Gather styles without mutating DOM to prevent forced reflows
  const updates = [];
  elementsToScan.forEach((element) => {
    if (!(element instanceof Element) || shouldSkipElement(element)) return;

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

      if (isLogoOrTextGraphic) {
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

    updates.push({ element, surfaceAttr, textAttr, borderAttr, imageAttr });
  });

  // WRITE PASS: Apply all DOM attribute updates in a single batch
  updates.forEach(({ element, surfaceAttr, textAttr, borderAttr, imageAttr }) => {
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
  });
}

function applyCustomPalette(config) {
  const themes = window.ForceDarkThemes;
  if (!themes || !themes.derivePalette) return;

  const palette = config && config.palette && typeof config.palette === "object"
    ? config.palette
    : themes.derivePalette(config && config.backgroundColor);
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
  } else {
    rootStyle.removeProperty(IMAGE_BRIGHTNESS_PROPERTY);
  }
}

function clearCustomPalette() {
  CUSTOM_PROPERTIES.forEach((property) => {
    document.documentElement.style.removeProperty(property);
  });
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
