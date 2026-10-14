// src/options/options.js
import {
  getSiteConfig,
  setSiteConfig,
  getAllConfigs,
  clearAllConfigs,
  exportSettingsJson,
  importSettingsJson,
  isSafeKey,
  getScheduleConfig,
  setScheduleConfig,
} from "../shared/storage.js";
import { initThemeEditor } from "./themeEditor.js";
import { initCustomCssEditor } from "./customCssEditor.js";
import { DEFAULT_ENGINE, DEFAULT_BACKGROUND_COLOR } from "../shared/constants.js";

const PRESET_COLORS = {
  midnight: "#0b0e14",
  neon: "#0a0a0f",
  solarized: "#002b36",
};

document.addEventListener("DOMContentLoaded", async () => {
  const enabledInput = document.getElementById("enabled");
  const engineSelect = document.getElementById("engine");
  const bgColorInput = document.getElementById("bgColor");
  const presetSelect = document.getElementById("preset");
  const saveBtn = document.getElementById("saveBtn");
  const domainCountEl = document.getElementById("domainCount");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFileInput");
  const clearBtn = document.getElementById("clearBtn");
  const statusMessage = document.getElementById("statusMessage");
  const scheduleModeSelect = document.getElementById("scheduleMode");
  const scheduleTimeFields = document.getElementById("scheduleTimeFields");
  const scheduleStartInput = document.getElementById("scheduleStart");
  const scheduleEndInput = document.getElementById("scheduleEnd");
  const saveScheduleBtn = document.getElementById("saveScheduleBtn");

  function showStatus(text, type = "success") {
    if (!statusMessage) return;
    statusMessage.textContent = text;
    statusMessage.className = `status-banner ${type}`;
    statusMessage.hidden = false;
    setTimeout(() => {
      statusMessage.hidden = true;
    }, 3500);
  }

  async function refreshStats() {
    try {
      const all = await getAllConfigs();
      let count = 0;
      for (const [k, v] of Object.entries(all)) {
        if (
          isSafeKey(k) &&
          !k.startsWith("__") &&
          v &&
          typeof v === "object" &&
          ("enabled" in v || "engine" in v)
        ) {
          count++;
        }
      }
      if (domainCountEl) {
        domainCountEl.textContent = String(count);
      }
    } catch {
      if (domainCountEl) domainCountEl.textContent = "0";
    }
  }

  // Load global defaults
  const globalConfig = (await getSiteConfig("__global_defaults__")) || {
    enabled: true,
    engine: DEFAULT_ENGINE,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
  };

  if (enabledInput) enabledInput.checked = globalConfig.enabled !== false;
  if (engineSelect) engineSelect.value = globalConfig.engine || DEFAULT_ENGINE;
  if (bgColorInput) bgColorInput.value = globalConfig.backgroundColor || DEFAULT_BACKGROUND_COLOR;

  await refreshStats();
  let themeEditor = null;
  let cssEditor = null;
  try {
    themeEditor = await initThemeEditor({ showStatus });
  } catch (err) {
    console.warn("Theme editor failed to start:", err);
  }
  try {
    cssEditor = await initCustomCssEditor({ showStatus });
  } catch (err) {
    console.warn("Custom CSS editor failed to start:", err);
  }

  // "My themes" and "Sites with custom CSS" re-read storage after an import or an erase.
  async function refreshEditors() {
    try {
      await Promise.all([themeEditor?.refresh(), cssEditor?.refresh()]);
    } catch (err) {
      console.warn("Could not refresh the theme and custom CSS lists:", err);
    }
  }

  // Usage stats (opt-in). All state lives in the background worker; this page only
  // sends runtime messages and mirrors what the worker reports.
  const TELEMETRY_PROMPT_KEY = "telemetryPromptState";
  const telemetryToggle = document.getElementById("telemetry-toggle");
  const telemetryPreview = document.getElementById("telemetry-preview");
  const telemetryPreviewLabel = document.getElementById("telemetry-preview-label");
  const telemetryDeleteBtn = document.getElementById("telemetry-delete");
  const telemetryDeleteResult = document.getElementById("telemetry-delete-result");
  const TELEMETRY_OFF_TEXT = "Nothing is sent while this is off";
  const TELEMETRY_EXAMPLE_LABEL = "Example of what would be sent if you turn this on (nothing is sent while this is off)";
  // The live tally can include features used after the day's first-use send, so this is not
  // necessarily byte-for-byte what was sent today.
  const TELEMETRY_LIVE_LABEL = "Today's report if sent now";

  async function refreshTelemetry() {
    if (!telemetryToggle || !telemetryPreview) return;
    let status = null;
    try {
      status = await chrome.runtime.sendMessage({ type: "TELEMETRY_STATUS" });
    } catch (err) {
      console.warn("Could not read usage stats status:", err);
    }
    const enabled = status?.enabled === true;
    const heartbeat = status?.heartbeat && typeof status.heartbeat === "object" ? status.heartbeat : null;
    telemetryToggle.checked = enabled;
    if (telemetryPreviewLabel) {
      telemetryPreviewLabel.textContent = enabled ? TELEMETRY_LIVE_LABEL : TELEMETRY_EXAMPLE_LABEL;
    }
    const showable = heartbeat && (enabled || status.example === true);
    telemetryPreview.textContent = showable ? JSON.stringify(heartbeat, null, 2) : TELEMETRY_OFF_TEXT;
  }

  async function markTelemetryDecided() {
    try {
      const data = await chrome.storage.local.get(TELEMETRY_PROMPT_KEY);
      const prev = data?.[TELEMETRY_PROMPT_KEY];
      const base = prev && typeof prev === "object" ? prev : {};
      await chrome.storage.local.set({ [TELEMETRY_PROMPT_KEY]: { ...base, decided: true } });
    } catch (err) {
      console.warn("Could not record the usage stats choice:", err);
    }
  }

  if (telemetryToggle) {
    telemetryToggle.addEventListener("change", async () => {
      try {
        await chrome.runtime.sendMessage({ type: "TELEMETRY_CONSENT", enabled: telemetryToggle.checked });
      } catch (err) {
        console.warn("Could not change usage stats setting:", err);
      }
      await markTelemetryDecided();
      await refreshTelemetry();
    });
  }

  if (telemetryDeleteBtn) {
    telemetryDeleteBtn.addEventListener("click", async () => {
      let res = null;
      try {
        res = await chrome.runtime.sendMessage({ type: "TELEMETRY_DELETE" });
      } catch (err) {
        console.warn("Could not delete usage stats data:", err);
      }
      if (telemetryDeleteResult) {
        telemetryDeleteResult.textContent =
          res?.serverConfirmed === true
            ? "Deleted"
            : "Removed from this device; server deletion could not be confirmed";
      }
      await refreshTelemetry();
    });
  }

  await refreshTelemetry();

  // Load schedule preferences
  const scheduleConfig = (await getScheduleConfig()) || { mode: "off", start: "20:00", end: "07:00" };

  function updateScheduleFieldVisibility() {
    if (scheduleTimeFields) {
      scheduleTimeFields.hidden = scheduleModeSelect.value !== "time";
    }
  }

  if (scheduleModeSelect) {
    scheduleModeSelect.value = scheduleConfig.mode;
    scheduleStartInput.value = scheduleConfig.start;
    scheduleEndInput.value = scheduleConfig.end;
    updateScheduleFieldVisibility();

    scheduleModeSelect.addEventListener("change", updateScheduleFieldVisibility);
  }

  if (saveScheduleBtn) {
    saveScheduleBtn.addEventListener("click", async () => {
      await setScheduleConfig({
        mode: scheduleModeSelect.value,
        start: scheduleStartInput.value,
        end: scheduleEndInput.value,
      });
      showStatus("✓ Automatic scheduling preferences saved successfully.");
      saveScheduleBtn.textContent = "Saved!";
      setTimeout(() => {
        saveScheduleBtn.textContent = "Save Schedule";
      }, 1500);
    });
  }

  if (presetSelect) {
    presetSelect.addEventListener("change", () => {
      const selected = presetSelect.value;
      if (PRESET_COLORS[selected]) {
        bgColorInput.value = PRESET_COLORS[selected];
      }
    });
  }

  // Save Defaults
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const newConfig = {
        enabled: enabledInput.checked,
        engine: engineSelect.value,
        backgroundColor: bgColorInput.value,
      };

      await setSiteConfig("__global_defaults__", newConfig);
      showStatus("✓ Global default preferences saved successfully.");
      saveBtn.textContent = "Saved!";
      setTimeout(() => {
        saveBtn.textContent = "Save Defaults";
      }, 1500);
    });
  }

  // Data Portability: Export Settings JSON
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      try {
        const json = await exportSettingsJson();
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `themeswitcher-settings-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showStatus("✓ Settings successfully exported as JSON file.");
      } catch (err) {
        showStatus(`Export failed: ${err.message}`, "error");
      }
    });
  }

  // Data Portability: Import Settings JSON
  if (importBtn && importFileInput) {
    importBtn.addEventListener("click", () => {
      importFileInput.click();
    });

    importFileInput.addEventListener("change", async () => {
      const file = importFileInput.files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const count = await importSettingsJson(content);
        await refreshStats();
        await refreshEditors();
        showStatus(`✓ Successfully imported ${count} items (sites, themes and custom CSS).`);
      } catch (err) {
        const message = String(err?.message || "");
        showStatus(message.startsWith("Import failed") ? message : `Import failed: ${message}`, "error");
      } finally {
        importFileInput.value = "";
      }
    });
  }

  // Right to Erasure / Reset: Clear All Data
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      const confirmed = window.confirm(
        "Are you sure you want to erase all stored data?\n\nThis will permanently remove all site settings, saved themes, custom CSS, dark mode preferences and viewer settings from your Chrome profile."
      );
      if (!confirmed) return;

      await clearAllConfigs();
      await refreshStats();
      await refreshEditors();
      showStatus("✓ All stored preferences have been erased and reset to default.", "success");
    });
  }
});
