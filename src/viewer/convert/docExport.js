// Text, Markdown and standalone-HTML exporters for documents the viewer already parsed.
// All document text is escaped; generated HTML carries no scripts, no external
// resources, and a Content-Security-Policy that forbids loading anything.

const EXPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const EXPORT_STYLE = [
  ":root{color-scheme:light dark}",
  "body{max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif}",
  "pre{white-space:pre-wrap;word-wrap:break-word;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace}",
  "code{font-family:ui-monospace,Menlo,Consolas,monospace}",
  "section{margin-bottom:2em}",
].join("");

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Backslash-escapes characters that Markdown would treat as markup (CommonMark
// allows escaping any ASCII punctuation), plus block markers at line start.
export function escapeMarkdown(text) {
  return String(text ?? "")
    .replace(/[\\`*_[\]<>]/g, "\\$&")
    .replace(/^(\s*)([#>+-])/gm, "$1\\$2")
    .replace(/^(\s*\d+)([.)])/gm, "$1\\$2");
}

export function buildHtmlDocument(title, bodyHtml) {
  return (
    "<!DOCTYPE html>\n" +
    '<html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">` +
    '<meta name="referrer" content="no-referrer">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(title)}</title>` +
    `<style>${EXPORT_STYLE}</style>` +
    `</head><body>\n${bodyHtml}\n</body></html>\n`
  );
}

const runsText = (runs) => runs.map((run) => run.text).join("");

function runsMarkdown(runs) {
  return runs
    .map((run) => {
      const text = escapeMarkdown(run.text);
      if (!text.trim()) return text;
      // Keep surrounding spaces outside the markers so the emphasis still parses.
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
      let marked = core;
      if (run.italic) marked = `*${marked}*`;
      if (run.bold) marked = `**${marked}**`;
      return lead + marked + trail;
    })
    .join("");
}

function runsHtml(runs) {
  return runs
    .map((run) => {
      let html = escapeHtml(run.text);
      if (run.italic) html = `<em>${html}</em>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join("");
}

// Groups consecutive list items so each run of them renders as one list.
function groupDocxBlocks(blocks) {
  const groups = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    if (block.type === "listItem" && last?.type === "list") last.items.push(block);
    else if (block.type === "listItem") groups.push({ type: "list", items: [block] });
    else groups.push(block);
  }
  return groups;
}

function joinBlocks(parts) {
  return parts.length ? parts.join("\n\n") + "\n" : "";
}

export function docxToText(result) {
  return joinBlocks(
    groupDocxBlocks(result.blocks).map((g) => {
      if (g.type === "heading") return g.text;
      if (g.type === "list") return g.items.map((item) => `- ${runsText(item.runs)}`).join("\n");
      return runsText(g.runs);
    })
  );
}

export function docxToMarkdown(result) {
  return joinBlocks(
    groupDocxBlocks(result.blocks).map((g) => {
      if (g.type === "heading") return `${"#".repeat(g.level)} ${escapeMarkdown(g.text)}`;
      if (g.type === "list") return g.items.map((item) => `- ${runsMarkdown(item.runs)}`).join("\n");
      return runsMarkdown(g.runs);
    })
  );
}

export function docxToHtml(result, title) {
  const body = groupDocxBlocks(result.blocks)
    .map((g) => {
      if (g.type === "heading") return `<h${g.level}>${escapeHtml(g.text)}</h${g.level}>`;
      if (g.type === "list") return `<ul>${g.items.map((item) => `<li>${runsHtml(item.runs)}</li>`).join("")}</ul>`;
      return `<p>${runsHtml(g.runs)}</p>`;
    })
    .join("\n");
  return buildHtmlDocument(title, body);
}

export function pptxToText(result) {
  return joinBlocks(
    result.slides.map((slide) => `Slide ${slide.number}\n\n${slide.blocks.map((b) => runsText(b.runs)).join("\n")}`)
  );
}

export function pptxToMarkdown(result) {
  const slides = result.slides.map(
    (slide) => `## Slide ${slide.number}\n\n${slide.blocks.map((b) => runsMarkdown(b.runs)).join("\n\n")}`
  );
  return slides.length ? slides.join("\n\n---\n\n") + "\n" : "";
}

export function pptxToHtml(result, title) {
  const body = result.slides
    .map(
      (slide) =>
        `<section><h2>Slide ${slide.number}</h2>${slide.blocks.map((b) => `<p>${runsHtml(b.runs)}</p>`).join("")}</section>`
    )
    .join("\n");
  return buildHtmlDocument(title, body);
}

// Same inline subset as the viewer's on-screen Markdown renderer: **bold**, *italic*, `code`.
function inlineMarkdownHtml(text) {
  const tokenRegex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  let out = "";
  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(text)) !== null) {
    out += escapeHtml(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) out += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    else if (token.startsWith("`")) out += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    else out += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    lastIndex = match.index + token.length;
  }
  return out + escapeHtml(text.slice(lastIndex));
}

// Mirrors the viewer's renderMarkdownSafely: #..### headings, -/* bullet lists, paragraphs.
export function markdownToHtml(text, title) {
  const parts = [];
  let list = null;
  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(\S.*)$/);
    const listItem = line.match(/^[-*]\s+(\S.*)$/);
    if (heading) {
      list = null;
      const level = heading[1].length;
      parts.push(`<h${level}>${inlineMarkdownHtml(heading[2])}</h${level}>`);
    } else if (listItem) {
      if (!list) {
        list = [];
        parts.push(list);
      }
      list.push(`<li>${inlineMarkdownHtml(listItem[1])}</li>`);
    } else {
      list = null;
      if (line.trim()) parts.push(`<p>${inlineMarkdownHtml(line)}</p>`);
    }
  }
  const body = parts.map((p) => (Array.isArray(p) ? `<ul>${p.join("")}</ul>` : p)).join("\n");
  return buildHtmlDocument(title, body);
}

export function plainTextToHtml(text, title) {
  return buildHtmlDocument(title, `<pre>${escapeHtml(text)}</pre>`);
}

// Same best-effort RTF stripping the viewer uses for on-screen display.
export function rtfToPlainText(text) {
  return String(text ?? "")
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
