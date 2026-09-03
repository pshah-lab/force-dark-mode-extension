document.addEventListener("DOMContentLoaded", async () => {
  const button = document.getElementById("toggle");
  const label = button.querySelector(".label");
  const site = document.getElementById("site");
  const recommendation = document.getElementById("recommendation");
  const backgroundColorInput = document.getElementById("background-color");
  const openPdfViewerButton = document.getElementById("open-pdf-viewer");
  const openDocumentViewerButton = document.getElementById("open-document-viewer");
  const radios = document.querySelectorAll('input[name="engine"]');
  const defaultBackgroundColor = "#0f1115";
  const defaultEngine = "auto";
  const hexColorPattern = /^#[0-9a-f]{6}$/i;
  let colorDebounceTimer = null;
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

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
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
    backgroundColor = defaultBackgroundColor
  ) {
    button.classList.toggle("active", enabled);
    label.textContent = enabled ? "Dark mode enabled" : "Enable dark mode";
    backgroundColorInput.value = normalizeColor(backgroundColor);
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes[host]) return;

    const config = changes[host].newValue || {};
    updateToggleUI(
      config.enabled === true,
      config.engine || defaultEngine,
      config.backgroundColor || defaultBackgroundColor
    );
  });

  function updateUI() {
    chrome.storage.sync.get(host, (data) => {
      const config = data[host] || {};
      const hasSavedConfig = Boolean(data[host]?.engine);
      const enabled = config.enabled === true;
      const engine = config.engine || defaultEngine;
      const backgroundColor = config.backgroundColor || defaultBackgroundColor;

      updateToggleUI(enabled, engine, backgroundColor);
      requestRecommendation(hasSavedConfig);
    });
  }

  button.onclick = () => {
    const selectedEngine = getSelectedEngine();
    const backgroundColor = normalizeColor(backgroundColorInput.value);

    chrome.storage.sync.get(host, (data) => {
      const currentlyEnabled = data[host]?.enabled === true;
      const nextEnabled = !currentlyEnabled;

      updateToggleUI(nextEnabled, selectedEngine, backgroundColor);

      chrome.runtime.sendMessage({
        type: "TOGGLE",
        tabId: tab.id,
        url: tab.url,
        engine: selectedEngine,
        backgroundColor,
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
          url: tab.url,
          engine: radio.value,
          backgroundColor: normalizeColor(backgroundColorInput.value),
          forceEnabled: enabled,
        });
      });
    };
  });

  backgroundColorInput.oninput = () => {
    const backgroundColor = normalizeColor(backgroundColorInput.value);

    if (colorDebounceTimer) {
      clearTimeout(colorDebounceTimer);
    }

    colorDebounceTimer = setTimeout(() => {
      chrome.storage.sync.get(host, (data) => {
        const enabled = data[host]?.enabled === true;

        chrome.runtime.sendMessage({
          type: "TOGGLE",
          tabId: tab.id,
          url: tab.url,
          engine: getSelectedEngine(),
          backgroundColor,
          forceEnabled: enabled,
        });
      });
    }, 200);
  };

  updateUI();
});
