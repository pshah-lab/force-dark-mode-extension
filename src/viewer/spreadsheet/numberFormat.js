// Excel number/date formatting (ECMA-376 §18.8.30). Pure logic, never throws.

export const BUILTIN_FORMATS = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "m/d/yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yyyy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

export function getFormatCode(numFmtId, customFormats) {
  if (customFormats && Object.prototype.hasOwnProperty.call(customFormats, numFmtId)) {
    return customFormats[numFmtId];
  }
  return BUILTIN_FORMATS[numFmtId] ?? "General";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatGeneral(value) {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e11 || abs < 1e-9) {
    return value
      .toExponential(5)
      .replace(/\.?0+e/, "e")
      .replace("e", "E")
      .replace(/E([+-])(\d)$/, "E$10$2");
  }
  return String(parseFloat(value.toPrecision(11)));
}

function splitSections(code) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === "\"") inQuote = !inQuote;
    if (ch === "\\" && !inQuote) {
      cur += ch + (code[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === ";" && !inQuote) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// Remove colour/condition/locale tags; keep [h] [m] [s] elapsed markers and [$X-loc] currency text.
function cleanTags(section) {
  return section
    .replace(/\[\$([^\]-]*)(?:-[^\]]*)?\]/g, (_, sym) => (sym ? `"${sym}"` : ""))
    .replace(/\[(?!(?:h+|m+|s+)\])[^\]]*\]/gi, "");
}

function stripLiterals(section) {
  return section
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/_./g, "")
    .replace(/\*./g, "");
}

function isDateSection(section) {
  return /[ymdhs]/i.test(stripLiterals(section).replace(/\[(h+|m+|s+)\]/gi, "h"));
}

function roundTo(x, dec) {
  if (String(x).includes("e")) return x.toFixed(Math.min(dec, 100));
  return Number(`${Math.round(Number(`${x}e${dec}`))}e-${dec}`).toFixed(dec);
}

function formatRun(run, x) {
  const expMatch = run.match(/^(.*?)E([+-])(0+)$/);
  const body = expMatch ? expMatch[1] : run;
  const [intPart, decPart = ""] = body.split(".");
  const dec = decPart.replace(/,/g, "").length;
  const minInt = (intPart.match(/0/g) || []).length;
  const thousands = intPart.includes(",");
  if (expMatch) {
    const [mant, exp] = x.toExponential(dec).split("e");
    const e = parseInt(exp, 10);
    const sign = e < 0 ? "-" : expMatch[2] === "+" ? "+" : "";
    return `${mant}E${sign}${String(Math.abs(e)).padStart(expMatch[3].length, "0")}`;
  }
  const fixed = roundTo(x, dec);
  let [i, f = ""] = fixed.split(".");
  if (minInt === 0 && i === "0" && dec > 0) i = "";
  else i = i.padStart(minInt, "0");
  if (thousands) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec > 0 ? `${i}.${f}` : i;
}

function scaleBy100(abs) {
  const s = String(abs);
  return s.includes("e") ? abs * 100 : Number(`${s}e2`);
}

function formatNumberSection(section, abs) {
  const tokenRe = /"([^"]*)"|\\(.)|_(.)|\*(.)|([#0?,.]+(?:E[+-]0+)?)|(%)|([\s\S])/g;
  const x = /%/.test(stripLiterals(section)) ? scaleBy100(abs) : abs;
  let out = "";
  let usedNumber = false;
  let m;
  while ((m = tokenRe.exec(section)) !== null) {
    if (m[1] !== undefined) out += m[1];
    else if (m[2] !== undefined) out += m[2];
    else if (m[3] !== undefined) out += " ";
    else if (m[4] !== undefined) continue;
    else if (m[5] !== undefined) {
      if (usedNumber) {
        out += m[5];
        continue;
      }
      usedNumber = true;
      out += formatRun(m[5], x);
    } else if (m[6] !== undefined) out += "%";
    else out += m[7];
  }
  return { text: out, usedNumber };
}

function serialToParts(serial, date1904) {
  let days = Math.floor(serial);
  let secs = Math.round((serial - days) * 86400);
  if (secs >= 86400) {
    secs -= 86400;
    days += 1;
  }
  let y, mo, d, wd;
  if (!date1904 && days === 60) {
    // Excel's fictitious 1900-02-29 (shown as a Wednesday)
    y = 1900; mo = 1; d = 29; wd = 3;
  } else {
    let ms;
    if (date1904) ms = Date.UTC(1904, 0, 1) + days * 86400000;
    else if (days < 60) ms = Date.UTC(1899, 11, 31) + days * 86400000;
    else ms = Date.UTC(1899, 11, 30) + days * 86400000; // already skips the fake leap day
    const dt = new Date(ms);
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth(); d = dt.getUTCDate(); wd = dt.getUTCDay();
  }
  return {
    y, mo, d, wd,
    h: Math.floor(secs / 3600),
    mi: Math.floor((secs % 3600) / 60),
    s: secs % 60,
    totalSecs: Math.round(serial * 86400),
    frac: serial - Math.floor(serial),
  };
}

