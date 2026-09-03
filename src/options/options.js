// src/options/options.js
import { getSiteConfig, setSiteConfig } from "../shared/storage.js";
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

  // Load global/default settings
  const globalConfig = (await getSiteConfig("__global_defaults__")) || {
    enabled: true,
    engine: DEFAULT_ENGINE,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
  };

  if (enabledInput) enabledInput.checked = globalConfig.enabled !== false;
  if (engineSelect) engineSelect.value = globalConfig.engine || DEFAULT_ENGINE;
  if (bgColorInput) bgColorInput.value = globalConfig.backgroundColor || DEFAULT_BACKGROUND_COLOR;

  if (presetSelect) {
    presetSelect.addEventListener("change", () => {
      const selected = presetSelect.value;
      if (PRESET_COLORS[selected]) {
        bgColorInput.value = PRESET_COLORS[selected];
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const newConfig = {
        enabled: enabledInput.checked,
        engine: engineSelect.value,
        backgroundColor: bgColorInput.value,
      };

      await setSiteConfig("__global_defaults__", newConfig);
      saveBtn.textContent = "Saved!";
      setTimeout(() => {
        saveBtn.textContent = "Save";
      }, 1500);
    });
  }
});
