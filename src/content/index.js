const host = location.hostname || "local_files";
const DEFAULT_ENGINE = "auto";
const FALLBACK_ENGINE = "css";
const VALID_ENGINES = new Set(["auto", "css", "invert"]);
const ANALYSIS_SAMPLE_LIMIT = 300;
const ANALYSIS_SKIP_SELECTOR = [
  "area",
  "audio",
  "br",
  "link",
  "map",
  "meta",
  "noscript",
  "script",
  "source",
  "style",
  "template",
  "track",
].join(",");

function getColorUtils() {
  return window.ForceDarkColorUtils || {};
}

function normalizeEngine(engine) {
  return VALID_ENGINES.has(engine) ? engine : DEFAULT_ENGINE;
}

function applyEngine(config) {
  disableDarkMode();
  disableInvert();

  if (!config?.enabled) return;

  const engine = resolveEngine(config);

  if (!engine) return;

  if (engine === "invert") {
    enableInvert();
  } else {
    enableDarkMode(config);
  }
}

function resolveEngine(config) {
  const engine = normalizeEngine(config?.engine);

  if (engine !== "auto") {
    return engine;
  }

  const analysis = analyzePageForEngine();
  return analysis.nativeDark ? "" : analysis.engine;
}

// Initial engine application
chrome.storage.sync.get(host, (data) => {
  applyEngine(data[host]);
});

// Re-evaluate Auto Mode engine on DOMContentLoaded if DOM was still loading at document_start
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      chrome.storage.sync.get(host, (data) => {
        applyEngine(data[host]);
      });
    },
    { once: true }
  );
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (!changes[host]) return;

  applyEngine(changes[host].newValue);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "APPLY_CONFIG") {
    applyEngine(msg.config);
  }

  if (msg.type === "ANALYZE_PAGE") {
    sendResponse(analyzePageForEngine());
  }
});

function analyzePageForEngine() {
  const { parseCssColor, getLuminance, getContrastRatio } = getColorUtils();
  const elements = getVisibleSample();
  const visibleCount = elements.length || 1;
  const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
  let lightSurfaceCount = 0;
  let mediaCount = 0;
  let mediaArea = 0;
  let canvasCount = 0;
  let iframeCount = 0;
  let backgroundImageCount = 0;
  let backgroundImageArea = 0;
  let lowContrastTextCount = 0;
  let formCount = 0;
  let textCount = 0;
  let textArea = 0;

  elements.forEach((element) => {
    const tag = element.tagName.toLowerCase();
    const styles = getComputedStyle(element);
    const background = parseCssColor ? parseCssColor(styles.backgroundColor) : null;
    const text = parseCssColor ? parseCssColor(styles.color) : null;
    const area = getViewportArea(element);

    if (background && background.a > 0.35 && getLuminance && getLuminance(background) > 0.72) {
      lightSurfaceCount += 1;
    }

    if (hasBackgroundImage(styles)) {
      backgroundImageCount += 1;
      mediaCount += 1;
      backgroundImageArea += area;
      mediaArea += area;
    }

    if (isMediaElement(tag)) {
      mediaCount += 1;
      mediaArea += area;
    }

    if (tag === "canvas") {
      canvasCount += 1;
    }

    if (tag === "iframe") {
      iframeCount += 1;
    }

    if (isFormElement(tag)) {
      formCount += 1;
    }

    if (hasMeaningfulText(element)) {
      textCount += 1;
      textArea += area;

      if (
        background &&
        text &&
        background.a > 0.35 &&
        text.a > 0.45 &&
        getContrastRatio &&
        getContrastRatio(background, text) < 3.8
      ) {
        lowContrastTextCount += 1;
      }
    }
  });

  const lightSurfaceRatio = roundRatio(lightSurfaceCount / visibleCount);
  const mediaRatio = roundRatio(mediaCount / visibleCount);
  const mediaAreaRatio = roundRatio(Math.min(mediaArea / viewportArea, 1));
  const backgroundImageAreaRatio = roundRatio(
    Math.min(backgroundImageArea / viewportArea, 1)
  );
  const visualEmbedCount = canvasCount + iframeCount + backgroundImageCount;
  const textRatio = roundRatio((textCount + formCount) / visibleCount);
  const textAreaRatio = roundRatio(Math.min(textArea / viewportArea, 1));
  const signals = {
    lightSurfaceRatio,
    mediaRatio,
    mediaAreaRatio,
    canvasCount,
    iframeCount,
    backgroundImageCount,
    backgroundImageAreaRatio,
    lowContrastTextCount,
  };

  if (visibleCount < 20) {
    return {
      engine: FALLBACK_ENGINE,
      confidence: "low",
      reason: "not enough page content to analyze confidently",
      nativeDark: false,
      signals,
    };
  }

  const darkSurfaceRatio = roundRatio(1 - lightSurfaceRatio);
  const nativeDark = isNativeDarkPage({
    darkSurfaceRatio,
    lightSurfaceRatio,
    textAreaRatio,
    mediaAreaRatio,
  });

  signals.darkSurfaceRatio = darkSurfaceRatio;

  if (nativeDark) {
    return {
      engine: FALLBACK_ENGINE,
      confidence: darkSurfaceRatio >= 0.82 ? "high" : "medium",
      reason: "site already appears dark",
      nativeDark: true,
      signals,
    };
  }

  if (
    mediaAreaRatio >= 0.42 ||
    backgroundImageAreaRatio >= 0.38 ||
    mediaRatio >= 0.22 ||
    visualEmbedCount >= 10 ||
    canvasCount >= 3 ||
    iframeCount >= 4
  ) {
    return {
      engine: "invert",
      confidence: "high",
      reason: "best for media-heavy pages",
      nativeDark: false,
      signals,
    };
  }

  if (
    (mediaAreaRatio >= 0.24 ||
      backgroundImageAreaRatio >= 0.22 ||
      mediaRatio >= 0.14 ||
      visualEmbedCount >= 5 ||
      canvasCount >= 1) &&
    textAreaRatio < 0.42
  ) {
    return {
      engine: "invert",
      confidence: "medium",
      reason: "better for visual-heavy layouts",
      nativeDark: false,
      signals,
    };
  }

  if (
    (mediaAreaRatio >= 0.18 || mediaRatio >= 0.1) &&
    textAreaRatio >= 0.28
  ) {
    return {
      engine: FALLBACK_ENGINE,
      confidence: "low",
      reason: "mixed content; CSS is safer",
      nativeDark: false,
      signals,
    };
  }

  if (
    lightSurfaceRatio >= 0.24 ||
    textRatio >= 0.24 ||
    textAreaRatio >= 0.28 ||
    formCount >= 3
  ) {
    return {
      engine: FALLBACK_ENGINE,
      confidence:
        lightSurfaceRatio >= 0.42 || textAreaRatio >= 0.42 ? "high" : "medium",
      reason: "best for text-heavy pages",
      nativeDark: false,
      signals,
    };
  }

  return {
    engine: FALLBACK_ENGINE,
    confidence: "low",
    reason: "CSS is the safer default",
    nativeDark: false,
    signals,
  };
}

