import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, getRelativeLuminance, mixRgb } from "./pixelMath.js";

const DEFAULT_BACKGROUND = "#1a1a1a";
const DEFAULT_TEXT = "#e6e6e6";
const ORIGINAL_FILL = "#ffffff";
const ORIGINAL_TEXT = "#000000";
const SEPIA_TINT = "#8a6a3f";
const SEPIA_AMOUNT = 0.12;
const MIN_CONTRAST = 4.5;
// Text below this luminance is the parser's default "#000000" (or equivalent) and means "default text".
const DEFAULT_TEXT_LUMINANCE = 0.05;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(value) {
  return typeof value === "string" && HEX_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function contrastRatio(hexA, hexB) {
  const a = getRelativeLuminance(hexToRgb(hexA));
  const b = getRelativeLuminance(hexToRgb(hexB));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function withLightness(hex, lightness) {
  const { h, s } = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ h, s, l: lightness }));
}

function enforceContrast(textHex, fillHex) {
  if (contrastRatio(textHex, fillHex) >= MIN_CONTRAST) return textHex;
  const { l } = rgbToHsl(hexToRgb(textHex));
  for (let next = l + 0.01; next <= 0.95; next += 0.01) {
    const candidate = withLightness(textHex, next);
    if (contrastRatio(candidate, fillHex) >= MIN_CONTRAST) return candidate;
  }
  for (let next = l - 0.01; next >= 0.05; next -= 0.01) {
    const candidate = withLightness(textHex, next);
    if (contrastRatio(candidate, fillHex) >= MIN_CONTRAST) return candidate;
  }
  return contrastRatio("#ffffff", fillHex) >= contrastRatio("#000000", fillHex) ? "#ffffff" : "#000000";
}

function mapFill(hex, mode) {
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  if (mode === "invert") return rgbToHex(hslToRgb({ h, s, l: 1 - l }));
  return rgbToHex(hslToRgb({ h, s: s * 0.85, l: 0.1 + 0.22 * l }));
}

function mapText(hex, mode) {
  if (mode !== "invert") return hex;
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ h, s, l: 1 - l }));
}

export function mapCellColors(cell, mode, palette) {
  const fill = normalizeHex(cell?.fill);
  const color = normalizeHex(cell?.color);

  if (mode === "original") {
    return { background: fill ?? ORIGINAL_FILL, color: color ?? ORIGINAL_TEXT };
  }

  const paletteBackground = normalizeHex(palette?.backgroundColor) ?? DEFAULT_BACKGROUND;
  const paletteText = normalizeHex(palette?.textColor) ?? DEFAULT_TEXT;
  const isDefaultText = !color || getRelativeLuminance(hexToRgb(color)) < DEFAULT_TEXT_LUMINANCE;

  let background = fill ? mapFill(fill, mode) : paletteBackground;
  let text = isDefaultText ? paletteText : mapText(color, mode);

  if (mode === "sepia") {
    const tint = hexToRgb(SEPIA_TINT);
    background = rgbToHex(mixRgb(hexToRgb(background), tint, SEPIA_AMOUNT));
    text = rgbToHex(mixRgb(hexToRgb(text), tint, SEPIA_AMOUNT));
  }

  return { background, color: enforceContrast(text, background) };
}
