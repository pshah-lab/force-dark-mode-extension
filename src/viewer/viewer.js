import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  "src/viewer/vendor/pdf.worker.min.mjs"
);

const DEFAULT_VIEWER_SETTINGS = {
  mode: "smart",
  backgroundColor: "#0f1115",
  textColor: "#e8eaed",
  fontSize: 17,
  contrast: 105,
};
const VIEWER_STORAGE_KEY = "__force_dark_viewer__";
const VALID_MODES = new Set(["smart", "invert", "sepia", "original"]);
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const ALLOWED_DOCUMENT_PROTOCOLS = new Set([
  "http:",
  "https:",
  "blob:",
  "file:",
]);
const PDF_MIN_RENDER_SCALE = 2.75;
const PDF_MAX_RENDER_SCALE = 4;

const viewer = document.getElementById("viewer");
const emptyState = document.getElementById("empty-state");
const pdfRenderPanel = document.getElementById("pdf-render-panel");
const pdfStatus = document.getElementById("pdf-status");
const pdfPages = document.getElementById("pdf-pages");
const pdfPanel = document.getElementById("pdf-panel");
const documentPanel = document.getElementById("document-panel");
const pdfFrame = document.getElementById("pdf-frame");
const pdfFallbackLink = document.getElementById("pdf-fallback-link");
const documentName = document.getElementById("document-name");
const modeInput = document.getElementById("mode");
const backgroundColorInput = document.getElementById("background-color");
const textColorInput = document.getElementById("text-color");
const fontSizeInput = document.getElementById("font-size");
const contrastInput = document.getElementById("contrast");
const openFileButton = document.getElementById("open-file");
const fileInput = document.getElementById("file-input");

let currentObjectUrl = "";
let currentPdfSource = null;
let currentPdfName = "";
let renderGeneration = 0;

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getViewerSettings();
  applySettings(settings);
  bindControls();
  loadInitialDocument();
});

function bindControls() {
  modeInput.onchange = persistCurrentSettingsAndRerenderPdf;
  backgroundColorInput.oninput = persistCurrentSettingsAndRerenderPdf;
  textColorInput.oninput = persistCurrentSettingsAndRerenderPdf;
  fontSizeInput.oninput = persistCurrentSettings;
  contrastInput.oninput = persistCurrentSettingsAndRerenderPdf;

  openFileButton.onclick = () => {
    fileInput.click();
  };

  fileInput.onchange = () => {
    const [file] = fileInput.files || [];
    if (file) {
      openLocalFile(file);
    }
  };
}

function isSafeDocumentUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url, location.href);
    return ALLOWED_DOCUMENT_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function loadInitialDocument() {
  const params = new URLSearchParams(location.search);
  const source = params.get("src");
  const name = params.get("name");

  if (source && isSafeDocumentUrl(source)) {
    openPdf(source, name || getNameFromUrl(source) || "PDF document");
  } else if (source) {
    showEmptyState("Invalid or disallowed document URL");
  }
}

async function openLocalFile(file) {
  revokeCurrentObjectUrl();

  if (isPdfFile(file)) {
    const data = new Uint8Array(await file.arrayBuffer());
    currentObjectUrl = URL.createObjectURL(file);
    openPdf(data, file.name, currentObjectUrl);
    return;
  }

  if (isReadableDocument(file)) {
    const text = await file.text();
    openTextDocument(text, file.name);
    return;
  }

  showEmptyState(`${file.name} is not supported yet`);
}

async function openPdf(source, name, fallbackSource = source) {
  currentPdfSource = source;
  currentPdfName = name;
  renderGeneration += 1;
  const generation = renderGeneration;

  showPanel("pdf-render");
  documentName.textContent = name;
  pdfStatus.hidden = false;
  pdfStatus.textContent = "Loading PDF...";
  pdfPages.replaceChildren();
  pdfFrame.removeAttribute("src");

  try {
    const task = pdfjsLib.getDocument(getPdfDocumentSource(source));
    const pdf = await task.promise;

    if (generation !== renderGeneration) return;

    pdfStatus.textContent = `Rendering ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}...`;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (generation !== renderGeneration) return;
      await renderPdfPage(pdf, pageNumber, generation);
    }

    if (generation !== renderGeneration) return;
    pdfStatus.hidden = true;
  } catch (error) {
    console.warn("[ForceDark] PDF.js render failed:", error);
    openPdfFallback(fallbackSource, name);
  }
}