function isNativeDarkPage({
  darkSurfaceRatio,
  lightSurfaceRatio,
  textAreaRatio,
  mediaAreaRatio,
}) {
  const { parseCssColor, getLuminance } = getColorUtils();
  if (!parseCssColor || !getLuminance) return false;

  const rootStyles = getComputedStyle(document.documentElement);
  const bodyStyles = document.body ? getComputedStyle(document.body) : rootStyles;
  const rootBackground = parseCssColor(rootStyles.backgroundColor);
  const bodyBackground = parseCssColor(bodyStyles.backgroundColor);
  const rootColorScheme = rootStyles.colorScheme || "";
  const bodyColorScheme = bodyStyles.colorScheme || "";
  const declaresDarkScheme =
    rootColorScheme.includes("dark") || bodyColorScheme.includes("dark");
  const hasDarkRoot =
    (rootBackground &&
      rootBackground.a > 0.35 &&
      getLuminance(rootBackground) < 0.28) ||
    (bodyBackground &&
      bodyBackground.a > 0.35 &&
      getLuminance(bodyBackground) < 0.28);

  if (lightSurfaceRatio > 0.18 || mediaAreaRatio > 0.5) return false;

  return (
    (declaresDarkScheme && darkSurfaceRatio >= 0.72) ||
    (hasDarkRoot && darkSurfaceRatio >= 0.68 && textAreaRatio >= 0.12)
  );
}

function getVisibleSample() {
  const sample = getPriorityVisualElements();
  const seen = new Set(sample);
  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(element) {
        if (sample.length >= ANALYSIS_SAMPLE_LIMIT) {
          return NodeFilter.FILTER_REJECT;
        }

        if (
          !(element instanceof Element) ||
          seen.has(element) ||
          element.matches(ANALYSIS_SKIP_SELECTOR)
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return isVisibleElement(element)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    }
  );

  while (sample.length < ANALYSIS_SAMPLE_LIMIT) {
    const element = walker.nextNode();
    if (!element) break;
    seen.add(element);
    sample.push(element);
  }

  return sample;
}

function getPriorityVisualElements() {
  return Array.from(
    document.querySelectorAll("img, video, canvas, iframe, embed, object, svg")
  )
    .filter(isVisibleElement)
    .slice(0, 80);
}

function isVisibleElement(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;
  if (rect.bottom < 0 || rect.right < 0) return false;
  if (rect.top > window.innerHeight * 2) return false;

  const styles = getComputedStyle(element);
  return (
    styles.display !== "none" &&
    styles.visibility !== "hidden" &&
    Number.parseFloat(styles.opacity || "1") > 0.05
  );
}

function isMediaElement(tag) {
  return [
    "canvas",
    "embed",
    "iframe",
    "img",
    "object",
    "picture",
    "svg",
    "video",
  ].includes(tag);
}

function isFormElement(tag) {
  return ["button", "input", "option", "select", "textarea"].includes(tag);
}

function hasMeaningfulText(element) {
  const text = element.textContent?.trim();
  if (!text || text.length < 12) return false;

  return !Array.from(element.children).some((child) => {
    return child.textContent?.trim().length >= 12;
  });
}

function hasBackgroundImage(styles) {
  return Boolean(styles.backgroundImage && styles.backgroundImage !== "none");
}

function getViewportArea(element) {
  const rect = element.getBoundingClientRect();
  const left = Math.max(rect.left, 0);
  const right = Math.min(rect.right, window.innerWidth);
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  const width = Math.max(right - left, 0);
  const height = Math.max(bottom - top, 0);

  return width * height;
}

function roundRatio(value) {
  return Math.round(value * 100) / 100;
}
