// Which kind of document the viewer has open, and the best-effort RTF stripping used for on-screen display.
// Pure and DOM-free.

export function detectDocumentKind(name, mimeType = "") {
  const lower = String(name ?? "").toLowerCase();
  const type = String(mimeType ?? "").toLowerCase();
  if (type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (type === "text/csv" || lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".rtf")) return "rtf";
  if (lower.endsWith(".txt") || type.startsWith("text/")) return "text";
  return null;
}

// Groups whose text is metadata, not document content (font and colour tables, styles, document info, pictures,
// headers/footers and any "\\*" optional destination). Their text is skipped.
const RTF_SKIP_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "headerl", "headerr", "headerf",
  "footer", "footerl", "footerr", "footerf", "listtable", "listoverridetable", "rsidtbl", "generator",
  "xmlnstbl", "themedata", "colorschememapping", "latentstyles", "datastore", "filetbl", "revtbl",
]);

// Windows-1252 characters 0x80-0x9F that differ from Latin-1.
const CP1252 = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

// Best-effort RTF to plain text for on-screen display. One linear pass: tracks group depth so metadata groups
// (font table etc.) are skipped, maps \par/\line/\tab to whitespace and decodes \'hh and \uN characters.
export function rtfToPlainText(text) {
  const src = String(text ?? "");
  const out = [];
  const stack = [];
  let skip = false;
  let uc = 1; // fallback characters to drop after \uN
  let dropNext = 0;
  const emit = (ch) => {
    if (dropNext > 0) { dropNext -= 1; return; }
    if (!skip) out.push(ch);
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "{") {
      stack.push({ skip, uc });
      i += 1;
      // "{\\*" marks an optional destination: skip the whole group.
      if (src[i] === "\\" && src[i + 1] === "*") { skip = true; i += 2; }
      continue;
    }
    if (c === "}") {
      const prev = stack.pop();
      if (prev) { skip = prev.skip; uc = prev.uc; }
      dropNext = 0;
      i += 1;
      continue;
    }
    if (c === "\\") {
      const next = src[i + 1];
      if (next === undefined) break;
      if (next === "\\" || next === "{" || next === "}") { emit(next); i += 2; continue; }
      if (next === "'") {
        const code = parseInt(src.slice(i + 2, i + 4), 16);
        if (!Number.isNaN(code)) emit(String.fromCharCode(CP1252[code] ?? code));
        i += 4;
        continue;
      }
      if (next === "~") { emit("\u00a0"); i += 2; continue; }
      if (next === "-" || next === "_") { i += 2; continue; }
      if (next === "\n" || next === "\r") { emit("\n"); i += 2; continue; }
      if (!/[a-z]/i.test(next)) { i += 2; continue; }
      let j = i + 1;
      while (j < n && /[a-z]/i.test(src[j])) j += 1;
      const word = src.slice(i + 1, j);
      let k = j;
      if (src[k] === "-") k += 1;
      while (k < n && src[k] >= "0" && src[k] <= "9") k += 1;
      const param = src.slice(j, k);
      if (src[k] === " ") k += 1;
      i = k;
      if (RTF_SKIP_DESTINATIONS.has(word)) { skip = true; continue; }
      if (word === "par" || word === "line" || word === "sect" || word === "page") emit("\n");
      else if (word === "tab") emit("\t");
      else if (word === "uc") uc = Math.max(0, Number(param) || 0);
      else if (word === "u" && param) {
        let code = Number(param);
        if (code < 0) code += 65536;
        emit(String.fromCharCode(code));
        dropNext = uc;
      }
      continue;
    }
    if (c === "\r" || c === "\n") { i += 1; continue; }
    emit(c);
    i += 1;
  }
  return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
