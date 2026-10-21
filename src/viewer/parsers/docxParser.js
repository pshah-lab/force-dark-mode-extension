const MAX_DOCX_PARAGRAPHS = 2000;
const XML_NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

// Out-of-range or surrogate code points would make String.fromCodePoint throw.
function safeCodePoint(n) {
  return n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) ? "\uFFFD" : String.fromCodePoint(n);
}

function decodeXmlEntities(text) {
  return text.replace(/&(#(\d+)|amp|lt|gt|quot|apos);/g, (match, _entity, numeric) => {
    if (numeric) return safeCodePoint(Number(numeric));
    return XML_NAMED_ENTITIES[match.slice(1, -1)] ?? match;
  });
}

// Returns the next `<open ...>...closeTag` span of xml at or after openRegex.lastIndex
// (openRegex must be global), or null. Linear: one regex scan for the opener and one
// indexOf for the closer. A missing closer ends the scan, since no later opener can
// have one either; a lazy `[\s\S]*?` regex would rescan to the end from every opener.
function nextElement(xml, openRegex, closeTag) {
  const open = openRegex.exec(xml);
  if (open === null) return null;
  const end = xml.indexOf(closeTag, openRegex.lastIndex);
  if (end === -1) return null;
  openRegex.lastIndex = end + closeTag.length;
  return xml.slice(open.index, openRegex.lastIndex);
}

function extractRuns(paragraphXml) {
  const runs = [];
  const runRegex = /<w:r[ >]/g;
  let runXml;

  while ((runXml = nextElement(paragraphXml, runRegex, "</w:r>")) !== null) {
    const rPrXml = nextElement(runXml, /<w:rPr[ >]/g, "</w:rPr>") ?? "";

    // Attribute text stops at '<' as well as '>' so a tag that is never closed
    // cannot make these scans run on to the end of the run.
    const bold = /<w:b\b(?![^<>]*w:val="(0|false)")[^<>]*\/?>/.test(rPrXml);
    const italic = /<w:i\b(?![^<>]*w:val="(0|false)")[^<>]*\/?>/.test(rPrXml);

    let text = "";
    const textRegex = /<w:t(?:\s[^<>]*)?>/g;
    while (textRegex.exec(runXml) !== null) {
      const end = runXml.indexOf("</w:t>", textRegex.lastIndex);
      if (end === -1) break;
      text += decodeXmlEntities(runXml.slice(textRegex.lastIndex, end));
      textRegex.lastIndex = end + 6;
    }

    if (text) runs.push({ text, bold, italic });
  }

  return runs;
}

export function parseDocxDocument(xmlText) {
  const blocks = [];
  const paragraphRegex = /<w:p[ >]/g;
  let paragraphXml;
  let truncated = false;

  while ((paragraphXml = nextElement(xmlText, paragraphRegex, "</w:p>")) !== null) {
    if (blocks.length >= MAX_DOCX_PARAGRAPHS) {
      truncated = true;
      break;
    }

    const pPrXml = nextElement(paragraphXml, /<w:pPr[ >]/g, "</w:pPr>") ?? "";

    const headingMatch = pPrXml.match(/<w:pStyle[^<>]*w:val="(Heading[1-3]|Title)"/);
    const isListItem = /<w:numPr[ >]/.test(pPrXml);
    const runs = extractRuns(paragraphXml);

    if (runs.length === 0) continue;

    if (headingMatch) {
      const level = headingMatch[1] === "Title" ? 1 : Number(headingMatch[1].slice(-1));
      blocks.push({ type: "heading", level, text: runs.map((run) => run.text).join("") });
    } else if (isListItem) {
      blocks.push({ type: "listItem", runs });
    } else {
      blocks.push({ type: "paragraph", runs });
    }
  }

  return { blocks, truncated };
}
