// PDF Tools page: choose a tool, add files, set options, Run, Download.
// Everything runs in this tab. Files are held in memory only (never stored, never sent anywhere)
// and are released when the page closes or the user clears them.
import * as pdfjsLib from "../viewer/vendor/pdf.min.mjs";
import { gridTools, CATEGORIES, getTool, toolFromHash, readValues, runTool, zipEntryNames, acceptsFile, skipMessage, needsInspection } from "./toolRegistry.js";
import { downloadBlob } from "./download.js";
import { el, buildOptionFields, rawOptionValues, bindVisibility } from "./optionFields.js";
import { renderColorCopyPages } from "./colorCopyRender.js";
import { renderPdfToImages, recompressJpeg } from "./pdfImagesRender.js";
import { renderHtmlToPages } from "./htmlRender.js";
import { createZip } from "../viewer/convert/zipWriter.js";
import { exportFileName, EXPORT_MIME_TYPES } from "../viewer/convert/exportFormats.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  "src/viewer/vendor/pdf.worker.min.mjs"
);

const ACCEPT = {
  pdf: "application/pdf,.pdf",
  images: "image/jpeg,image/png,.jpg,.jpeg,.png",
  html: "text/html,.html,.htm",
};

const toolList = document.getElementById("tool-list");
const gridView = document.getElementById("grid-view");
const toolView = document.getElementById("tool-view");
const backLink = document.getElementById("back-link");
const searchBox = document.getElementById("tool-search");
const filterBar = document.getElementById("category-filters");
const noMatch = document.getElementById("no-match");
const toolTitle = document.getElementById("tool-title");
const toolDescription = document.getElementById("tool-description");
const dropZone = document.getElementById("drop-zone");
const dropHint = document.getElementById("drop-hint");
const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("file-list");
const inspectBox = document.getElementById("inspect");
const optionsForm = document.getElementById("options");
const runButton = document.getElementById("run");
const clearButton = document.getElementById("clear");
const progress = document.getElementById("progress");
const results = document.getElementById("results");

let currentTool = null;
let files = []; // [{ name, bytes, size }]
let running = false;
let generation = 0; // bumps on tool switch / clear so stale async work is ignored
let lastOpenedId = null; // card to refocus when going back to the grid

