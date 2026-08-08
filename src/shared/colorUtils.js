(function (global) {
  let canvasCtx = null;

  function parseCssColor(value) {
    if (!value || value === "transparent" || value === "inherit" || value === "initial") {
      return null;
    }

    const trimmed = value.trim();

    // Try standard rgba() / rgb() format
    const rgbMatch = trimmed.match(/^rgba?\((.+)\)$/i);
    if (rgbMatch) {
      const parts = rgbMatch[1]
        .trim()
        .split(/[,\s/]+/)
        .filter(Boolean);

      if (parts.length >= 3) {
        const [r, g, b] = parts.slice(0, 3).map(parseColorChannel);
        const a = parts[3] === undefined ? 1 : parseAlphaChannel(parts[3]);

        if (![r, g, b, a].some((part) => Number.isNaN(part))) {
          return { r, g, b, a };
        }
      }
    }

    // Try hex color format (#rgb, #rgba, #rrggbb, #rrggbbaa)
    const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      if (hex.length === 3 || hex.length === 4) {
        const r = Number.parseInt(hex[0] + hex[0], 16);
        const g = Number.parseInt(hex[1] + hex[1], 16);
        const b = Number.parseInt(hex[2] + hex[2], 16);
        const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
        return { r, g, b, a: roundRatio(a) };
      }
      if (hex.length === 6 || hex.length === 8) {
        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
        return { r, g, b, a: roundRatio(a) };
      }
    }

    // Canvas fallback for modern CSS colors (hsl, oklch, lab, color-mix, etc.)
    return parseColorWithCanvas(trimmed);
  }

  function parseColorWithCanvas(value) {
    if (typeof document === "undefined") return null;

    try {
      if (!canvasCtx) {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        canvasCtx = canvas.getContext("2d", { willReadFrequently: true });
      }
      if (!canvasCtx) return null;

      canvasCtx.clearRect(0, 0, 1, 1);
      canvasCtx.fillStyle = "#000000";
      canvasCtx.fillStyle = value;
      canvasCtx.fillRect(0, 0, 1, 1);

      const [r, g, b, a255] = canvasCtx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: roundRatio(a255 / 255) };
    } catch {
      return null;
    }
  }

  function parseColorChannel(value) {
    if (value.endsWith("%")) {
      return Math.round((Number.parseFloat(value) / 100) * 255);
    }
    return Number.parseFloat(value);
  }

  function parseAlphaChannel(value) {
    if (value.endsWith("%")) {
      return Number.parseFloat(value) / 100;
    }
    return Number.parseFloat(value);
  }

  function getLuminance({ r, g, b }) {
    const [red, green, blue] = [r, g, b].map((channel) => {
      const value = channel / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  function getContrastRatio(colorA, colorB) {
    const lighter = Math.max(getLuminance(colorA), getLuminance(colorB));
    const darker = Math.min(getLuminance(colorA), getLuminance(colorB));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function normalizeHexColor(value) {
    if (typeof value !== "string") return "";
    const color = value.trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "";
  }

  function hexToRgb(hex) {
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    };
  }

  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b]
      .map((channel) => Math.min(255, Math.max(0, channel)).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function mixColors(base, target, amount) {
    const targetRgb = typeof target === "string" ? hexToRgb(target) : target;
    const mixChannel = (channel, targetChannel) => {
      return Math.round(channel + (targetChannel - channel) * amount);
    };

    return rgbToHex({
      r: mixChannel(base.r, targetRgb.r),
      g: mixChannel(base.g, targetRgb.g),
      b: mixChannel(base.b, targetRgb.b),
    });
  }

  function roundRatio(value) {
    return Math.round(value * 100) / 100;
  }

  const utils = {
    parseCssColor,
    getLuminance,
    getContrastRatio,
    normalizeHexColor,
    hexToRgb,
    rgbToHex,
    mixColors,
  };

  global.ForceDarkColorUtils = utils;
})(typeof globalThis !== "undefined" ? globalThis : self);