function formatDateSection(section, serial, date1904) {
  const p = serialToParts(serial, date1904);
  const tokenRe = /"([^"]*)"|\\(.)|_(.)|\*(.)|\[(h+|m+|s+)\]|(AM\/PM|A\/P)|(y+|m+|d+|h+|s+)|(\.0+)|([\s\S])/gi;
  const tokens = [];
  let m;
  while ((m = tokenRe.exec(section)) !== null) {
    if (m[1] !== undefined) tokens.push({ lit: m[1] });
    else if (m[2] !== undefined) tokens.push({ lit: m[2] });
    else if (m[3] !== undefined) tokens.push({ lit: " " });
    else if (m[4] !== undefined) continue;
    else if (m[5] !== undefined) tokens.push({ el: m[5].toLowerCase()[0], n: m[5].length });
    else if (m[6] !== undefined) tokens.push({ ampm: m[6] });
    else if (m[7] !== undefined) tokens.push({ t: m[7].toLowerCase()[0], n: m[7].length });
    else if (m[8] !== undefined) tokens.push({ fr: m[8].length - 1 });
    else tokens.push({ lit: m[9] });
  }
  const hasAmPm = tokens.some((t) => t.ampm);
  // "m" is minutes when adjacent to an hour or second token, else month.
  const dateTokens = tokens.filter((t) => t.t || t.el);
  for (const t of tokens) {
    if (t.t !== "m") continue;
    const idx = dateTokens.indexOf(t);
    const prev = dateTokens[idx - 1];
    const next = dateTokens[idx + 1];
    if ((prev && (prev.t === "h" || prev.el === "h")) || (next && (next.t === "s" || next.el === "s"))) t.minute = true;
  }
  const pad = (v, n) => String(v).padStart(n, "0");
  let out = "";
  for (const t of tokens) {
    if (t.lit !== undefined) out += t.lit;
    else if (t.ampm) {
      const pm = p.h >= 12;
      out += t.ampm.toUpperCase() === "A/P" ? (pm ? "P" : "A") : pm ? "PM" : "AM";
    } else if (t.fr !== undefined) {
      const sub = p.frac * 86400;
      out += "." + pad(Math.floor((sub - Math.floor(sub)) * 10 ** t.fr), t.fr);
    } else if (t.el) {
      const total = t.el === "h" ? Math.floor(p.totalSecs / 3600) : t.el === "m" ? Math.floor(p.totalSecs / 60) : p.totalSecs;
      out += pad(total, t.n);
    } else if (t.t === "y") out += t.n <= 2 ? pad(p.y % 100, 2) : pad(p.y, 4);
    else if (t.t === "d") {
      if (t.n === 1) out += p.d;
      else if (t.n === 2) out += pad(p.d, 2);
      else if (t.n === 3) out += DAYS[p.wd].slice(0, 3);
      else out += DAYS[p.wd];
    } else if (t.t === "h") {
      const h = hasAmPm ? p.h % 12 || 12 : p.h;
      out += t.n === 1 ? h : pad(h, 2);
    } else if (t.t === "s") out += t.n === 1 ? p.s : pad(p.s, 2);
    else if (t.t === "m") {
      if (t.minute) out += t.n === 1 ? p.mi : pad(p.mi, 2);
      else if (t.n === 1) out += p.mo + 1;
      else if (t.n === 2) out += pad(p.mo + 1, 2);
      else if (t.n === 3) out += MONTHS[p.mo].slice(0, 3);
      else if (t.n === 4) out += MONTHS[p.mo];
      else out += MONTHS[p.mo][0];
    }
  }
  return out;
}

export function formatCellValue(value, formatCode, opts = {}) {
  try {
    if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
    const code = formatCode == null ? "General" : String(formatCode);
    if (code.trim() === "" || /^general$/i.test(code.trim())) return formatGeneral(value);

    const sections = splitSections(code);
    let section;
    let abs = value;
    let minus = false;
    if (value < 0 && sections.length >= 2) {
      section = sections[1];
      abs = -value;
    } else if (value === 0 && sections.length >= 3) {
      section = sections[2];
    } else {
      section = sections[0];
      if (value < 0) {
        abs = -value;
        minus = true;
      }
    }
    section = cleanTags(section);
    if (section === "") return "";

    if (/^\s*general\s*$/i.test(section) || /^\s*@\s*$/.test(section)) {
      return formatGeneral(value);
    }
    if (isDateSection(section)) {
      if (value < 0) return String(value);
      return formatDateSection(section, value, !!opts.date1904);
    }
    if (/\?\s*\/\s*[?\d]/.test(stripLiterals(section))) return formatGeneral(value); // fractions unsupported
    const { text, usedNumber } = formatNumberSection(section, abs);
    if (!usedNumber) return text;
    const isZeroOut = !/[1-9]/.test(text);
    return minus && !isZeroOut ? `-${text}` : text;
  } catch {
    return String(value);
  }
}
