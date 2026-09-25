export const DEFAULT_ENGINE = "auto";
export const FALLBACK_ENGINE = "css";
export const VALID_ENGINES = new Set(["auto", "css", "invert"]);
export const DEFAULT_BACKGROUND_COLOR = "#0f1115";
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const FILTER_RANGES = {
  brightness: { min: 50, max: 150, default: 100 },
  contrast: { min: 50, max: 150, default: 100 },
  sepia: { min: 0, max: 100, default: 0 },
};

export function clampFilterValue(name, value) {
  const range = FILTER_RANGES[name];
  const numeric = Number(value);
  if (!range || !Number.isFinite(numeric)) return range?.default ?? 0;
  return Math.min(range.max, Math.max(range.min, Math.round(numeric)));
}
