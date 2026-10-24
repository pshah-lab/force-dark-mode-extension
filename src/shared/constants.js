export const DEFAULT_ENGINE = "auto";
export const FALLBACK_ENGINE = "css";
export const VALID_ENGINES = new Set(["auto", "css", "invert"]);
export const DEFAULT_BACKGROUND_COLOR = "#0f1115";
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const FILTER_RANGES = {
  brightness: { min: 50, max: 150, default: 100 },
  contrast: { min: 50, max: 150, default: 100 },
  sepia: { min: 0, max: 100, default: 0 },
  mediaDim: { min: 0, max: 80, default: 20 },
};

export function clampFilterValue(name, value) {
  const range = FILTER_RANGES[name];
  const numeric = Number(value);
  if (!range || !Number.isFinite(numeric)) return range?.default ?? 0;
  return Math.min(range.max, Math.max(range.min, Math.round(numeric)));
}

// Invert engine, per site: photos and media restored ("on", the default and the meaning of a missing field),
// restored and dimmed by mediaDim percent ("dim"), or inverted with the page ("off").
export const VALID_MEDIA_MODES = new Set(["on", "dim", "off"]);
export const DEFAULT_MEDIA_MODE = "on";

// The media fields to store for a site: the message's valid values win, else the stored valid values are kept.
// Fields that are absent or invalid stay absent, so older configs keep their shape (missing = "on").
export function mediaFieldsFor(msg, currentConfig) {
  const out = {};
  const pick = (value) => (typeof value === "string" && VALID_MEDIA_MODES.has(value) ? value : undefined);
  const media = pick(msg?.media) ?? pick(currentConfig?.media);
  if (media) out.media = media;
  const dimSource = msg?.mediaDim ?? currentConfig?.mediaDim;
  if (dimSource !== undefined && dimSource !== null && Number.isFinite(Number(dimSource))) {
    out.mediaDim = clampFilterValue("mediaDim", dimSource);
  }
  return out;
}

// Per site, for pages that are already dark: leave them alone ("respect", the default and the meaning of a
// missing field) or theme them anyway ("force").
export const VALID_NATIVE_DARK_MODES = new Set(["respect", "force"]);
export const DEFAULT_NATIVE_DARK_MODE = "respect";

// The nativeDark field to store for a site: the message's valid value wins, else the stored valid value is kept.
// Absent or invalid stays absent, so older configs keep their shape (missing = "respect").
export function nativeDarkFieldsFor(msg, currentConfig) {
  const pick = (value) => (typeof value === "string" && VALID_NATIVE_DARK_MODES.has(value) ? value : undefined);
  const nativeDark = pick(msg?.nativeDark) ?? pick(currentConfig?.nativeDark);
  return nativeDark ? { nativeDark } : {};
}

export const VALID_SCHEDULE_MODES = new Set(["off", "time", "system"]);
export const DEFAULT_SCHEDULE_START = "20:00";
export const DEFAULT_SCHEDULE_END = "07:00";
export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const THEME_ID_PATTERN = /^(builtin|user):[a-z0-9-]{1,40}$/;
