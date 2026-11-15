// HTML to PDF page images, entirely offline. Needs a DOM (canvas). Nothing is fetched or sent anywhere.
// Pipeline: DOMParser (inert: no scripts run, no resources load) -> strip everything active or remote ->
// measure in a sandboxed iframe with no scripts -> draw each page through an SVG <foreignObject> image,
// which the browser renders without scripts or network access -> JPEG per page for rasterToPdf.
// Limits: pages are pictures (text is not selectable); remote images, fonts and styles are dropped;
// long content is cut at fixed page heights, so a line can be split between two pages.
import { MAX_PNG_PAGES } from "../viewer/convert/pdfExport.js";

const PAGES = {
  a4: { width: 794, height: 1123, ptWidth: 595, ptHeight: 842 },
  letter: { width: 816, height: 1056, ptWidth: 612, ptHeight: 792 },
};
const MARGIN = 48;
const SCALE = 2;
const JPEG_QUALITY = 0.9;
const MAX_HTML_CHARS = 5_000_000;
const REMOVE_TAGS = ["script", "iframe", "frame", "frameset", "object", "embed", "applet", "link", "meta", "base", "audio", "video", "source", "track", "canvas", "noscript", "template", "portal", "use", "image", "foreignObject", "form", "input", "button", "textarea", "select"];
const URL_ATTRS = ["href", "src", "srcset", "poster", "action", "formaction", "xlink:href", "background", "data", "ping", "cite"];

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

// Drops remote url() / @import from CSS text; data: URLs stay.
export function cleanCss(css) {
  return String(css)
    .replace(/@import[^;{]*;?/gi, "")
    .replace(/url\(\s*(['"]?)\s*(?!data:)[^)]*\)/gi, "none");
}

// Removes scripts, frames, forms, event handlers and every non-data: URL from a parsed (inert) document.
export function sanitizeDocument(doc) {
  for (const tag of REMOVE_TAGS) for (const node of Array.from(doc.querySelectorAll(tag))) node.remove();
  for (const node of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) node.removeAttribute(attr.name);
      else if (URL_ATTRS.includes(name)) {
        const keep = node.localName === "img" && name === "src" && /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/.test(value);
        if (!keep) node.removeAttribute(attr.name);
      } else if (name === "style") node.setAttribute("style", cleanCss(attr.value));
    }
  }
  for (const style of Array.from(doc.querySelectorAll("style"))) style.textContent = cleanCss(style.textContent);
  return doc;
}

function measure(doc, contentWidth) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin"); // no allow-scripts: nothing can run inside
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${contentWidth}px;height:10px;border:0;visibility:hidden`;
  document.body.append(frame);
  try {
    const inner = frame.contentDocument;
    for (const style of doc.querySelectorAll("style")) inner.head.append(inner.importNode(style, true));
    inner.body.replaceWith(inner.importNode(doc.body, true));
    inner.body.style.margin = "0";
    inner.body.style.width = `${contentWidth}px`;
    return Math.max(inner.documentElement.scrollHeight, inner.body.scrollHeight, 1);
  } finally {
    frame.remove();
  }
}

function pageSvg(doc, ns, { contentWidth, contentHeight, top }) {
  const svg = document.createElementNS(ns.svg, "svg");
  svg.setAttribute("width", String(contentWidth));
  svg.setAttribute("height", String(contentHeight));
  const fo = document.createElementNS(ns.svg, "foreignObject");
  fo.setAttribute("width", "100%");
  fo.setAttribute("height", "100%");
  const wrap = document.createElementNS(ns.html, "div");
  wrap.setAttribute("style", `width:${contentWidth}px;height:${contentHeight}px;overflow:hidden;position:relative;background:#fff;color:#000;color-scheme:light`);
  for (const style of doc.querySelectorAll("style")) wrap.append(document.importNode(style, true));
  const body = document.importNode(doc.body, true);
  body.setAttribute("style", `${body.getAttribute("style") || ""};position:absolute;margin:0;left:0;top:${-top}px;width:${contentWidth}px;`);
  wrap.append(body);
  fo.append(wrap);
  svg.append(fo);
  return new XMLSerializer().serializeToString(svg);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The page could not be drawn. The HTML may be too complex or invalid."));
    img.src = src;
  });
}

// Returns { name, pages: [{width, height, jpegBytes}] (PDF points), totalPages } or throws a readable Error.
export async function renderHtmlToPages({ name, html, pageSize = "a4", onProgress = () => {}, isCurrent = () => true }) {
  const text = String(html == null ? "" : html);
  if (!text.trim()) throw new Error("There is no HTML to convert. Choose a file or paste some code.");
  if (text.length > MAX_HTML_CHARS) throw new Error("This HTML is too large to convert (over 5 million characters).");
  const page = PAGES[pageSize] || PAGES.a4;
  const doc = sanitizeDocument(new DOMParser().parseFromString(text, "text/html"));
  const probe = document.getElementById("svg-probe");
  const ns = { svg: probe.namespaceURI, html: document.documentElement.namespaceURI };
  const contentWidth = page.width - MARGIN * 2;
  const pageContent = page.height - MARGIN * 2;
  onProgress("Laying out the page…");
  const total = measure(doc, contentWidth);
  const count = Math.ceil(total / pageContent);
  const used = Math.min(count, MAX_PNG_PAGES);
  const pages = [];
  for (let k = 0; k < used; k++) {
    if (!isCurrent()) throw new Error("Cancelled.");
    onProgress(`Page ${k + 1} of ${used}`);
    const svg = pageSvg(doc, ns, { contentWidth, contentHeight: pageContent, top: k * pageContent });
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const canvas = document.createElement("canvas");
    canvas.width = page.width * SCALE;
    canvas.height = page.height * SCALE;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, MARGIN * SCALE, MARGIN * SCALE, contentWidth * SCALE, pageContent * SCALE);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error("JPEG encoding failed.");
    pages.push({ width: page.ptWidth, height: page.ptHeight, jpegBytes: new Uint8Array(await blob.arrayBuffer()) });
    await yieldToEventLoop();
  }
  return { name, pages, totalPages: count };
}
