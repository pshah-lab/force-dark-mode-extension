// Pixel recoloring for dark / sepia / gray PDF export. Pure, DOM-free.
// "dark" and "sepia" port the viewer's per-pixel transforms (viewer.js
// transformSmartPixel / transformSepiaPixel), applying the viewer's default
// dark / sepia palette to rendered page images. Results may differ slightly from
// the on-screen Smart Dark view (which uses the user's own colours and settings).
import {
  applyContrast,
  dimColor,
  getRelativeLuminance,
  hexToRgb,
  mixRgb,
  rgbToHsl,
} from "../spreadsheet/pixelMath.js";

export const PIXEL_MODES = Object.freeze(["dark", "sepia", "gray"]);

// Viewer defaults (DEFAULT_VIEWER_SETTINGS in viewer.js).
const DARK_BACKGROUND = hexToRgb("#0f1115");
const DARK_TEXT = hexToRgb("#e8eaed");
const DARK_CONTRAST = 105 / 100;
const SEPIA_BACKGROUND = { r: 36, g: 30, b: 23 };
const SEPIA_TEXT = { r: 240, g: 221, b: 193 };

function darkPixel(pixel) {
  const hsl = rgbToHsl(pixel);
  const luminance = getRelativeLuminance(pixel);
  if (hsl.s > 0.32 && luminance > 0.18 && luminance < 0.88) {
    return applyContrast(dimColor(pixel, 0.82), DARK_CONTRAST);
  }
  if (luminance > 0.78) return mixRgb(DARK_BACKGROUND, DARK_TEXT, (1 - luminance) * 0.16);
  if (luminance < 0.35) return mixRgb(DARK_TEXT, DARK_BACKGROUND, 0.08 + luminance * 0.28);
  return applyContrast(
    mixRgb(DARK_BACKGROUND, DARK_TEXT, 1 - Math.min(Math.max(luminance, 0.2), 0.86)),
    DARK_CONTRAST
  );
}

function sepiaPixel(pixel) {
  const luminance = getRelativeLuminance(pixel);
  if (rgbToHsl(pixel).s > 0.36 && luminance > 0.18 && luminance < 0.82) return dimColor(pixel, 0.78);
  return mixRgb(SEPIA_TEXT, SEPIA_BACKGROUND, luminance);
}

function grayPixel({ r, g, b }) {
  const v = Math.min(Math.max(Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b), 0), 255);
  return { r: v, g: v, b: v };
}

const TRANSFORMS = { dark: darkPixel, sepia: sepiaPixel, gray: grayPixel };

// Recolors RGBA pixel data in place; alpha is left untouched.
export function convertPixels(rgba, mode) {
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length % 4 !== 0) {
    throw new Error("Invalid pixel data: expected RGBA bytes.");
  }
  const transform = Object.hasOwn(TRANSFORMS, mode) ? TRANSFORMS[mode] : null;
  if (!transform) throw new Error(`Unknown color mode: ${String(mode)}.`);
  for (let i = 0; i < rgba.length; i += 4) {
    const out = transform({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
    rgba[i] = out.r;
    rgba[i + 1] = out.g;
    rgba[i + 2] = out.b;
  }
}