function setProgress(message, tone = "info") {
  progress.textContent = message;
  progress.dataset.tone = tone;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ------------------------------------------------------------------ tool selection

function buildCard(tool) {
  const title = tool.cardTitle || tool.title;
  const chips = el("div", { className: "chips" });
  if (tool.isNew) chips.append(el("span", { className: "pill-new", text: "NEW" }));
  chips.append(el("span", { className: "chip", text: tool.disabled ? "COMING SOON" : tool.category }));
  const top = el("div", { className: "card-top" },
    el("div", { className: `tile tile-${tool.tile}`, text: title.charAt(0).toUpperCase() }), chips);
  top.firstChild.setAttribute("aria-hidden", "true");
  const card = el("li", { className: tool.disabled ? "tool-card is-disabled" : "tool-card" });
  card.append(top, el("h3", { className: "card-title", text: title }), el("p", { className: "card-summary", text: tool.summary }));
  if (tool.disabled) {
    card.append(el("p", { className: "coming-soon-note", text: "Coming soon. It needs a server, so it stays off while this extension runs fully offline." }));
    card.title = tool.comingSoon;
  } else {
    const link = el("a", { className: "open-link", href: `#${tool.id}`, text: "Open Tool ›" });
    link.dataset.tool = tool.id;
    link.setAttribute("aria-label", `Open ${title}`);
    link.addEventListener("click", (event) => {
      if (running) event.preventDefault();
    });
    card.append(link);
  }
  return card;
}

let activeCategory = "ALL";

function buildToolList() {
  toolList.replaceChildren(...gridTools().map(buildCard));
  const chips = ["ALL", ...CATEGORIES].map((category) => {
    const chip = el("button", { type: "button", className: "filter-chip", text: category === "ALL" ? "All" : category.charAt(0) + category.slice(1).toLowerCase() });
    chip.dataset.category = category;
    chip.setAttribute("aria-pressed", String(category === activeCategory));
    chip.addEventListener("click", () => {
      activeCategory = category;
      applyFilter();
    });
    return chip;
  });
  filterBar.replaceChildren(...chips);
}

// Search words and the category chip decide which cards are visible; hidden cards keep their order.
function applyFilter() {
  const words = searchBox.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tools = gridTools();
  let shown = 0;
  Array.from(toolList.children).forEach((card, i) => {
    const tool = tools[i];
    const text = `${tool.cardTitle || tool.title} ${tool.summary} ${tool.category}`.toLowerCase();
    const match = (activeCategory === "ALL" || tool.category === activeCategory) && words.every((w) => text.includes(w));
    card.hidden = !match;
    if (match) shown++;
  });
  for (const chip of filterBar.children) chip.setAttribute("aria-pressed", String(chip.dataset.category === activeCategory));
  noMatch.hidden = shown > 0;
}

function showGrid() {
  if (running) return;
  generation++;
  currentTool = null;
  files = [];
  fileInput.value = "";
  clearResults();
  renderFiles();
  setProgress("");
  toolView.hidden = true;
  gridView.hidden = false;
  document.title = "PDF Tools";
  const link = lastOpenedId && toolList.querySelector(`a[data-tool="${lastOpenedId}"]`);
  if (link) link.focus();
}

function selectTool(tool) {
  if (!tool || running) return;
  const previous = currentTool;
  currentTool = tool;
  lastOpenedId = tool.id;
  gridView.hidden = true;
  toolView.hidden = false;
  document.title = `${tool.title} - PDF Tools`;
  toolTitle.textContent = tool.title;
  toolDescription.textContent = tool.description;
  fileInput.accept = ACCEPT[tool.accepts];
  fileInput.multiple = true;
  dropHint.textContent = tool.accepts === "images"
    ? "Drop JPG or PNG images here"
    : tool.accepts === "html"
      ? "Drop an .html file here"
      : tool.multiple
        ? "Drop PDFs here"
        : "Drop one or more PDFs here (each is processed separately)";
  if (previous && previous.accepts !== tool.accepts) clearFiles();
  else {
    generation++;
    clearResults();
    renderFiles();
  }
  buildOptions(tool);
  // Strip metadata shows what it found before running, also for files added under another tool.
  inspectBox.hidden = true;
  inspectBox.replaceChildren();
  if (needsInspection(tool, files)) showInspection(generation);
  toolTitle.focus();
}

function buildOptions(tool) {
  optionsForm.replaceChildren(...buildOptionFields(tool, "opt-"));
  bindVisibility(tool, optionsForm, "opt-");
}

function pastedHtml() {
  const box = optionsForm.elements.namedItem("html");
  return box && box.value.trim() ? box.value : "";
}

function formValues() {
  return readValues(currentTool, rawOptionValues(currentTool, optionsForm));
}

// ------------------------------------------------------------------ files

async function addFiles(fileListLike) {
  if (running || !currentTool) return;
  const incoming = Array.from(fileListLike || []);
  if (incoming.length === 0) return;
  const token = generation;
  setProgress("Reading files…");
  const added = [];
  const failed = [];
  const skipped = [];
  for (const file of incoming) {
    if (!acceptsFile(currentTool, file)) {
      skipped.push(skipMessage(currentTool, file && file.name));
      continue;
    }
    try {
      added.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), size: file.size });
    } catch {
      failed.push(file.name);
    }
  }
  if (token !== generation) return;
  files = files.concat(added);
  clearResults();
  renderFiles();
  const problems = [...skipped];
  if (failed.length) problems.push(`Could not read: ${failed.join(", ")}`);
  setProgress(problems.join(". "), problems.length ? "error" : "info");
  if (needsInspection(currentTool, files)) showInspection(token);
}

function moveFile(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= files.length) return;
  const copy = files.slice();
  [copy[index], copy[target]] = [copy[target], copy[index]];
  files = copy;
  renderFiles();
}

function removeFile(index) {
  files = files.filter((_, i) => i !== index);
  renderFiles();
  if (currentTool.inspect) showInspection(generation);
}

