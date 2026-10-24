// This script runs in every frame (manifest all_frames / match_about_blank). Settings are keyed by the site the
// user sees, so a child frame (iframe, srcdoc, about:blank) takes its key from the top frame's host. Child frames
// never answer data requests, never report usage, never touch the pre-paint flag and stay inert when tiny.
const IS_CHILD_FRAME = isChildFrame();
const MIN_FRAME_SIZE_PX = 48;
const TRANSPARENT_FRAME_ATTR = "data-force-dark-frame";
const host = resolveConfigHost();

function isChildFrame() {
  try {
    const top = window.top;
    return Boolean(top) && top !== window;
  } catch (error) {
    return true;
  }
}

function hostnameOfOrigin(origin) {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(String(origin || ""));
  return match ? match[1].toLowerCase() : "";
}

// Top frame: its own host. Child frame: the top origin's host from location.ancestorOrigins (Chrome), else the
// top's own location when same-origin, else (cross-origin without ancestorOrigins) the frame's own host.
function resolveConfigHost() {
  const own = location.hostname || "local_files";
  if (!IS_CHILD_FRAME) return own;
  const ancestors = location.ancestorOrigins;
  if (ancestors && ancestors.length) return hostnameOfOrigin(ancestors[ancestors.length - 1]) || "local_files";
  try {
    return window.top.location.hostname || "local_files";
  } catch (error) {
    return own;
  }
}

// Tracker / ad pixels and hidden frames: nothing worth theming, so no engine, observer or timer.
function isInertFrame() {
  if (!IS_CHILD_FRAME) return false;
  if (window.innerWidth < MIN_FRAME_SIZE_PX || window.innerHeight < MIN_FRAME_SIZE_PX) return true;
  const body = document.readyState === "loading" ? null : document.body;
  if (!body) return false;
  const rect = body.getBoundingClientRect();
  return rect.width === 0 || rect.height === 0; // no visible body
}

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

// Pre-paint bridge. chrome.storage answers only after the first paint, so a site that had dark mode last time
// would flash white. The one thing this extension keeps in the page's own web storage is the flag below: "1:" and
// the time it was written, set when an engine applied dark mode on this origin and removed when the resolved
// state is anything else. Nothing else (no settings, themes, addresses or user data) is ever written there.
// While the flag is fresh, a dark canvas is painted until the real state arrives; it is removed on every path.
const PREPAINT_KEY = "__fdm_pre";
const PREPAINT_STYLE_ID = "__force_dark_prepaint__";
const PREPAINT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PREPAINT_FAILSAFE_MS = 4000;

function readPrepaintFlag() {
  try {
    const match = /^1:(\d{1,15})$/.exec(window.localStorage.getItem(PREPAINT_KEY) || "");
    if (!match) return false;
    const age = Date.now() - Number(match[1]);
    return age >= 0 && age <= PREPAINT_MAX_AGE_MS;
  } catch (error) {
    return false; // storage blocked or unavailable: no bridge
  }
}

function writePrepaintFlag(dark) {
  try {
    if (dark) window.localStorage.setItem(PREPAINT_KEY, "1:" + Date.now());
    else window.localStorage.removeItem(PREPAINT_KEY);
  } catch (error) {
    // storage blocked, full or unavailable: the next load simply has no bridge
  }
}

function removePrepaintStyle() {
  document.getElementById(PREPAINT_STYLE_ID)?.remove();
}

// Called whenever the real state for this page is known: drops the bridge and records the outcome.
// The flag belongs to the top document's origin, so a child frame never reads or writes it.
function settlePrepaint(dark) {
  removePrepaintStyle();
  if (!IS_CHILD_FRAME) writePrepaintFlag(dark);
}

