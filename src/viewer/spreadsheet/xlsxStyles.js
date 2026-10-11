import { getFormatCode } from "./numberFormat.js";

const XML_NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

// Out-of-range or surrogate code points would make String.fromCodePoint throw.
function safeCodePoint(n) {
  return n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) ? "\uFFFD" : String.fromCodePoint(n);
}

function decodeXmlEntities(text) {
  return text.replace(/&(#(\d+)|#x([0-9a-fA-F]+)|amp|lt|gt|quot|apos);/g, (match, _e, dec, hex) => {
    if (dec) return safeCodePoint(Number(dec));
    if (hex) return safeCodePoint(parseInt(hex, 16));
    return XML_NAMED_ENTITIES[match.slice(1, -1)] ?? match;
  });
}

// Reads attributes from an opening tag's attribute string, in any order.
function parseAttrs(tagText) {
  const attrs = {};
  // The lookbehind anchors names at their start so a long run of name characters
  // without '=' is not re-scanned from every offset (quadratic).
  const re = /(?<![\w:.-])([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagText)) !== null) attrs[m[1]] = decodeXmlEntities(m[2]);
  return attrs;
}

// Default Office palette, in Excel theme index order.
const DEFAULT_THEME_COLORS = [
  "#ffffff", "#000000", "#e7e6e6", "#44546a",
  "#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47",
  "#0563c1", "#954f72",
];

// Order in which elements appear in clrScheme, mapped to Excel theme indexes
// (lt/dk swapped relative to the XML order).
const THEME_SLOTS = [
  ["lt1", 0], ["dk1", 1], ["lt2", 2], ["dk2", 3],
  ["accent1", 4], ["accent2", 5], ["accent3", 6], ["accent4", 7], ["accent5", 8], ["accent6", 9],
  ["hlink", 10], ["folHlink", 11],
];

export function parseThemeColors(themeXml) {
  const colors = DEFAULT_THEME_COLORS.slice();
  if (typeof themeXml !== "string") return colors;
  for (const [name, index] of THEME_SLOTS) {
    const el = section(themeXml, `a:${name}`);
    if (!el) continue;
    const srgb = el.match(/<a:srgbClr\b([^<>]*)>/);
    const sys = el.match(/<a:sysClr\b([^<>]*)>/);
    const hex = srgb ? parseAttrs(srgb[1]).val : sys ? parseAttrs(sys[1]).lastClr : undefined;
    if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) colors[index] = `#${hex.toLowerCase()}`;
  }
  return colors;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function toHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

export function applyTint(hex, tint) {
  if (!tint) return hex;
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const l2 = tint > 0 ? l * (1 - tint) + tint : l * (1 + tint);
  // Tiny epsilon so exact .5 results (e.g. #808080 +0.5) round consistently.
  const rgb = hslToRgb([h, s, l2]).map((v) => v + 1e-9);
  return toHex(rgb);
}

// Standard default indexed palette (ECMA-376 §18.8.27).
export const INDEXED_COLORS = [
  "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
  "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
  "#800000", "#008000", "#000080", "#808000", "#800080", "#008080", "#c0c0c0", "#808080",
  "#9999ff", "#993366", "#ffffcc", "#ccffff", "#660066", "#ff8080", "#0066cc", "#ccccff",
  "#000080", "#ff00ff", "#ffff00", "#00ffff", "#800080", "#800000", "#008080", "#0000ff",
  "#00ccff", "#ccffff", "#ccffcc", "#ffff99", "#99ccff", "#ff99cc", "#cc99ff", "#ffcc99",
  "#3366ff", "#33cccc", "#99cc00", "#ffcc00", "#ff9900", "#ff6600", "#666699", "#969696",
  "#003366", "#339966", "#003300", "#333300", "#993300", "#993366", "#333399", "#333333",
];