function openPdfFallback(source, name) {
  if (typeof source === "string" && !isSafeDocumentUrl(source)) {
    showEmptyState("Blocked unsafe document source");
    return;
  }

  showPanel("pdf");
  documentName.textContent = name;
  if (typeof source === "string") {
    pdfFrame.src = source;
    pdfFallbackLink.href = source;
    pdfFallbackLink.textContent = "Open original PDF";
  } else {
    pdfFrame.removeAttribute("src");
    pdfFallbackLink.removeAttribute("href");
  }
}

function openTextDocument(text, name) {
  showPanel("document");
  documentName.textContent = name;
  if (isMarkdownName(name)) {
    documentPanel.innerHTML = renderMarkdown(text);
    return;
  }

  documentPanel.textContent = normalizeDocumentText(text, name);
}

function showEmptyState(message) {
  showPanel("empty");
  documentName.textContent = message;
}

function showPanel(panel) {
  emptyState.hidden = panel !== "empty";
  pdfRenderPanel.hidden = panel !== "pdf-render";
  pdfPanel.hidden = panel !== "pdf";
  documentPanel.hidden = panel !== "document";
}

function getPdfDocumentSource(source) {
  const verbosity = pdfjsLib.VerbosityLevel?.ERRORS ?? 0;

  if (source instanceof Uint8Array) {
    return {
      data: source.slice(),
      verbosity,
    };
  }

  return {
    url: source,
    verbosity,
    withCredentials: false,
    disableAutoFetch: false,
    disableStream: false,
  };
}

async function renderPdfPage(pdf, pageNumber, generation) {
  const page = await pdf.getPage(pageNumber);
  if (generation !== renderGeneration) return;

  const settings = getCurrentSettings();
  const viewport = page.getViewport({ scale: getPageScale(page) });
  const outputScale = getPdfOutputScale();
  const wrapper = document.createElement("section");
  const pageContent = document.createElement("div");
  const label = document.createElement("div");
  const canvas = document.createElement("canvas");
  const textLayer = document.createElement("div");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  wrapper.className = "pdf-page";
  pageContent.className = "pdf-page-content";
  pageContent.style.width = `${viewport.width}px`;
  pageContent.style.height = `${viewport.height}px`;
  label.className = "pdf-page-label";
  label.textContent = `Page ${pageNumber}`;
  textLayer.className = "textLayer pdf-text-layer";
  textLayer.style.width = `${viewport.width}px`;
  textLayer.style.height = `${viewport.height}px`;
  textLayer.style.setProperty("--total-scale-factor", String(viewport.scale));
  canvas.width = Math.ceil(viewport.width * outputScale);
  canvas.height = Math.ceil(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  pageContent.append(canvas, textLayer);
  wrapper.append(label, pageContent);
  pdfPages.appendChild(wrapper);

  await page.render({
    canvas: null,
    canvasContext: context,
    viewport,
    transform:
      outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
    background:
      settings.mode === "smart" ? settings.backgroundColor : "rgb(255, 255, 255)",
    pageColors: getPdfPageColors(settings),
  }).promise;

  if (generation !== renderGeneration) return;
  transformPdfCanvas(canvas, settings);
  await renderPdfTextLayer(page, viewport, textLayer, generation);
}

function getPageScale(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.min(window.innerWidth - 48, 1100);
  const fitScale = availableWidth / baseViewport.width;
  return clampNumber(fitScale, 0.9, 1.65, 1.2);
}

function getPdfOutputScale() {
  return clampNumber(
    window.devicePixelRatio || 1,
    PDF_MIN_RENDER_SCALE,
    PDF_MAX_RENDER_SCALE,
    PDF_MIN_RENDER_SCALE
  );
}

function getPdfPageColors(settings) {
  if (settings.mode !== "smart") return null;

  return {
    background: settings.backgroundColor,
    foreground: settings.textColor,
  };
}

async function renderPdfTextLayer(page, viewport, container, generation) {
  if (!pdfjsLib.TextLayer) {
    container.remove();
    return;
  }

  try {
    const textContent = await page.getTextContent({ includeMarkedContent: true });

    if (generation !== renderGeneration) return;

    if (!textContent.items?.length) {
      container.remove();
      return;
    }

    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container,
      viewport,
    });

    await textLayer.render();

    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;
  } catch (error) {
    container.remove();
    console.debug("[ForceDark] PDF text layer unavailable:", error);
  }
}