function renderFiles() {
  const ordered = currentTool && currentTool.multiple;
  const rows = files.map((file, index) => {
    const row = el("li", {}, el("span", { className: "file-name", text: file.name, title: file.name }),
      el("span", { className: "file-size", text: formatSize(file.size) }));
    if (ordered) {
      const up = el("button", { type: "button", text: "↑", disabled: index === 0 || running });
      up.setAttribute("aria-label", `Move ${file.name} up`);
      up.addEventListener("click", () => moveFile(index, -1));
      const down = el("button", { type: "button", text: "↓", disabled: index === files.length - 1 || running });
      down.setAttribute("aria-label", `Move ${file.name} down`);
      down.addEventListener("click", () => moveFile(index, 1));
      row.append(up, down);
    }
    const remove = el("button", { type: "button", text: "Remove", disabled: running });
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    remove.addEventListener("click", () => removeFile(index));
    row.append(remove);
    return row;
  });
  fileList.replaceChildren(...rows);
  if (!currentTool || !currentTool.inspect) {
    inspectBox.hidden = true;
    inspectBox.replaceChildren();
  }
  updateControls();
}

function clearFiles() {
  generation++;
  files = [];
  fileInput.value = "";
  clearResults();
  renderFiles();
  inspectBox.hidden = true;
  inspectBox.replaceChildren();
  setProgress("");
}

function updateControls() {
  const pasted = !!(currentTool && currentTool.allowPaste && pastedHtml());
  runButton.disabled = running || !currentTool || (files.length === 0 && !pasted);
  clearButton.disabled = running || files.length === 0;
  fileInput.disabled = running;
}

// Strip metadata: show what was found before running.
async function showInspection(token) {
  if (files.length === 0) {
    inspectBox.hidden = true;
    inspectBox.replaceChildren();
    return;
  }
  const blocks = [];
  for (const file of files) {
    const block = [el("h3", { text: `Found in ${file.name}` })];
    try {
      const found = await currentTool.inspect(file.bytes);
      if (found.length === 0) {
        block.push(el("p", { text: "No Info fields or XMP metadata found." }));
      } else {
        const list = el("dl");
        for (const entry of found) list.append(el("dt", { text: entry.field }), el("dd", { text: entry.value }));
        block.push(list);
      }
    } catch (error) {
      block.push(el("p", { className: "message", text: String(error.message || error).replace(/^this file/, file.name) }));
    }
    blocks.push(...block);
  }
  if (token !== generation || !currentTool.inspect) return;
  inspectBox.replaceChildren(...blocks);
  inspectBox.hidden = false;
}

// ------------------------------------------------------------------ rendering for the color copy

// Returns { name, pages, totalPages } or throws a readable Error.
function renderForColorCopy(file, mode, label, token) {
  return renderColorCopyPages(pdfjsLib, {
    name: file.name,
    bytes: file.bytes,
    mode,
    onProgress: (message) => setProgress(`${label}${message}`),
    isCurrent: () => token === generation,
  });
}

// ------------------------------------------------------------------ run and results

// Files to run: the chosen files, or for HTML to PDF the pasted code as a virtual file.
function inputFiles(tool) {
  if (files.length > 0) return files;
  const text = tool.allowPaste ? pastedHtml() : "";
  if (!text) return [];
  const bytes = new TextEncoder().encode(text);
  return [{ name: "pasted.html", bytes, size: bytes.length }];
}

// Tools whose pages render in this tab first (canvas), then pass the result to the engine.
async function renderFor(tool, file, values, label, token) {
  const onProgress = (message) => setProgress(`${label}${message}`);
  const isCurrent = () => token === generation;
  if (tool.render) return renderForColorCopy(file, values.mode, label, token);
  if (tool.renderer === "pdf-images") {
    return renderPdfToImages(pdfjsLib, { name: file.name, bytes: file.bytes, format: values.format, pages: values.pages, onProgress, isCurrent });
  }
  return renderHtmlToPages({ name: file.name, html: new TextDecoder().decode(file.bytes), pageSize: values.pageSize, onProgress, isCurrent });
}

