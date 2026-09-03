const STYLE_ID = "__force_dark_mode__";
const ROOT_MODE_ATTR = "data-force-dark-mode";
const SURFACE_ATTR = "data-force-dark-surface";
const TEXT_ATTR = "data-force-dark-text";
const BORDER_ATTR = "data-force-dark-border";
const IMAGE_ATTR = "data-force-dark-image";
const DEFAULT_BACKGROUND_COLOR = "#0f1115";
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

let darkModeObserver = null;
let scanFrame = 0;
let pendingScanRoots = new Set();

function getColorUtils() {
  return window.ForceDarkColorUtils || {};
}

function enableDarkMode(config = {}) {
  applyCustomPalette(config.backgroundColor);

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
      filter: none !important;
      background-color: transparent !important;
    }

    :root[${ROOT_MODE_ATTR}="css"] :is(img, svg)[${IMAGE_ATTR}="invert"] {
      filter: invert(0.9) hue-rotate(180deg) !important;
    }
  `;

  const target = document.head || document.documentElement;
  target.appendChild(style);
  document.documentElement.setAttribute(ROOT_MODE_ATTR, "css");

  observePageChanges();
  scheduleScan(document.documentElement);
}

function disableDarkMode() {
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.removeAttribute(ROOT_MODE_ATTR);
  clearCustomPalette();

  if (darkModeObserver) {
    darkModeObserver.disconnect();
    darkModeObserver = null;
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

    let surfaceAttr = null;
    if (background && background.a > 0.35) {
      const bgLum = getLuminance(background);
      if (bgLum > 0.82) {
        surfaceAttr = "strong";
      } else if (bgLum > 0.55) {
        surfaceAttr = "soft";
      }
    }

    let textAttr = false;
    if (text && text.a > 0.45 && getLuminance(text) < 0.48) {
      textAttr = true;
    }

    const borderAttr = hasLightBorder(styles, parseCssColor, getLuminance);

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

function applyCustomPalette(backgroundColor) {
  const { normalizeHexColor, hexToRgb, getLuminance, mixColors } = getColorUtils();
  if (!normalizeHexColor || !hexToRgb) return;

  const base = normalizeHexColor(backgroundColor) || DEFAULT_BACKGROUND_COLOR;
  const baseRgb = hexToRgb(base);
  const baseLuminance = getLuminance(baseRgb);
  const isLight = baseLuminance > 0.5;
  const textColor = isLight ? "#14171c" : "#e8eaed";
  const mutedColor = isLight ? "#4d5663" : "#b8bec7";
  const linkColor = isLight ? "#174ea6" : "#8ab4f8";
  const surfaceColor = mixColors(baseRgb, isLight ? "#000000" : "#ffffff", isLight ? 0.06 : 0.08);
  const surfaceSoftColor = mixColors(baseRgb, isLight ? "#000000" : "#ffffff", isLight ? 0.1 : 0.14);
  const elevatedColor = mixColors(baseRgb, isLight ? "#000000" : "#ffffff", isLight ? 0.14 : 0.22);
  const borderColor = mixColors(baseRgb, isLight ? "#000000" : "#ffffff", isLight ? 0.25 : 0.2);
  const inputColor = mixColors(baseRgb, isLight ? "#000000" : "#ffffff", isLight ? 0.04 : 0.05);
  const selectionColor = mixColors(baseRgb, isLight ? "#174ea6" : "#8ab4f8", 0.35);
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty("--force-dark-bg", base);
  rootStyle.setProperty("--force-dark-surface", surfaceColor);
  rootStyle.setProperty("--force-dark-surface-soft", surfaceSoftColor);
  rootStyle.setProperty("--force-dark-elevated", elevatedColor);
  rootStyle.setProperty("--force-dark-text", textColor);
  rootStyle.setProperty("--force-dark-muted", mutedColor);
  rootStyle.setProperty("--force-dark-border", borderColor);
  rootStyle.setProperty("--force-dark-link", linkColor);
  rootStyle.setProperty("--force-dark-input", inputColor);
  rootStyle.setProperty("--force-dark-selection", selectionColor);
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
