const MAX_PPTX_SLIDES = 500;
const SLIDE_ENTRY_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;
const XML_NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlEntities(text) {
  return text.replace(/&(#(\d+)|amp|lt|gt|quot|apos);/g, (match, _entity, numeric) => {
    if (numeric) return String.fromCodePoint(Number(numeric));
    return XML_NAMED_ENTITIES[match.slice(1, -1)] ?? match;
  });
}

export function parsePptxSlideXml(xmlText) {
  const blocks = [];
  const paragraphRegex = /<a:p[ >][\s\S]*?<\/a:p>/g;
  let match;

  while ((match = paragraphRegex.exec(xmlText)) !== null) {
    const paragraphXml = match[0];
    const runs = [];
    const runRegex = /<a:r[ >][\s\S]*?<\/a:r>/g;
    let runMatch;

    while ((runMatch = runRegex.exec(paragraphXml)) !== null) {
      const runXml = runMatch[0];
      const rPrMatch = runXml.match(/<a:rPr[^>]*\/?>/);
      const rPrTag = rPrMatch ? rPrMatch[0] : "";
      const bold = /\bb="1"/.test(rPrTag);
      const italic = /\bi="1"/.test(rPrTag);

      let text = "";
      const textRegex = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
      let textMatch;
      while ((textMatch = textRegex.exec(runXml)) !== null) {
        text += decodeXmlEntities(textMatch[1]);
      }

      if (text) runs.push({ text, bold, italic });
    }

    if (runs.length > 0) blocks.push({ runs });
  }

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