async function run() {
  const tool = currentTool;
  const input = tool ? inputFiles(tool) : [];
  if (running || !tool || input.length === 0) return;
  const token = ++generation;
  const values = formValues();
  running = true;
  clearResults();
  renderFiles();
  setProgress("Working…");
  let outcome;
  try {
    if (tool.render || tool.renderer) {
      const outputs = [];
      const errors = [];
      for (let i = 0; i < input.length; i++) {
        const file = input[i];
        const label = input.length > 1 ? `${file.name}: ` : "";
        try {
          const rendered = await renderFor(tool, file, values, label, token);
          setProgress(`${label}Building the result…`);
          const r = await runTool(tool, [rendered], values);
          outputs.push(...r.outputs);
          errors.push(...r.errors);
        } catch (error) {
          errors.push({ name: file.name, message: String((error && error.message) || error) });
        }
      }
      outcome = { outputs, errors };
    } else {
      outcome = await runTool(tool, input, values, (message) => setProgress(message), { recompressJpeg });
    }
  } catch (error) {
    console.warn("[ForceDark] PDF tool failed:", error);
    outcome = { outputs: [], errors: [{ name: "", message: "The tool failed unexpectedly. Try again with fewer or smaller files." }] };
  } finally {
    running = false;
  }
  if (token !== generation) return;
  renderFiles();
  showResults(tool, outcome);
  // The hash may have changed while the tool was running; the result stays until the user switches.
  const made = outcome.outputs.reduce((n, o) => n + o.files.length, 0);
  if (outcome.errors.length && made === 0) setProgress("Nothing was produced. See the messages below.", "error");
  else if (outcome.errors.length) setProgress(`Done, but ${outcome.errors.length} file${outcome.errors.length > 1 ? "s" : ""} failed.`, "error");
  else setProgress(`Done. ${made} file${made > 1 ? "s" : ""} ready to download.`, "success");
}

function clearResults() {
  results.replaceChildren();
}

function downloadFile(file) {
  downloadBlob(new Blob([file.bytes], { type: file.mime || "application/pdf" }), file.name);
}

function showResults(tool, { outputs, errors }) {
  const blocks = [];
  const allFiles = outputs.flatMap((o) => o.files);
  if (allFiles.length > 1) {
    const button = el("button", { type: "button", className: "download-all", text: `Download all (${allFiles.length} files, .zip)` });
    button.addEventListener("click", () => {
      const names = zipEntryNames(allFiles.map((f) => f.name));
      const zip = createZip(allFiles.map((f, i) => ({ name: names[i], data: f.bytes })));
      const zipName = outputs.length === 1 && !tool.multiple
        ? exportFileName(outputs[0].source, "zip", `-${tool.id}`)
        : `pdf-${tool.id}.zip`;
      downloadBlob(new Blob([zip], { type: EXPORT_MIME_TYPES.zip }), zipName);
    });
    blocks.push(button);
  }
  for (const output of outputs) {
    const card = el("div", { className: "result" }, el("h3", { text: output.source || tool.title }));
    for (const note of output.notes || []) card.append(el("p", { className: "note", text: note }));
    for (const warning of output.warnings || []) card.append(el("p", { className: "warning", text: `Warning: ${warning}` }));
    const list = el("ul");
    for (const file of output.files) {
      const button = el("button", { type: "button", text: "Download" });
      button.setAttribute("aria-label", `Download ${file.name}`);
      button.addEventListener("click", () => downloadFile(file));
      list.append(el("li", {}, el("span", { text: `${file.name} (${formatSize(file.bytes.length)})` }), button));
    }
    card.append(list);
    blocks.push(card);
  }
  for (const error of errors) {
    blocks.push(el("div", { className: "result error" },
      el("h3", { text: error.name || tool.title }),
      el("p", { className: "message", text: error.message })));
  }
  results.replaceChildren(...blocks);
}

// ------------------------------------------------------------------ events

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  addFiles(event.dataTransfer && event.dataTransfer.files);
});
// A file dropped outside the zone must not navigate the tab away (and lose the in-memory files).
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
runButton.addEventListener("click", run);
clearButton.addEventListener("click", () => {
  if (!running) clearFiles();
});
optionsForm.addEventListener("submit", (event) => event.preventDefault());
backLink.addEventListener("click", () => {
  if (running) return;
  if (location.hash) location.hash = "";
  else showGrid();
});
optionsForm.addEventListener("input", updateControls);
searchBox.addEventListener("input", applyFilter);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && currentTool && !running && !(event.target instanceof HTMLTextAreaElement)) backLink.click();
});
function route() {
  const tool = toolFromHash(location.hash);
  if (tool) {
    if (tool !== currentTool) selectTool(tool);
  } else if (currentTool) showGrid();
}
window.addEventListener("hashchange", route);

buildToolList();
route();
