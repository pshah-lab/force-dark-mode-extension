// src/options/themeEditor.js
// Theme editor for the Options page. All theme text reaches the DOM through textContent only.
import { getCustomThemes, saveCustomTheme, deleteCustomTheme } from "../shared/storage.js";

const COLOR_KEYS = ["background", "surface", "text", "muted", "link", "border"];
const OPTIONAL_KEYS = COLOR_KEYS.slice(1);
const BLANK_BACKGROUND = "#0f1115";

function core() {
  return globalThis.ForceDarkThemes;
}

function safeFileName(name) {
  const base = String(name || "theme")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `themeswitcher-theme-${base || "theme"}.json`;
}

export function initThemeEditor({ showStatus }) {
  const T = core();
  const $ = (id) => document.getElementById(id);
  const nameInput = $("theme-name");
  const startFrom = $("theme-start-from");
  const dimInput = $("theme-image-dim");
  const dimValue = $("theme-image-dim-value");
  const preview = $("theme-preview");
  const contrastEl = $("theme-contrast");
  const saveBtn = $("theme-save");
  const cancelBtn = $("theme-cancel");
  const listEl = $("my-themes");
  const emptyEl = $("my-themes-empty");
  const titleEl = $("theme-editor-title");
  const importBtn = $("theme-import-btn");
  const importInput = $("theme-import-input");
  if (!T || !nameInput || !preview || !listEl) return;

  const colorInputs = {};
  const autoInputs = {};
  for (const key of COLOR_KEYS) {
    colorInputs[key] = $(`theme-color-${key}`);
    autoInputs[key] = $(`theme-auto-${key}`);
  }

  let editingId = null;
  let userThemes = [];

  function readForm() {
    const colors = { background: colorInputs.background.value };
    for (const key of OPTIONAL_KEYS) {
      colors[key] = autoInputs[key].checked ? "" : colorInputs[key].value;
    }
    return T.themeFromForm({ name: nameInput.value, colors, imageDim: dimInput.value });
  }

  function writeForm(theme) {
    nameInput.value = theme.name || "";
    const colors = theme.colors || {};
    colorInputs.background.value = colors.background || BLANK_BACKGROUND;
    for (const key of OPTIONAL_KEYS) {
      const custom = typeof colors[key] === "string" && colors[key] !== "";
      autoInputs[key].checked = !custom;
      if (custom) colorInputs[key].value = colors[key];
    }
    dimInput.value = String(theme.imageDim || 0);
    refresh();
  }

  function setPreviewVar(name, value) {
    preview.style.setProperty(name, value);
  }

  function refresh() {
    const theme = readForm();
    const palette = T.paletteFromTheme(theme);
    // Auto colours show the derived value so the swatch matches the preview.
    for (const key of OPTIONAL_KEYS) {
      colorInputs[key].disabled = autoInputs[key].checked;
      if (autoInputs[key].checked) colorInputs[key].value = palette[key];
    }
    setPreviewVar("--preview-bg", palette.bg);
    setPreviewVar("--preview-surface", palette.surface);
    setPreviewVar("--preview-text", palette.text);
    setPreviewVar("--preview-muted", palette.muted);
    setPreviewVar("--preview-link", palette.link);
    setPreviewVar("--preview-border", palette.border);
    setPreviewVar("--preview-input", palette.input);
    setPreviewVar("--preview-image-brightness", String(1 - theme.imageDim / 100));
    dimValue.textContent = String(theme.imageDim);

    const issues = T.contrastIssues(theme);
    const lines = issues.messages.slice();
    if (!theme.name) lines.push("Give the theme a name to save it.");
    if (issues.level === "ok" && theme.name) lines.push("Contrast looks good.");
    contrastEl.textContent = lines.join(" ");
    contrastEl.className = `contrast-message ${issues.level === "ok" && !theme.name ? "hint" : issues.level}`;
    saveBtn.disabled = issues.level === "block" || !theme.name;
  }

  function resetEditor() {
    editingId = null;
    titleEl.textContent = "Create theme";
    saveBtn.textContent = "Save theme";
    startFrom.value = "";
    writeForm({ name: "", colors: { background: BLANK_BACKGROUND }, imageDim: 0 });
  }

  function fillStartFrom() {
    startFrom.textContent = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Blank";
    startFrom.appendChild(blank);
    const group = document.createElement("optgroup");
    group.label = "Built-in themes";
    for (const theme of T.getBuiltinThemes()) {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.name;
      group.appendChild(option);
    }
    startFrom.appendChild(group);
  }

  function swatch(theme) {
    const palette = T.paletteFromTheme(theme);
    const el = document.createElement("span");
    el.className = "theme-swatch";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--swatch-bg", palette.bg);
    el.style.setProperty("--swatch-text", palette.text);
    el.textContent = "Aa";
    return el;
  }

  function actionButton(label, theme, className, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn btn-small ${className}`;
    btn.textContent = label;
    btn.setAttribute("aria-label", `${label} theme ${theme.name}`);
    btn.addEventListener("click", handler);
    return btn;
  }

  function exportTheme(theme) {
    const payload = JSON.stringify({ name: theme.name, colors: theme.colors, imageDim: theme.imageDim }, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFileName(theme.name);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus("✓ Theme exported as a JSON file.");
  }

  async function persist(theme, okMessage) {
    const result = await saveCustomTheme(theme);
    if (!result.ok) {
      showStatus(result.error || "Could not save the theme.", "error");
      return false;
    }
    showStatus(okMessage);
    await renderList();
    return true;
  }

  async function duplicateTheme(theme) {
    const name = `${theme.name} copy`.slice(0, T.LIMITS.MAX_NAME);
    await persist({ ...theme, id: T.newThemeId(), name }, `✓ Duplicated as "${name}".`);
  }

  async function removeTheme(theme) {
    if (!window.confirm(`Delete the theme "${theme.name}"?\n\nSites using it go back to the default colour.`)) return;
    await deleteCustomTheme(theme.id);
    if (editingId === theme.id) resetEditor();
    showStatus("✓ Theme deleted.");
    await renderList();
  }

  function editTheme(theme) {
    editingId = theme.id;
    titleEl.textContent = "Edit theme";
    saveBtn.textContent = "Save changes";
    writeForm(theme);
    nameInput.focus();
    titleEl.scrollIntoView({ block: "start" });
  }

  async function renderList() {
    userThemes = await getCustomThemes();
    listEl.textContent = "";
    emptyEl.hidden = userThemes.length > 0;
    for (const theme of userThemes) {
      const item = document.createElement("li");
      item.className = "theme-item";
      const label = document.createElement("span");
      label.className = "theme-item-name";
      label.textContent = theme.name;
      const actions = document.createElement("span");
      actions.className = "theme-item-actions";
      actions.appendChild(actionButton("Edit", theme, "btn-secondary", () => editTheme(theme)));
      actions.appendChild(actionButton("Duplicate", theme, "btn-secondary", () => duplicateTheme(theme)));
      actions.appendChild(actionButton("Export", theme, "btn-secondary", () => exportTheme(theme)));
      actions.appendChild(actionButton("Delete", theme, "btn-danger", () => removeTheme(theme)));
      item.append(swatch(theme), label, actions);
      listEl.appendChild(item);
    }
  }

  fillStartFrom();
  startFrom.addEventListener("change", () => {
    const template = startFrom.value ? T.getBuiltinTheme(startFrom.value) : null;
    if (template) {
      writeForm({ ...template, name: `${template.name} custom`.slice(0, T.LIMITS.MAX_NAME) });
    } else {
      writeForm({ name: nameInput.value, colors: { background: BLANK_BACKGROUND }, imageDim: 0 });
    }
  });
  nameInput.addEventListener("input", refresh);
  dimInput.addEventListener("input", refresh);
  for (const key of COLOR_KEYS) {
    colorInputs[key].addEventListener("input", refresh);
    if (autoInputs[key]) autoInputs[key].addEventListener("change", refresh);
  }

  saveBtn.addEventListener("click", async () => {
    const draft = readForm();
    if (T.contrastIssues(draft).level === "block") return;
    const id = editingId || T.newThemeId();
    const saved = await persist({ ...draft, id }, `✓ Theme "${draft.name}" saved.`);
    if (saved) resetEditor();
  });
  cancelBtn.addEventListener("click", resetEditor);

  importBtn.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    try {
      if (file.size > T.LIMITS.MAX_IMPORT_BYTES) {
        showStatus(`Import failed: theme files must be under ${T.LIMITS.MAX_IMPORT_BYTES} bytes.`, "error");
        return;
      }
      const parsed = T.importThemeFile(await file.text());
      if (!parsed.ok) {
        showStatus(`Import failed: ${parsed.error}`, "error");
        return;
      }
      await persist(parsed.theme, `✓ Imported theme "${parsed.theme.name}".`);
    } catch (err) {
      showStatus(`Import failed: ${err.message}`, "error");
    } finally {
      importInput.value = "";
    }
  });

  resetEditor();
  return renderList();
}
