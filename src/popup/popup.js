document.addEventListener("DOMContentLoaded", async () => {
  const button = document.getElementById("toggle");
  const label = button.querySelector(".label");
  const site = document.getElementById("site");
  const shortcutHint = document.getElementById("shortcut-hint");
  const recommendation = document.getElementById("recommendation");
  const backgroundColorInput = document.getElementById("background-color");
  const brightnessInput = document.getElementById("brightness");
  const contrastInput = document.getElementById("contrast");
  const sepiaInput = document.getElementById("sepia");
  const resetFiltersButton = document.getElementById("reset-filters");
  const openPdfViewerButton = document.getElementById("open-pdf-viewer");
  const openDocumentViewerButton = document.getElementById("open-document-viewer");
  const themeSelect = document.getElementById("theme-select");
  const radios = document.querySelectorAll('input[name="engine"]');
  const defaultBackgroundColor = "#0f1115";
  const defaultEngine = "auto";
  const defaultFilters = { brightness: 100, contrast: 100, sepia: 0 };
  const hexColorPattern = /^#[0-9a-f]{6}$/i;
  let colorDebounceTimer = null;
  let filterDebounceTimer = null;
  let userHasInteractedWithEngine = false;

  const engineLabels = {
    auto: "Auto Engine",
    css: "CSS Engine",
    invert: "Invert Engine",
  };

  const restrictedProtocols = new Set([
    "about:",
    "chrome:",
    "chrome-extension:",
    "edge:",
    "moz-extension:",
    "opera:",
    "view-source:",
  ]);

  const feedbackCard = document.getElementById("feedback-prompt");
  const feedbackStore = {
    read: () =>
      new Promise((resolve) =>
        chrome.storage.local.get(FeedbackPrompt.STATE_KEY, (d) =>
          resolve(d?.[FeedbackPrompt.STATE_KEY])
        )
      ),
    write: (state) =>
      new Promise((resolve) =>
        chrome.storage.local.set({ [FeedbackPrompt.STATE_KEY]: state }, resolve)
      ),
  };
  let feedbackState = FeedbackPrompt.recordOpen(await feedbackStore.read());
  await feedbackStore.write(feedbackState);
  feedbackCard.hidden = !FeedbackPrompt.shouldShow(feedbackState);

  const settleFeedback = async (next) => {
    feedbackState = next(feedbackState);
    feedbackCard.hidden = true;
    await feedbackStore.write(feedbackState);
  };
  document.getElementById("feedback-later").onclick = () => settleFeedback(FeedbackPrompt.snooze);
  document.getElementById("feedback-never").onclick = () => settleFeedback(FeedbackPrompt.finish);
  document.getElementById("feedback-rate").addEventListener("click", () => settleFeedback(FeedbackPrompt.finish));
  document.getElementById("feedback-report").addEventListener("click", () => settleFeedback(FeedbackPrompt.finish));

  // Opt-in usage stats card. Runs on its own and never awaited, so a storage or worker failure
  // can never break the rest of the popup.
  initTelemetryCard(feedbackCard).catch((err) => console.warn("Usage stats card unavailable:", err));

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  chrome.commands.getAll((commands) => {
    const shortcut = commands.find((c) => c.name === "toggle-dark-mode")?.shortcut;
    if (shortcut) {
      shortcutHint.replaceChildren();
      shortcutHint.append("Shortcut: ");
      const kbd = document.createElement("kbd");
      kbd.textContent = shortcut;
      shortcutHint.append(kbd);
      shortcutHint.append(" · right-click a page to toggle too");
      shortcutHint.hidden = false;
    }

    const viewerShortcut = commands.find((c) => c.name === "open-file-viewer")?.shortcut;
    if (viewerShortcut) {
      openDocumentViewerButton.title = `Shortcut: ${viewerShortcut}`;
    }

    const currentDocShortcut = commands.find(
      (c) => c.name === "open-current-document-in-viewer"
    )?.shortcut;
    if (currentDocShortcut) {
      openPdfViewerButton.title = `Shortcut: ${currentDocShortcut}`;
    }
  });

  openDocumentViewerButton.onclick = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/viewer/viewer.html"),
    });
  };

  function setUnavailable(text = "Unavailable on this page") {
    site.textContent = "Restricted page";
    recommendation.hidden = true;
    button.disabled = true;
    label.textContent = text;
    button.classList.remove("active");
    backgroundColorInput.disabled = true;
    brightnessInput.disabled = true;
    contrastInput.disabled = true;
    sepiaInput.disabled = true;
    resetFiltersButton.disabled = true;
    themeSelect.disabled = true;
    radios.forEach((radio) => {
      radio.disabled = true;
    });
  }

  if (!tab?.url) {
    setUnavailable();
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(tab.url);
  } catch {
    setUnavailable();
    return;
  }

  const isLocalFile = parsedUrl.protocol === "file:";
  if (restrictedProtocols.has(parsedUrl.protocol) || (!parsedUrl.hostname && !isLocalFile)) {
    setUnavailable();
    return;
  }

  const host = isLocalFile ? "local_files" : parsedUrl.hostname;
  site.textContent = isLocalFile ? "Local Files" : host;

  const siteCssLink = document.getElementById("site-css-link");
  if (siteCssLink) {
    siteCssLink.hidden = false;
    siteCssLink.onclick = (event) => {
      event.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") + "#css=" + encodeURIComponent(host) });
    };
  }

  if (isPdfUrl(parsedUrl)) {
    openPdfViewerButton.hidden = false;
    openPdfViewerButton.onclick = () => {
      const viewerUrl = new URL(chrome.runtime.getURL("src/viewer/viewer.html"));
      viewerUrl.searchParams.set("src", tab.url);
      viewerUrl.searchParams.set("name", getNameFromUrl(parsedUrl) || "PDF document");
      chrome.tabs.create({ url: viewerUrl.href });
    };
  }

  function updateToggleUI(
    enabled,
    engine = defaultEngine,
    backgroundColor = defaultBackgroundColor,
    filters = defaultFilters
  ) {
    button.classList.toggle("active", enabled);
    label.textContent = enabled ? "Dark mode enabled" : "Enable dark mode";
    backgroundColorInput.value = normalizeColor(backgroundColor);
    brightnessInput.value = normalizeFilterValue("brightness", filters.brightness);
    contrastInput.value = normalizeFilterValue("contrast", filters.contrast);
    sepiaInput.value = normalizeFilterValue("sepia", filters.sepia);
    if (!userHasInteractedWithEngine) {
      radios.forEach((radio) => {
        radio.checked = radio.value === engine;
      });
    }
  }

  function getSelectedEngine() {
    return (
      document.querySelector('input[name="engine"]:checked')?.value ||
      defaultEngine
    );
  }

  function normalizeColor(color) {
    return hexColorPattern.test(color || "") ? color.toLowerCase() : defaultBackgroundColor;
  }

  function normalizeFilterValue(name, value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : defaultFilters[name];
  }

  function getFilterValues() {
    return {
      brightness: normalizeFilterValue("brightness", brightnessInput.value),
      contrast: normalizeFilterValue("contrast", contrastInput.value),
      sepia: normalizeFilterValue("sepia", sepiaInput.value),
    };
  }

  function isPdfUrl(url) {
    return (
      url.pathname.toLowerCase().endsWith(".pdf") ||
      url.search.toLowerCase().includes(".pdf")
    );
  }

  function getNameFromUrl(url) {
    const name = url.pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : "";
  }

  function showRecommendation(analysis) {
    const engineLabel = analysis.nativeDark
      ? "No change needed"
      : engineLabels[analysis.engine] || engineLabels.css;
    const confidence = `${analysis.confidence || "low"} confidence`;
    recommendation.hidden = false;

    recommendation.replaceChildren();
    recommendation.append("Auto: ");

    const strong = document.createElement("strong");
    strong.textContent = engineLabel;
    recommendation.append(strong);

    recommendation.append(` · ${analysis.reason || "CSS is the safer default"} `);

    const span = document.createElement("span");
    span.className = "confidence";
    span.textContent = `(${confidence})`;
    recommendation.append(span);
  }

  function showRecommendationUnavailable() {
    recommendation.hidden = false;
    recommendation.textContent = "Recommendation unavailable";
  }

  function requestRecommendation(hasSavedConfig) {
    if (!tab.id) {
      showRecommendationUnavailable();
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "ANALYZE_PAGE" }, (analysis) => {
      if (chrome.runtime.lastError || !isValidAnalysis(analysis)) {
        showRecommendationUnavailable();
        return;
      }

      showRecommendation(analysis);

      if (!hasSavedConfig && !userHasInteractedWithEngine) {
        updateSelectedEngine(defaultEngine);
      }
    });
  }

  function updateSelectedEngine(engine) {
    radios.forEach((radio) => {
      radio.checked = radio.value === engine;
    });
  }

  function isValidAnalysis(analysis) {
    return (
      analysis &&
      (analysis.engine === "css" || analysis.engine === "invert") &&
      ["high", "medium", "low"].includes(analysis.confidence) &&
      typeof analysis.nativeDark === "boolean"
    );
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  }

  function fillThemeOptions(userThemes) {
    const finder = ForceDarkThemes.findSitePack;
    const pack = typeof finder === "function" ? finder(host) : null;
    const options = ForceDarkThemes.buildThemeOptions(userThemes, pack);
    const groups = new Map();
    themeSelect.replaceChildren();
    for (const entry of options) {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label;
      if (!entry.group) {
        themeSelect.append(option);
        continue;
      }
      let optgroup = groups.get(entry.group);
      if (!optgroup) {
        optgroup = document.createElement("optgroup");
        optgroup.label = entry.group;
        groups.set(entry.group, optgroup);
        themeSelect.append(optgroup);
      }
      optgroup.append(option);
    }
  }

  function selectTheme(themeId) {
    const wanted = typeof themeId === "string" ? themeId : "";
    const known = Array.from(themeSelect.options).some((option) => option.value === wanted);
    themeSelect.value = known ? wanted : "";
  }

  themeSelect.onchange = () => {
    const themeId = themeSelect.value;
    chrome.storage.sync.get(host, (data) => {
      const enabled = data[host]?.enabled === true;

      chrome.runtime.sendMessage({
        type: "TOGGLE",
        tabId: tab.id,
        host,
        engine: getSelectedEngine(),
        backgroundColor: normalizeColor(backgroundColorInput.value),
        themeId,
        forceEnabled: enabled,
        ...getFilterValues(),
      });
    });
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes[host]) return;

    const config = changes[host].newValue || {};
    selectTheme(config.themeId);
    updateToggleUI(
      config.enabled === true,
      config.engine || defaultEngine,
      config.backgroundColor || defaultBackgroundColor,
      config
    );
  });

  function updateUI() {
    chrome.storage.sync.get([host, "__customThemes"], (data) => {
      const config = data[host] || {};
      fillThemeOptions(data.__customThemes);
      selectTheme(config.themeId);
      const hasSavedConfig = Boolean(data[host]?.engine);
      const enabled = config.enabled === true;
      const engine = config.engine || defaultEngine;
      const backgroundColor = config.backgroundColor || defaultBackgroundColor;

      updateToggleUI(enabled, engine, backgroundColor, config);
      requestRecommendation(hasSavedConfig);
    });
  }

  button.onclick = () => {
    const selectedEngine = getSelectedEngine();
    const backgroundColor = normalizeColor(backgroundColorInput.value);
    const filters = getFilterValues();

    chrome.storage.sync.get(host, (data) => {
      const currentlyEnabled = data[host]?.enabled === true;
      const nextEnabled = !currentlyEnabled;

      updateToggleUI(nextEnabled, selectedEngine, backgroundColor, filters);

      chrome.runtime.sendMessage({
        type: "TOGGLE",
        tabId: tab.id,
        host,
        engine: selectedEngine,
        backgroundColor,
        ...filters,
      });
    });
  };

  radios.forEach((radio) => {
    radio.onchange = () => {
      userHasInteractedWithEngine = true;
      chrome.storage.sync.get(host, (data) => {
        const enabled = data[host]?.enabled === true;

        chrome.runtime.sendMessage({
          type: "TOGGLE",
          tabId: tab.id,
          host,
          engine: radio.value,
          backgroundColor: normalizeColor(backgroundColorInput.value),
          forceEnabled: enabled,
          ...getFilterValues(),
        });
      });
    };
  });

  // Picking a colour means "use this colour": switch to Default colour so a selected
  // theme or a site pack theme never hides it.
  backgroundColorInput.oninput = () => {
    const backgroundColor = normalizeColor(backgroundColorInput.value);
    selectTheme("default");

    if (colorDebounceTimer) {
      clearTimeout(colorDebounceTimer);
    }

    colorDebounceTimer = setTimeout(() => {
      chrome.storage.sync.get(host, (data) => {
        const enabled = data[host]?.enabled === true;

        chrome.runtime.sendMessage({
          type: "TOGGLE",
          tabId: tab.id,
          host,
          engine: getSelectedEngine(),
          backgroundColor,
          themeId: "default",
          forceEnabled: enabled,
          ...getFilterValues(),
        });
      });
    }, 200);
  };

  function sendFilterUpdate() {
    if (filterDebounceTimer) {
      clearTimeout(filterDebounceTimer);
    }

    filterDebounceTimer = setTimeout(() => {
      chrome.storage.sync.get(host, (data) => {
        const enabled = data[host]?.enabled === true;

        chrome.runtime.sendMessage({
          type: "TOGGLE",
          tabId: tab.id,
          host,
          engine: getSelectedEngine(),
          backgroundColor: normalizeColor(backgroundColorInput.value),
          forceEnabled: enabled,
          ...getFilterValues(),
        });
      });
    }, 200);
  }

  [brightnessInput, contrastInput, sepiaInput].forEach((input) => {
    input.oninput = sendFilterUpdate;
  });

  resetFiltersButton.onclick = () => {
    brightnessInput.value = defaultFilters.brightness;
    contrastInput.value = defaultFilters.contrast;
    sepiaInput.value = defaultFilters.sepia;
    sendFilterUpdate();
  };

  updateUI();
});