function resolveColor(attrs, themeColors) {
  let hex;
  if (attrs.rgb && /^[0-9a-fA-F]{8}$|^[0-9a-fA-F]{6}$/.test(attrs.rgb)) {
    hex = `#${attrs.rgb.slice(-6).toLowerCase()}`;
  } else if (attrs.theme !== undefined) {
    hex = themeColors[Number(attrs.theme)];
  } else if (attrs.indexed !== undefined) {
    hex = INDEXED_COLORS[Number(attrs.indexed)];
  }
  if (!hex) return undefined;
  const tint = Number(attrs.tint);
  return tint ? applyTint(hex, tint) : hex;
}

// Matches both <tag .../> and <tag ...>...</tag>; yields [attrString, innerXml].
// Linear: tag attributes cannot cross '<', and the closing tag is found with
// indexOf once per element (an unclosed element ends the scan).
function* elements(xml, tag) {
  const openRe = new RegExp(`<${tag}(?=[\\s/>])([^<>]*)>`, "g");
  const closeTag = `</${tag}>`;
  let m;
  while ((m = openRe.exec(xml)) !== null) {
    if (m[1].endsWith("/")) {
      yield [m[1].slice(0, -1), ""];
      continue;
    }
    const end = xml.indexOf(closeTag, openRe.lastIndex);
    if (end === -1) return;
    yield [m[1], xml.slice(openRe.lastIndex, end)];
    openRe.lastIndex = end + closeTag.length;
  }
}

function section(xml, name) {
  for (const [, inner] of elements(xml, name)) return inner;
  return "";
}

function parseFont(inner, themeColors) {
  const flag = (tag) => {
    const m = inner.match(new RegExp(`<${tag}(?=[\\s/>])([^<>]*)>`));
    if (!m) return false;
    const val = parseAttrs(m[1]).val;
    return !(val === "0" || val === "false");
  };
  const colorMatch = inner.match(/<color(?=[\s/>])([^<>]*)>/);
  return {
    bold: flag("b"),
    italic: flag("i"),
    color: colorMatch ? resolveColor(parseAttrs(colorMatch[1]), themeColors) : undefined,
  };
}

function parseFill(inner, themeColors) {
  const pf = elements(inner, "patternFill").next().value;
  if (!pf || parseAttrs(pf[0]).patternType !== "solid") return undefined;
  const fg = pf[1].match(/<fgColor(?=[\s/>])([^<>]*)>/);
  return fg ? resolveColor(parseAttrs(fg[1]), themeColors) : undefined;
}

export function parseStyles(stylesXml, themeColors) {
  const xml = typeof stylesXml === "string" ? stylesXml : "";
  const colors = themeColors ?? DEFAULT_THEME_COLORS;

  const numFmts = {};
  for (const [attrStr] of elements(section(xml, "numFmts"), "numFmt")) {
    const a = parseAttrs(attrStr);
    if (a.numFmtId !== undefined && a.formatCode !== undefined) numFmts[Number(a.numFmtId)] = a.formatCode;
  }

  const fonts = [...elements(section(xml, "fonts"), "font")].map(([, inner]) => parseFont(inner, colors));
  const fills = [...elements(section(xml, "fills"), "fill")].map(([, inner]) => parseFill(inner, colors));

  const cellStyles = [];
  for (const [attrStr, inner] of elements(section(xml, "cellXfs"), "xf")) {
    const a = parseAttrs(attrStr);
    const font = fonts[Number(a.fontId)] ?? { bold: false, italic: false };
    const fill = fills[Number(a.fillId)];
    const style = {
      formatCode: getFormatCode(Number(a.numFmtId) || 0, numFmts),
      bold: font.bold,
      italic: font.italic,
    };
    const al = inner.match(/<alignment(?=[\s/>])([^<>]*)>/);
    const horizontal = al ? parseAttrs(al[1]).horizontal : undefined;
    if (horizontal === "left" || horizontal === "center" || horizontal === "right") style.align = horizontal;
    if (fill) style.fill = fill;
    if (font.color) style.color = font.color;
    cellStyles.push(style);
  }
  return { cellStyles, numFmts };
}
