const MAX_DOCX_PARAGRAPHS = 2000;
const XML_NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlEntities(text) {
  return text.replace(/&(#(\d+)|amp|lt|gt|quot|apos);/g, (match, _entity, numeric) => {
    if (numeric) return String.fromCodePoint(Number(numeric));
    return XML_NAMED_ENTITIES[match.slice(1, -1)] ?? match;
  });
}

function extractRuns(paragraphXml) {
  const runs = [];
  const runRegex = /<w:r[ >][\s\S]*?<\/w:r>/g;
  let runMatch;

  while ((runMatch = runRegex.exec(paragraphXml)) !== null) {
    const runXml = runMatch[0];
    const rPrMatch = runXml.match(/<w:rPr[ >][\s\S]*?<\/w:rPr>/);
    const rPrXml = rPrMatch ? rPrMatch[0] : "";

    const bold = /<w:b\b(?![^>]*w:val="(0|false)")[^>]*\/?>/.test(rPrXml);
    const italic = /<w:i\b(?![^>]*w:val="(0|false)")[^>]*\/?>/.test(rPrXml);

    let text = "";
    const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let textMatch;
    while ((textMatch = textRegex.exec(runXml)) !== null) {
      text += decodeXmlEntities(textMatch[1]);
    }

    if (text) runs.push({ text, bold, italic });
  }

  return runs;
}

export function parseDocxDocument(xmlText) {
  const blocks = [];
  const paragraphRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let match;
  let truncated = false;

  while ((match = paragraphRegex.exec(xmlText)) !== null) {
    if (blocks.length >= MAX_DOCX_PARAGRAPHS) {
      truncated = true;
      break;
    }

    const paragraphXml = match[0];
    const pPrMatch = paragraphXml.match(/<w:pPr[ >][\s\S]*?<\/w:pPr>/);
    const pPrXml = pPrMatch ? pPrMatch[0] : "";

    const headingMatch = pPrXml.match(/<w:pStyle[^>]*w:val="(Heading[1-3]|Title)"/);
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