function transformPdfCanvas(canvas, settings) {
  if (settings.mode === "original" || settings.mode === "smart") return;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const background = hexToRgb(settings.backgroundColor);
  const text = hexToRgb(settings.textColor);
  const contrast = settings.contrast / 100;

  for (let index = 0; index < data.length; index += 4) {
    const pixel = {
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
    };

    const transformed = transformPixel(pixel, settings.mode, {
      background,
      text,
      contrast,
    });

    data[index] = transformed.r;
    data[index + 1] = transformed.g;
    data[index + 2] = transformed.b;
  }

  context.putImageData(image, 0, 0);
}

function transformPixel(pixel, mode, palette) {
  if (mode === "invert") {
    return applyContrast(
      {
        r: 255 - pixel.r,
        g: 255 - pixel.g,
        b: 255 - pixel.b,
      },
      palette.contrast
    );
  }

  if (mode === "sepia") {
    return transformSepiaPixel(pixel);
  }

  return transformSmartPixel(pixel, palette);
}

function transformSmartPixel(pixel, { background, text, contrast }) {
  const hsl = rgbToHsl(pixel);
  const luminance = getRelativeLuminance(pixel);

  if (hsl.s > 0.32 && luminance > 0.18 && luminance < 0.88) {
    return applyContrast(dimColor(pixel, 0.82), contrast);
  }

  if (luminance > 0.78) {
    return mixRgb(background, text, (1 - luminance) * 0.16);
  }

  if (luminance < 0.35) {
    return mixRgb(text, background, 0.08 + luminance * 0.28);
  }

  return applyContrast(
    mixRgb(background, text, 1 - Math.min(Math.max(luminance, 0.2), 0.86)),
    contrast
  );
}

function transformSepiaPixel(pixel) {
  const luminance = getRelativeLuminance(pixel);
  const background = { r: 36, g: 30, b: 23 };
  const text = { r: 240, g: 221, b: 193 };
  const preserveColor = rgbToHsl(pixel).s > 0.36 && luminance > 0.18 && luminance < 0.82;

  if (preserveColor) {
    return dimColor(pixel, 0.78);
  }

  return mixRgb(text, background, luminance);
}

async function persistCurrentSettingsAndRerenderPdf() {
  await persistCurrentSettings();

  if (!currentPdfSource) return;

  openPdf(currentPdfSource, currentPdfName, currentObjectUrl || currentPdfSource);
}

function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isReadableDocument(file) {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".rtf")
  );
}

function normalizeDocumentText(text, name) {
  if (!name.toLowerCase().endsWith(".rtf")) {
    return text;
  }

  return text
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isMarkdownName(name) {
  const lowerName = name.toLowerCase();
  return lowerName.endsWith(".md") || lowerName.endsWith(".markdown");
}

function renderMarkdown(text) {
  const lines = escapeHtml(text).split("\n");
  let inList = false;
  const output = [];

  lines.forEach((line) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const listItem = line.match(/^[-*]\s+(.+)$/);

    if (heading) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }

      output.push(`<h${heading[1].length}>${formatInlineMarkdown(heading[2])}</h${heading[1].length}>`);
      return;
    }

    if (listItem) {
      if (!inList) {
        output.push("<ul>");
        inList = true;
      }

      output.push(`<li>${formatInlineMarkdown(listItem[1])}</li>`);
      return;
    }

    if (inList) {
      output.push("</ul>");
      inList = false;
    }

    if (!line.trim()) {
      output.push("");
      return;
    }

    output.push(`<p>${formatInlineMarkdown(line)}</p>`);
  });

  if (inList) {
    output.push("</ul>");
  }

  return output.join("\n");
}

function formatInlineMarkdown(value) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
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

async function persistCurrentSettings() {
  const settings = getCurrentSettings();
  applySettings(settings);
  await setViewerSettings(settings);
}