function injectPrepaintStyle() {
  const parent = document.head || document.documentElement;
  if (!parent || document.getElementById(PREPAINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PREPAINT_STYLE_ID;
  style.textContent = "html{background:#0f1115!important;color-scheme:dark}";
  parent.appendChild(style);
  // Backstop: if the real state never arrives (storage error, invalidated context), never leave the page dark.
  setTimeout(removePrepaintStyle, PREPAINT_FAILSAFE_MS);
}

if (!IS_CHILD_FRAME && readPrepaintFlag()) injectPrepaintStyle();

function getColorUtils() {
  return window.ForceDarkColorUtils || {};
}

function normalizeEngine(engine) {
  return VALID_ENGINES.has(engine) ? engine : DEFAULT_ENGINE;
}

// Signature of what is on the page now, so a re-apply with the same result (the DOMContentLoaded re-run, an
// unrelated storage change) leaves the engine in place instead of tearing it down and flashing white.
let appliedSignature = "";

function applyEngine(config) {
  const resolved = config?.enabled && !isInertFrame()
    ? withEngineStylesSuspended(() => ({ engine: resolveEngine(config), transparent: isTransparentFrame() }))
    : { engine: "", transparent: false };
  const engine = resolved.engine;
  const transparent = Boolean(engine) && resolved.transparent;
  const themed = engine && engine !== "invert" ? withThemePalette(config) : null;
  // Invert only: the per-site media setting (missing = "on"). Part of the signature so a change rebuilds it.
  const media = engine === "invert" ? invertMediaOptions(config) : null;
  const signature = engine ? engineSignature(engine, config, themed, transparent, media) : "";

  if (signature && signature === appliedSignature && isEngineStylePresent(engine)) {
    settlePrepaint(true);
    return;
  }

  disableDarkMode();
  disableInvert();
  clearFilterVars();
  document.documentElement.removeAttribute(TRANSPARENT_FRAME_ATTR);
  appliedSignature = "";

  // Off, disabled for the site, outside the schedule or natively dark: no bridge, and no flag for next time.
  if (!engine) {
    settlePrepaint(false);
    return;
  }

  applyFilterVars(config);
  if (transparent) document.documentElement.setAttribute(TRANSPARENT_FRAME_ATTR, "transparent");

  if (engine === "invert") {
    enableInvert(media);
  } else {
    enableDarkMode(themed);
  }

  // Only when an engine actually applied dark mode (not on natively dark pages).
  applyCustomCss(currentCustomCss);
  appliedSignature = signature;
  settlePrepaint(true); // the engine style is in place, so the bridge goes in the same task (no paint between)
  reportDarkAppliedOnce(config);
}

function engineSignature(engine, config, themed, transparent, media = null) {
  const filters = [config?.brightness, config?.contrast, config?.sepia];
  return JSON.stringify([engine, filters, themed, currentCustomCss, Boolean(transparent), media]);
}

// A child frame whose own document paints no background (html and body transparent, no image) shows the
// embedding page through it. Forcing an opaque dark canvas there would cover the parent's design, so the
// engines skip their root/body background in such frames (light surfaces are still darkened by the scan).
// Measured with our styles suspended. The top frame always gets the dark canvas.
function isTransparentFrame() {
  if (!IS_CHILD_FRAME) return false;
  const { parseCssColor } = getColorUtils();
  if (!parseCssColor) return false;
  return [document.documentElement, document.body].every((element) => {
    if (!element) return true;
    const styles = getComputedStyle(element);
    if (hasBackgroundImage(styles)) return false;
    const background = parseCssColor(styles.backgroundColor);
    return !background || background.a <= 0.05;
  });
}

function isEngineStylePresent(engine) {
  return Boolean(document.getElementById(engine === "invert" ? "__force_dark_invert__" : "__force_dark_mode__"));
}

// Auto and Invert analyse the page's own colours, so our styles must not count: they are switched off for the
// synchronous analysis only (no paint can happen in between) and switched back on afterwards.
function withEngineStylesSuspended(fn) {
  const styles = [...ENGINE_STYLE_IDS, CUSTOM_CSS_STYLE_ID, PREPAINT_STYLE_ID]
    .map((id) => document.getElementById(id))
    .filter((style) => style && !style.disabled);
  styles.forEach((style) => { style.disabled = true; });
  try {
    return fn();
  } finally {
    styles.forEach((style) => { style.disabled = false; });
  }
}

// Tells the service worker that dark mode was applied on this page, once per page load. The message carries the
// engine name only: the worker takes the site from this tab itself and keeps just a count, and only if the user
// opted in to the usage report. A missing worker or invalidated context is ignored.
let darkAppliedReported = false;

function reportDarkAppliedOnce(config) {
  if (IS_CHILD_FRAME || darkAppliedReported) return; // once per tab: the top frame speaks for the page
  darkAppliedReported = true;
  try {
    const result = chrome.runtime.sendMessage({ type: "DARK_APPLIED", engine: normalizeEngine(config?.engine) }, () => void chrome.runtime.lastError);
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch (error) {
    // extension context invalidated
  }
}

// Adds the resolved theme's palette and image dimming, and the site pack's fixes, to
// the site config (CSS engine only). Fixes come only from the resolved pack: a
// `fixes` key in the stored or messaged config is always dropped. Without a theme
// the colour settings pass through untouched, so backgroundColor-only sites behave as before.
function withThemePalette(config) {
  const out = config && typeof config === "object" ? { ...config } : {};
  delete out.fixes;
  // Invert-only settings: dropped so a media change never rebuilds the CSS engine.
  delete out.media;
  delete out.mediaDim;

  const themes = window.ForceDarkThemes;
  if (!themes || typeof themes.resolveTheme !== "function") return out;

  let resolved = null;
  try {
    resolved = themes.resolveTheme({ config, host, userThemes: currentUserThemes });
  } catch (error) {
    resolved = null;
  }
  const pack = resolved && resolved.pack;
  if (pack && Array.isArray(pack.fixes) && pack.fixes.length) out.fixes = pack.fixes;

  const theme = resolved && resolved.theme;
  if (!theme) return out;

  out.palette = themes.paletteFromTheme(theme);
  out.imageDim = Number.isFinite(out.imageDim) ? out.imageDim : theme.imageDim;
  return out;
}

function applyFilterVars(config) {
  const brightness = Number.isFinite(config?.brightness) ? config.brightness : 100;
  const contrast = Number.isFinite(config?.contrast) ? config.contrast : 100;
  const sepia = Number.isFinite(config?.sepia) ? config.sepia : 0;
  const hasAdjustment = brightness !== 100 || contrast !== 100 || sepia !== 0;
  const root = document.documentElement;

  root.style.setProperty("--force-dark-brightness", `${brightness}%`);
  root.style.setProperty("--force-dark-contrast", `${contrast}%`);
  root.style.setProperty("--force-dark-sepia", `${sepia}%`);
  if (hasAdjustment) {
    root.setAttribute("data-force-dark-filter", "true");
  } else {
    root.removeAttribute("data-force-dark-filter");
  }
}

function clearFilterVars() {
  const root = document.documentElement;
  root.style.removeProperty("--force-dark-brightness");
  root.style.removeProperty("--force-dark-contrast");
  root.style.removeProperty("--force-dark-sepia");
  root.removeAttribute("data-force-dark-filter");
}

function resolveEngine(config) {
  const engine = normalizeEngine(config?.engine);

  if (engine !== "auto" && engine !== "invert") {
    return engine;
  }

  // Inverting a page that is already dark turns it light again, so Invert is
  // skipped on natively dark pages just like Auto.
  const analysis = analyzePageForEngine();
  if (analysis.nativeDark) return "";
  return engine === "invert" ? "invert" : analysis.engine;
}

const CUSTOM_THEMES_KEY = "__customThemes";
const CUSTOM_CSS_KEY = "__css:" + host;
const SCHEDULE_STORAGE_KEY = "scheduleConfig";
const SCHEDULE_RECHECK_INTERVAL_MS = 60000;
let currentSiteConfig = null;
let currentUserThemes = [];
let currentCustomCss = "";
let currentSchedule = null;
let scheduleIntervalId = null;

function isWithinSchedule(schedule) {
  if (!schedule || !schedule.mode || schedule.mode === "off") return true;

  if (schedule.mode === "system") {
    return Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  }

  if (schedule.mode === "time") {
    return isWithinTimeWindow(schedule.start, schedule.end);
  }

  return true;
}

function isWithinTimeWindow(start, end) {
  const startMinutes = toMinutesSinceMidnight(start);
  const endMinutes = toMinutesSinceMidnight(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return true;
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // Overnight window, e.g. 20:00 - 07:00
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function toMinutesSinceMidnight(value) {
  const match = typeof value === "string" ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function applyEffectiveEngine() {
  if (!currentSiteConfig) {
    applyEngine(null);
    return;
  }

  applyEngine({
    ...currentSiteConfig,
    enabled: currentSiteConfig.enabled && isWithinSchedule(currentSchedule),
  });
}

function refreshScheduleTimer() {
  if (scheduleIntervalId) {
    clearInterval(scheduleIntervalId);
    scheduleIntervalId = null;
  }

  if (!currentSchedule || currentSchedule.mode === "off" || isInertFrame()) return;
  if (!IS_CHILD_FRAME) {
    scheduleIntervalId = setInterval(applyEffectiveEngine, SCHEDULE_RECHECK_INTERVAL_MS);
    return;
  }
  // Time and system schedules change without a storage event, so a child frame keeps a timer too, but it only
  // compares one boolean and re-runs the engine (and its page analysis) when the schedule state flips.
  let lastInside = isWithinSchedule(currentSchedule);
  scheduleIntervalId = setInterval(() => {
    const inside = isWithinSchedule(currentSchedule);
    if (inside === lastInside) return;
    lastInside = inside;
    applyEffectiveEngine();
  }, SCHEDULE_RECHECK_INTERVAL_MS);
}

function loadSiteConfig(callback) {
  chrome.storage.sync.get([host, CUSTOM_THEMES_KEY, CUSTOM_CSS_KEY], (result) => {
    // A failed read (chrome.runtime.lastError) passes no data: treat it as no config, so the page is not left
    // half-applied and the pre-paint bridge is removed.
    const data = result || {};
    currentSiteConfig = data[host] || null;
    currentUserThemes = Array.isArray(data[CUSTOM_THEMES_KEY]) ? data[CUSTOM_THEMES_KEY] : [];
    currentCustomCss = toCustomCss(data[CUSTOM_CSS_KEY]);
    callback();
  });
}

function loadSiteConfigAndApply() {
  loadSiteConfig(applyEffectiveEngine);
}

// Initial engine application: the global schedule and the per-site config are read at the same time
// (one storage round trip before the first paint instead of two) and applied once both have returned.
let initialReadsPending = 2;
const applyWhenInitialReadsDone = () => {
  initialReadsPending -= 1;
  if (initialReadsPending === 0) applyEffectiveEngine();
};

chrome.storage.local.get(SCHEDULE_STORAGE_KEY, (localData) => {
  currentSchedule = (localData && localData[SCHEDULE_STORAGE_KEY]) || null;
  refreshScheduleTimer();
  applyWhenInitialReadsDone();
});
loadSiteConfig(applyWhenInitialReadsDone);

// Re-evaluate Auto Mode engine on DOMContentLoaded if DOM was still loading at document_start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadSiteConfigAndApply, { once: true });
}

// A child frame that starts tiny or hidden (lazy embeds) is re-checked when it is resized, debounced.
if (IS_CHILD_FRAME) {
  let wasInert = isInertFrame();
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const inert = isInertFrame();
      if (inert === wasInert) return;
      wasInert = inert;
      refreshScheduleTimer();
      applyEffectiveEngine();
    }, 250);
  });
}

function toCustomCss(value) {
  return typeof value === "string" ? value : "";
}

chrome.storage.onChanged.addListener((changes, area) => {
  const cssChanged = area === "sync" && Boolean(changes[CUSTOM_CSS_KEY]);
  if (cssChanged) currentCustomCss = toCustomCss(changes[CUSTOM_CSS_KEY].newValue);

  if (area === "sync" && (changes[host] || changes[CUSTOM_THEMES_KEY])) {
    if (changes[host]) currentSiteConfig = changes[host].newValue || null;
    if (changes[CUSTOM_THEMES_KEY]) {
      const next = changes[CUSTOM_THEMES_KEY].newValue;
      currentUserThemes = Array.isArray(next) ? next : [];
    }
    applyEffectiveEngine();
  } else if (cssChanged) {
    // A CSS-only change swaps the style element without rebuilding the engine.
    if (hasActiveEngineStyle()) applyCustomCss(currentCustomCss);
    else removeCustomCss();
  }

  if (area === "local" && changes[SCHEDULE_STORAGE_KEY]) {
    currentSchedule = changes[SCHEDULE_STORAGE_KEY].newValue || null;
    refreshScheduleTimer();
    applyEffectiveEngine();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "APPLY_CONFIG") {
    currentSiteConfig = msg.config || null;
    applyEffectiveEngine();
  }

  // Data-returning requests are answered by the top frame only (the panel also sends them to frameId 0): a
  // child frame replying first would hand back an iframe's address or analysis. It never calls sendResponse.
  if (IS_CHILD_FRAME) return;

  if (msg.type === "ANALYZE_PAGE") {
    sendResponse(analyzePageForEngine());
  }

  // The side panel stays open across tabs and Chrome hides a tab's address from it, so it asks the page.
  // The answer goes only to the extension's own panel and is never sent anywhere else.
  if (msg.type === "PAGE_INFO") {
    sendResponse({ href: location.href });
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
      confidence: darkSurfaceRatio >= 0.75 ? "high" : "medium",
      reason: "site already appears dark",
      nativeDark: true,
      signals,
    };
  }

  // Pure media / photo galleries without heavy textual/app UI
  if (
    mediaAreaRatio >= 0.55 &&
    textRatio < 0.15 &&
    lightSurfaceRatio >= 0.30
  ) {
    return {
      engine: "invert",
      confidence: "medium",
      reason: "best for media gallery layouts",
      nativeDark: false,
      signals,
    };
  }

  // For almost all modern web apps, websites, text, and SPAs, CSS engine is safest
  return {
    engine: FALLBACK_ENGINE,
    confidence: lightSurfaceRatio >= 0.35 || textRatio >= 0.2 ? "high" : "medium",
    reason: "best for layout stability & readability",
    nativeDark: false,
    signals,
  };
}

// `color-scheme: light dark` only says the page *supports* both schemes. It is
// dark only when it declares dark alone, or the browser itself prefers dark.
function colorSchemeResolvesToDark(scheme) {
  const tokens = String(scheme || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.includes("dark")) return false;
  if (!tokens.includes("light")) return true;
  return Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
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

  const htmlEl = document.documentElement;
  const bodyEl = document.body;
  const hasDarkAttr =
    htmlEl.hasAttribute("dark") ||
    htmlEl.getAttribute("data-theme") === "dark" ||
    htmlEl.getAttribute("data-mode") === "dark" ||
    htmlEl.getAttribute("data-color-mode") === "dark" ||
    htmlEl.classList.contains("dark") ||
    htmlEl.classList.contains("dark-theme") ||
    htmlEl.classList.contains("theme-dark") ||
    (bodyEl && (
      bodyEl.hasAttribute("dark") ||
      bodyEl.getAttribute("data-theme") === "dark" ||
      bodyEl.getAttribute("data-mode") === "dark" ||
      bodyEl.classList.contains("dark") ||
      bodyEl.classList.contains("dark-theme") ||
      bodyEl.classList.contains("theme-dark")
    ));

  const declaresDarkScheme =
    colorSchemeResolvesToDark(rootColorScheme) ||
    colorSchemeResolvesToDark(bodyColorScheme) ||
    hasDarkAttr;

  const hasDarkRoot =
    (rootBackground &&
      rootBackground.a > 0.35 &&
      getLuminance(rootBackground) < 0.28) ||
    (bodyBackground &&
      bodyBackground.a > 0.35 &&
      getLuminance(bodyBackground) < 0.28);

  // Check top-level app containers (like YouTube ytd-app, #app, #root, main)
  let hasDarkAppContainer = false;
  if (!hasDarkRoot) {
    const mainContainer = document.querySelector("ytd-app, #app, #root, #__next, main, #main");
    if (mainContainer) {
      const containerBg = parseCssColor(getComputedStyle(mainContainer).backgroundColor);
      if (containerBg && containerBg.a > 0.35 && getLuminance(containerBg) < 0.28) {
        hasDarkAppContainer = true;
      }
    }
  }

  // If too many light surfaces exist, it's not a dark page
  if (lightSurfaceRatio > 0.25) return false;

  // What the browser actually paints behind the page decides it. Declaring
  // support for a dark scheme (or the OS preferring dark) means nothing when
  // the site paints an opaque light canvas, as many sites do. The html
  // background wins; the body's only counts when html is transparent.
  const canvasBackground =
    rootBackground && rootBackground.a > 0.35
      ? rootBackground
      : bodyBackground && bodyBackground.a > 0.35
        ? bodyBackground
        : null;
  if (canvasBackground && getLuminance(canvasBackground) > 0.55) return false;

  // If site declares dark mode or has dark root/app container, and dark surfaces dominate
  if (declaresDarkScheme && (darkSurfaceRatio >= 0.55 || hasDarkRoot || hasDarkAppContainer)) {
    return true;
  }

  if ((hasDarkRoot || hasDarkAppContainer) && darkSurfaceRatio >= 0.60) {
    return true;
  }

  return false;
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
    document.querySelectorAll("img, video, canvas, iframe, embed, object")
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
