// src/options/options.js
import {
  getSiteConfig,
  setSiteConfig,
  getAllConfigs,
  clearAllConfigs,
  exportSettingsJson,
  importSettingsJson,
  isSafeKey,
} from "../shared/storage.js";
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
        showStatus(`✓ Successfully imported ${count} configuration entries.`);
      } catch (err) {
        showStatus(`Import failed: ${err.message}`, "error");
      } finally {
        importFileInput.value = "";
      }
    });
  }

  // Right to Erasure / Reset: Clear All Data
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      const confirmed = window.confirm(
        "Are you sure you want to erase all stored data?\n\nThis will permanently remove all custom site rules, dark mode preferences, and viewer settings from your Chrome profile."
      );
      if (!confirmed) return;

      await clearAllConfigs();
      await refreshStats();
      showStatus("✓ All stored preferences have been erased and reset to default.", "success");
    });
  }
});
