export function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return { h: hue / 6, s: saturation, l: lightness };
}

export function getRelativeLuminance({ r, g, b }) {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function clampColorChannel(value) {
  return Math.min(Math.max(Math.round(value), 0), 255);
}

export function mixRgb(colorA, colorB, amount) {
  const ratio = Math.min(Math.max(amount, 0), 1);
  return {
    r: clampColorChannel(colorA.r + (colorB.r - colorA.r) * ratio),
    g: clampColorChannel(colorA.g + (colorB.g - colorA.g) * ratio),
    b: clampColorChannel(colorA.b + (colorB.b - colorA.b) * ratio),
  };
}

export function dimColor(color, amount) {
  return {
    r: clampColorChannel(color.r * amount),
    g: clampColorChannel(color.g * amount),
    b: clampColorChannel(color.b * amount),
  };
}

export function applyContrast(color, amount) {
  return {
    r: clampColorChannel((color.r - 128) * amount + 128),
    g: clampColorChannel((color.g - 128) * amount + 128),
    b: clampColorChannel((color.b - 128) * amount + 128),
  };
}

export function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

export function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const value = clampColorChannel(l * 255);
    return { r: value, g: value, b: value };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return {
    r: clampColorChannel(channel(1 / 3) * 255),
    g: clampColorChannel(channel(0) * 255),
    b: clampColorChannel(channel(-1 / 3) * 255),
  };
}

export function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}