// Opt-in usage stats card: only when the feedback card is not showing. Nothing is sent
// unless the user clicks Yes; the background worker owns all telemetry state.
async function initTelemetryCard(feedbackCard) {
  const telemetryCard = document.getElementById("telemetry-prompt");
  const telemetryStore = {
    read: () =>
      new Promise((resolve) =>
        chrome.storage.local.get(TelemetryPrompt.STATE_KEY, (d) =>
          resolve(d?.[TelemetryPrompt.STATE_KEY])
        )
      ),
    write: (state) =>
      new Promise((resolve) =>
        chrome.storage.local.set({ [TelemetryPrompt.STATE_KEY]: state }, resolve)
      ),
  };
  let telemetryState = TelemetryPrompt.recordOpen(await telemetryStore.read());
  await telemetryStore.write(telemetryState);
  telemetryCard.hidden = !(feedbackCard.hidden && TelemetryPrompt.shouldShow(telemetryState));

  const settleTelemetry = async (enable) => {
    telemetryState = TelemetryPrompt.decide(telemetryState);
    telemetryCard.hidden = true;
    await telemetryStore.write(telemetryState);
    if (enable) {
      try {
        await chrome.runtime.sendMessage({ type: "TELEMETRY_CONSENT", enabled: true });
      } catch (err) {
        console.warn("Could not enable usage stats:", err);
      }
    }
  };
  document.getElementById("telemetry-yes").addEventListener("click", () => settleTelemetry(true));
  document.getElementById("telemetry-no").addEventListener("click", () => settleTelemetry(false));
}
