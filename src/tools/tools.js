// PDF Tools page: choose a tool, add files, set options, Run, Download.
// Everything runs in this tab. Files are held in memory only (never stored, never sent anywhere)
// and are released when the page closes or the user clears them.
import * as pdfjsLib from "../viewer/vendor/pdf.min.mjs";
import { TOOLS, getTool, toolFromHash, readValues, runTool, zipEntryNames, acceptsFile, skipMessage, needsInspection } from "./toolRegistry.js";
import { downloadBlob } from "./download.js";
import { el, buildOptionFields, rawOptionValues } from "./optionFields.js";
import { loadPdf } from "../viewer/pdftools/loadPdf.js";
import { convertPixels } from "../viewer/pdftools/pixelModes.js";
import { MAX_PNG_PAGES, pngRenderScale } from "../viewer/convert/pdfExport.js";
import { createZip } from "../viewer/convert/zipWriter.js";
import { exportFileName, EXPORT_MIME_TYPES } from "../viewer/convert/exportFormats.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  "src/viewer/vendor/pdf.worker.min.mjs"
);

const JPEG_QUALITY = 0.85;
const ACCEPT = {
  pdf: "application/pdf,.pdf",
  images: "image/jpeg,image/png,.jpg,.jpeg,.png",
};

const toolList = document.getElementById("tool-list");
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

function buildToolList() {
  const items = TOOLS.map((tool) => {
    const button = el("button", { type: "button", text: tool.title });
    button.dataset.tool = tool.id;
    button.addEventListener("click", () => {
      if (running) return;
      if (location.hash === `#${tool.id}`) selectTool(tool);
      else location.hash = tool.id;
    });
    return el("li", {}, button);
  });
  toolList.replaceChildren(...items);
}

function selectTool(tool) {
  if (!tool || running) return;
  const previous = currentTool;
  currentTool = tool;
  for (const button of toolList.querySelectorAll("button")) {
    button.setAttribute("aria-current", String(button.dataset.tool === tool.id));
  }
  toolTitle.textContent = tool.title;
  toolDescription.textContent = tool.description;
  fileInput.accept = ACCEPT[tool.accepts];
  fileInput.multiple = true;
  dropHint.textContent = tool.accepts === "images"
    ? "Drop JPG or PNG images here or"
    : tool.multiple
      ? "Drop PDFs here or"
      : "Drop one or more PDFs here (each is processed separately) or";
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
}

function buildOptions(tool) {
  optionsForm.replaceChildren(...buildOptionFields(tool, "opt-"));
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
  runButton.disabled = running || !currentTool || files.length === 0;
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

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

function pdfjsMessage(error, name) {
  if (error && error.name === "PasswordException") {
    return `${name} is password-protected or encrypted, so it can't be edited. Remove the password first.`;
  }
  return `${name} could not be read. It may be corrupt or not a PDF.`;
}

async function renderPageToJpeg(page, mode) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: pngRenderScale(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({ canvasContext: context, viewport }).promise;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    convertPixels(image.data, mode);
    context.putImageData(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("JPEG encoding failed");
    // Scale 1 viewport size is in PDF points and already accounts for page rotation.
    return { width: base.width, height: base.height, jpegBytes: new Uint8Array(await blob.arrayBuffer()) };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

// Returns { name, pages, totalPages } or throws a readable Error.
async function renderForColorCopy(file, mode, label, token) {
  await loadPdf(file.bytes, file.name); // engine's readable encrypted / corrupt message
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: file.bytes.slice(), verbosity: pdfjsLib.VerbosityLevel?.ERRORS ?? 0 }).promise;
  } catch (error) {
    throw new Error(pdfjsMessage(error, file.name));
  }
  try {
    const total = pdf.numPages;
    const count = Math.min(total, MAX_PNG_PAGES);
    const pages = [];
    for (let n = 1; n <= count; n++) {
      if (token !== generation) throw new Error("Cancelled.");
      setProgress(`${label}Page ${n} of ${count}`);
      const page = await pdf.getPage(n);
      try {
        pages.push(await renderPageToJpeg(page, mode));
      } finally {
        page.cleanup();
      }
      await yieldToEventLoop();
    }
    return { name: file.name, pages, totalPages: total };
  } finally {
    await pdf.destroy();
  }
}

// ------------------------------------------------------------------ run and results

async function run() {
  if (running || !currentTool || files.length === 0) return;
  const tool = currentTool;
  const token = ++generation;
  const values = formValues();
  running = true;
  clearResults();
  renderFiles();
  setProgress("Working…");
  let outcome;
  try {
    if (tool.render) {
      const outputs = [];
      const errors = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const label = files.length > 1 ? `${file.name}: ` : "";
        try {
          const rendered = await renderForColorCopy(file, values.mode, label, token);
          setProgress(`${label}Building PDF…`);
          const r = await runTool(tool, [rendered], values);
          outputs.push(...r.outputs);
          errors.push(...r.errors);
        } catch (error) {
          errors.push({ name: file.name, message: String((error && error.message) || error) });
        }
      }
      outcome = { outputs, errors };
    } else {
      outcome = await runTool(tool, files, values, (message) => setProgress(message));
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
  else setProgress(`Done. ${made} file${made > 1 ? "s" : ""} ready to download.`);
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
window.addEventListener("hashchange", () => {
  const tool = toolFromHash(location.hash);
  if (tool && tool !== currentTool) selectTool(tool);
});

buildToolList();
selectTool(toolFromHash(location.hash) || getTool("merge"));