function getCurrentSettings() {
  const mode = VALID_MODES.has(modeInput.value)
    ? modeInput.value
    : DEFAULT_VIEWER_SETTINGS.mode;

  return {
    mode,
    backgroundColor: normalizeColor(
      backgroundColorInput.value,
      DEFAULT_VIEWER_SETTINGS.backgroundColor
    ),
    textColor: normalizeColor(textColorInput.value, DEFAULT_VIEWER_SETTINGS.textColor),
    fontSize: clampNumber(
      Number.parseInt(fontSizeInput.value, 10),
      14,
      24,
      DEFAULT_VIEWER_SETTINGS.fontSize
    ),
    contrast: clampNumber(
      Number.parseInt(contrastInput.value, 10),
      80,
      135,
      DEFAULT_VIEWER_SETTINGS.contrast
    ),
  };
}

function applySettings(settings) {
  const normalized = normalizeSettings(settings);

  modeInput.value = normalized.mode;
  backgroundColorInput.value = normalized.backgroundColor;
  textColorInput.value = normalized.textColor;
  fontSizeInput.value = String(normalized.fontSize);
  contrastInput.value = String(normalized.contrast);

  viewer.dataset.mode = normalized.mode;
  document.documentElement.style.setProperty(
    "--viewer-bg",
    normalized.backgroundColor
  );
  document.documentElement.style.setProperty("--viewer-text", normalized.textColor);
  document.documentElement.style.setProperty(
    "--viewer-font-size",
    `${normalized.fontSize}px`
  );
  document.documentElement.style.setProperty(
    "--viewer-contrast",
    `${normalized.contrast}%`
  );
}

function normalizeSettings(settings = {}) {
  return {
    mode: VALID_MODES.has(settings.mode)
      ? settings.mode
      : DEFAULT_VIEWER_SETTINGS.mode,
    backgroundColor: normalizeColor(
      settings.backgroundColor,
      DEFAULT_VIEWER_SETTINGS.backgroundColor
    ),
    textColor: normalizeColor(settings.textColor, DEFAULT_VIEWER_SETTINGS.textColor),
    fontSize: clampNumber(
      Number(settings.fontSize),
      14,
      24,
      DEFAULT_VIEWER_SETTINGS.fontSize
    ),
    contrast: clampNumber(
      Number(settings.contrast),
      80,
      135,
      DEFAULT_VIEWER_SETTINGS.contrast
    ),
  };
}

function getViewerSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(VIEWER_STORAGE_KEY, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[ForceDark] Viewer settings get error:",
          chrome.runtime.lastError.message
        );
        resolve(DEFAULT_VIEWER_SETTINGS);
        return;
      }

      resolve(normalizeSettings(data[VIEWER_STORAGE_KEY]));
    });
  });
}

function setViewerSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [VIEWER_STORAGE_KEY]: settings }, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[ForceDark] Viewer settings set error:",
          chrome.runtime.lastError.message
        );
      }

      resolve();
    });
  });
}

function normalizeColor(color, fallback) {
  return HEX_COLOR_PATTERN.test(color || "") ? color.toLowerCase() : fallback;
}

function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min);
  let hue;

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return { h: hue / 6, s: saturation, l: lightness };
}

function getRelativeLuminance({ r, g, b }) {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function mixRgb(colorA, colorB, amount) {
  const ratio = Math.min(Math.max(amount, 0), 1);
  return {
    r: clampColorChannel(colorA.r + (colorB.r - colorA.r) * ratio),
    g: clampColorChannel(colorA.g + (colorB.g - colorA.g) * ratio),
    b: clampColorChannel(colorA.b + (colorB.b - colorA.b) * ratio),
  };
}

function dimColor(color, amount) {
  return {
    r: clampColorChannel(color.r * amount),
    g: clampColorChannel(color.g * amount),
    b: clampColorChannel(color.b * amount),
  };
}

function applyContrast(color, amount) {
  return {
    r: clampColorChannel((color.r - 128) * amount + 128),
    g: clampColorChannel((color.g - 128) * amount + 128),
    b: clampColorChannel((color.b - 128) * amount + 128),
  };
}

function clampColorChannel(value) {
  return Math.min(Math.max(Math.round(value), 0), 255);
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function getNameFromUrl(source) {
  try {
    const url = new URL(source);
    const name = url.pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : "";
  } catch {
    return "";
  }
}

function revokeCurrentObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = "";
  }
}
