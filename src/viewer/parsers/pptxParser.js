const MAX_PPTX_SLIDES = 500;
const SLIDE_ENTRY_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;
const XML_NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlEntities(text) {
  return text.replace(/&(#(\d+)|amp|lt|gt|quot|apos);/g, (match, _entity, numeric) => {
    if (numeric) return String.fromCodePoint(Number(numeric));
    return XML_NAMED_ENTITIES[match.slice(1, -1)] ?? match;
  });
}

// The slide XML is untrusted, so the scans below use indexOf rather than lazy
// `[\s\S]*?` regexes: when a closing tag is missing, a regex rescans to the end
// of the input from every opening tag (quadratic), while a missing closing tag
// here ends the scan, because no later opening tag could find one either.

// Calls visit(elementXml) for each `<name ...></name>` / `<name>...</name>`
// element, in order. Matches the opening tag only when `<name` is followed by a
// space or `>` (so `<a:pPr>` is not `<a:p>` and `<a:p/>` is skipped).
function forEachElement(xml, name, visit) {
  const open = `<${name}`;
  const close = `</${name}>`;
  let pos = 0;

  while (true) {
    const start = xml.indexOf(open, pos);
    if (start === -1) return;

    const after = xml[start + open.length];
    if (after !== " " && after !== ">") {
      pos = start + 1;
      continue;
    }

    const end = xml.indexOf(close, start + open.length + 1);
    if (end === -1) return;

    pos = end + close.length;
    visit(xml.slice(start, pos));
  }
}

// Concatenates the decoded content of every `<a:t>...</a:t>` in a run. Same
// opening-tag rule as before: `<a:t` followed by `>`, or by whitespace and then
// anything up to the first `>`; `<a:tXY>` and `<a:t/>` do not count.
function extractRunText(runXml) {
  let text = "";
  let pos = 0;

  while (true) {
    const start = runXml.indexOf("<a:t", pos);
    if (start === -1) break;

    const afterName = start + 4;
    const next = runXml[afterName];
    let contentStart;
    if (next === ">") {
      contentStart = afterName + 1;
    } else if (next !== undefined && /\s/.test(next)) {
      const tagEnd = runXml.indexOf(">", afterName + 1);
      if (tagEnd === -1) break;
      contentStart = tagEnd + 1;
    } else {
      pos = start + 1;
      continue;
    }

    const end = runXml.indexOf("</a:t>", contentStart);
    if (end === -1) break;

    text += decodeXmlEntities(runXml.slice(contentStart, end));
    pos = end + "</a:t>".length;
  }

  return text;
}

export function parsePptxSlideXml(xmlText) {
  const blocks = [];

  forEachElement(xmlText, "a:p", (paragraphXml) => {
    const runs = [];

    forEachElement(paragraphXml, "a:r", (runXml) => {
      const rPrMatch = runXml.match(/<a:rPr[^>]*\/?>/);
      const rPrTag = rPrMatch ? rPrMatch[0] : "";
      const bold = /\bb="1"/.test(rPrTag);
      const italic = /\bi="1"/.test(rPrTag);

      const text = extractRunText(runXml);
      if (text) runs.push({ text, bold, italic });
    });

    if (runs.length > 0) blocks.push({ runs });
  });

  return blocks;
}

export async function parsePptxPresentation(entryNames, fetchEntryText) {
  const slideEntries = entryNames
    .map((name) => {
      const match = name.match(SLIDE_ENTRY_PATTERN);
      return match ? { name, number: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);

  const slides = [];
  let truncated = false;

  for (const entry of slideEntries) {
    if (slides.length >= MAX_PPTX_SLIDES) {
      truncated = true;
      break;
    }

    const xmlText = await fetchEntryText(entry.name);
    if (xmlText === null) continue;

    slides.push({ number: entry.number, blocks: parsePptxSlideXml(xmlText) });
  }

  return { slides, truncated };
}
