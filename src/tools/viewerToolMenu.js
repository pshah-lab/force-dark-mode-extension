// Which PDF tools the document viewer's "Tools" control offers, and when it is usable.
// Pure and node-testable: no DOM, no network, no storage.
import { TOOLS } from "./toolRegistry.js";

// Tools that need several files, or produce several, open the Tools page instead.
const HANDOFF_IDS = new Set(["merge", "split", "images-to-pdf"]);

// Single-file tools run on the PDF open in the viewer (same frozen registry entries, so labels and copy match).
export const VIEWER_TOOLS = Object.freeze(
  TOOLS.filter((t) => t.viewer && t.accepts === "pdf" && !t.multiple && !HANDOFF_IDS.has(t.id))
);

export const HANDOFF_TOOLS = Object.freeze(TOOLS.filter((t) => HANDOFF_IDS.has(t.id)));

const TOOLS_PAGE = "src/tools/tools.html";

// Extension-relative path of the Tools page, preselecting a known tool. Pass to chrome.runtime.getURL.
export function toolsPagePath(id) {
  const known = TOOLS.some((t) => t.id === id);
  return known ? `${TOOLS_PAGE}#${id}` : TOOLS_PAGE;
}

// State of the viewer's Tools control for the open document.
// kind: detectDocumentKind result ("pdf", "docx", ...) or null. Any open PDF qualifies: the viewer reads its
// file data lazily, when a tool runs (held bytes for Open file, the loaded PDF.js document otherwise).
export function viewerToolsState(kind) {
  if (!kind) return { enabled: false, placeholder: "Open a file first", title: "" };
  if (kind !== "pdf") {
    return { enabled: false, placeholder: "PDFs only", title: "Tools work on PDFs. Open a PDF to use them." };
  }
  return { enabled: true, placeholder: "", title: "" };
}
