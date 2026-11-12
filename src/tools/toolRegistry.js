// Tools page registry: one entry per offline PDF tool, wired to the DOM-free engine in
// src/viewer/pdftools/. Pure and node-testable: no DOM, no network, no storage.
// run(files, values) -> Promise<{files, warnings}>. files are {name, bytes} (Uint8Array), except for
// the color-copy tool (render: true) whose files are {name, pages, totalPages}: the UI renders the
// pages with PDF.js first and passes [{width, height, jpegBytes}].
import { mergePdfs, extractPages, removePages, splitPdf, reorderPages, rotatePages } from "../viewer/pdftools/pageTools.js";
import { imagesToPdf } from "../viewer/pdftools/imagesToPdf.js";
import { addPageNumbers, addWatermark } from "../viewer/pdftools/stampTools.js";
import { stripMetadata, inspectMetadata } from "../viewer/pdftools/stripMetadata.js";
import { rasterToPdf } from "../viewer/pdftools/rasterExport.js";
import { loadPdf } from "../viewer/pdftools/loadPdf.js";
import { makeResult } from "../viewer/pdftools/result.js";
import { exportFileName } from "../viewer/convert/exportFormats.js";

const RANGE_HINT = "e.g. 1-3, 5";

function freezeTool(tool) {
  for (const o of tool.options) {
    if (o.choices) o.choices.forEach(Object.freeze);
    Object.freeze(o.choices);
    Object.freeze(o);
  }
  Object.freeze(tool.options);
  return Object.freeze(tool);
}

const first = (files) => files[0];

async function rotateAll(input, pages, angle) {
  let range = String(pages == null ? "" : pages).trim();
  if (!range) {
    const doc = await loadPdf(input.bytes, input.name);
    range = `1-${doc.getPageCount()}`;
  }
  return rotatePages(input, range, angle);
}

async function colorCopy(input, mode) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const result = await rasterToPdf(pages);
  const warnings = [...result.warnings];
  const total = Number(input.totalPages) || 0;
  if (total > pages.length && pages.length > 0) {
    warnings.unshift(`Only the first ${pages.length} of ${total} pages were exported.`);
  }
  const file = { ...result.files[0], name: exportFileName(input.name, "pdf", `-${mode}`) };
  return makeResult([file], warnings);
}

export const TOOLS = Object.freeze([
  {
    id: "merge",
    title: "Merge PDFs",
    description: "Combine several PDFs into one, in the order listed.",
    accepts: "pdf",
    multiple: true,
    minFiles: 2,
    options: [],
    run: (files) => mergePdfs(files),
  },
  {
    id: "split",
    title: "Split PDF",
    description: "Split a PDF into several files. Leave the groups blank to get one file per page.",
    accepts: "pdf",
    multiple: false,
    options: [{ id: "groups", label: "Page groups (one file each)", type: "text", default: "", placeholder: "e.g. 1-3, 4-6" }],
    run: (files, v) => splitPdf(first(files), v.groups),
  },
  {
    id: "extract",
    title: "Extract pages",
    description: "Make a new PDF from the pages you list, in that order.",
    accepts: "pdf",
    multiple: false,
    options: [{ id: "pages", label: "Pages", type: "text", default: "", placeholder: RANGE_HINT }],
    run: (files, v) => extractPages(first(files), v.pages),
  },
  {
    id: "remove",
    title: "Remove pages",
    description: "Make a copy of the PDF without the pages you list.",
    accepts: "pdf",
    multiple: false,
    options: [{ id: "pages", label: "Pages to remove", type: "text", default: "", placeholder: RANGE_HINT }],
    run: (files, v) => removePages(first(files), v.pages),
  },
  {
    id: "reorder",
    title: "Reorder pages",
    description: "List every page in the new order. Pages you leave out are dropped.",
    accepts: "pdf",
    multiple: false,
    options: [{ id: "order", label: "New page order", type: "text", default: "", placeholder: "e.g. 3, 1, 2, 4-6" }],
    run: (files, v) => reorderPages(first(files), v.order),
  },
  {
    id: "rotate",
    title: "Rotate pages",
    description: "Rotate the pages you list clockwise. Leave the pages blank to rotate every page.",
    accepts: "pdf",
    multiple: false,
    options: [
      { id: "pages", label: "Pages (blank = all)", type: "text", default: "", placeholder: RANGE_HINT },
      {
        id: "angle",
        label: "Rotate by",
        type: "select",
        default: "90",
        choices: [
          { value: "90", label: "90° clockwise" },
          { value: "180", label: "180°" },
          { value: "270", label: "90° counter-clockwise" },
        ],
      },
    ],
    run: (files, v) => rotateAll(first(files), v.pages, Number(v.angle)),
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description: "Turn JPG and PNG images into one PDF, one image per page, in the order listed.",
    accepts: "images",
    multiple: true,
    options: [
      {
        id: "pageSize",
        label: "Page size",
        type: "select",
        default: "fit",
        choices: [
          { value: "fit", label: "Fit each image" },
          { value: "a4", label: "A4" },
          { value: "letter", label: "Letter" },
        ],
      },
    ],
    run: (files, v) => imagesToPdf(files, { pageSize: v.pageSize }),
  },
  {
    id: "page-numbers",
    title: "Add page numbers",
    description: "Stamp a page number on every page.",
    accepts: "pdf",
    multiple: false,
    options: [
      {
        id: "position",
        label: "Position",
        type: "select",
        default: "bottom-center",
        choices: [
          { value: "bottom-center", label: "Bottom center" },
          { value: "bottom-right", label: "Bottom right" },
          { value: "top-center", label: "Top center" },
          { value: "top-right", label: "Top right" },
        ],
      },
      {
        id: "format",
        label: "Format",
        type: "select",
        default: "n",
        choices: [
          { value: "n", label: "1, 2, 3" },
          { value: "n-of-total", label: "1 of 10" },
        ],
      },
      { id: "startAt", label: "Start at", type: "number", default: 1, min: 1, max: 1000000, step: 1 },
      { id: "size", label: "Text size", type: "number", default: 10, min: 4, max: 200, step: 1 },
    ],
    run: (files, v) => addPageNumbers(first(files), v),
  },
  {
    id: "watermark",
    title: "Add watermark",
    description: "Stamp a text watermark on the pages. The built-in font draws Latin letters only; other characters are replaced with \"?\" and you will see a warning.",
    accepts: "pdf",
    multiple: false,
    options: [
      { id: "text", label: "Watermark text", type: "text", default: "", placeholder: "e.g. DRAFT" },
      { id: "size", label: "Text size", type: "number", default: 48, min: 4, max: 400, step: 1 },
      { id: "opacity", label: "Opacity", type: "number", default: 0.3, min: 0.05, max: 1, step: 0.05 },
      { id: "diagonal", label: "Diagonal", type: "checkbox", default: true },
      { id: "pages", label: "Pages (blank = all)", type: "text", default: "", placeholder: RANGE_HINT },
    ],
    run: (files, v) => addWatermark(first(files), v),
  },
  {
    id: "strip-metadata",
    title: "Strip metadata",
    description:
      "Removes the document Info fields and XMP metadata only (title, author, subject, keywords, creator, producer, dates). " +
      "It does not touch annotation authors, attachments, form field values or other data stored in the pages, so check those separately if they matter.",
    accepts: "pdf",
    multiple: false,
    options: [],
    inspect: (bytes) => inspectMetadata(bytes),
    run: (files) => stripMetadata(first(files)),
  },
  {
    id: "color-copy",
    title: "Dark, sepia or grayscale copy",
    description:
      "Makes an image-only copy: pages are re-rendered as images, so text is not selectable or searchable. " +
      "Colors may differ slightly from the viewer's on-screen dark mode. At most the first 50 pages are converted.",
    accepts: "pdf",
    multiple: false,
    render: true,
    options: [
      {
        id: "mode",
        label: "Colors",
        type: "select",
        default: "dark",
        choices: [
          { value: "dark", label: "Dark (image copy)" },
          { value: "sepia", label: "Sepia (image copy)" },
          { value: "gray", label: "Grayscale (image copy)" },
        ],
      },
    ],
    run: (files, v) => colorCopy(first(files), v.mode),
  },
].map(freezeTool));

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

export function getTool(id) {
  return BY_ID.get(String(id)) || null;
}

// "#merge" -> the merge tool; anything unknown -> null.
export function toolFromHash(hash) {
  const id = String(hash == null ? "" : hash).replace(/^#/, "").trim().toLowerCase();
  return id ? getTool(id) : null;
}

// Raw form values (strings / booleans) -> typed values for run(). Missing values use the default.
export function readValues(tool, raw = {}) {
  const values = {};
  for (const o of tool.options) {
    const has = raw != null && Object.prototype.hasOwnProperty.call(raw, o.id);
    const v = has ? raw[o.id] : undefined;
    if (o.type === "number") {
      const text = v === undefined || v === null ? "" : String(v).trim();
      values[o.id] = text === "" ? o.default : Number(text);
    } else if (o.type === "checkbox") {
      values[o.id] = v === undefined ? o.default : !!v;
    } else if (o.type === "select") {
      values[o.id] = o.choices.some((c) => c.value === String(v)) ? String(v) : o.default;
    } else {
      values[o.id] = v === undefined || v === null ? o.default : String(v);
    }
  }
  return values;
}

const messageOf = (e) => String((e && e.message) || e || "Something went wrong.");

// Runs a tool. Multi-file tools get every file in one call; single-file tools run once per file
// so one bad file does not stop the others. Returns {outputs: [{source, files, warnings}], errors: [{name, message}]}.
export async function runTool(tool, files, values, onProgress = () => {}) {
  const outputs = [];
  const errors = [];
  const list = Array.isArray(files) ? files : [];
  if (tool.multiple) {
    const label = tool.id === "merge" ? "PDFs to merge" : "files";
    if (list.length < (tool.minFiles || 1)) {
      errors.push({ name: "", message: `Add at least ${tool.minFiles || 1} ${label}.` });
      return { outputs, errors };
    }
    onProgress(`Working on ${list.length} file${list.length > 1 ? "s" : ""}…`);
    try {
      const r = await tool.run(list, values);
      outputs.push({ source: list.map((f) => f.name).join(", "), files: r.files, warnings: r.warnings });
    } catch (e) {
      errors.push({ name: "", message: messageOf(e) });
    }
    return { outputs, errors };
  }
  if (list.length === 0) {
    errors.push({ name: "", message: "Add a PDF first." });
    return { outputs, errors };
  }
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    onProgress(list.length > 1 ? `File ${i + 1} of ${list.length}: ${f.name}` : `Working on ${f.name}…`);
    try {
      const r = await tool.run([f], values);
      outputs.push({ source: f.name, files: r.files, warnings: r.warnings });
    } catch (e) {
      errors.push({ name: f.name, message: messageOf(e) });
    }
  }
  return { outputs, errors };
}

// Unique names for a zip: "a.pdf", "a.pdf" -> "a.pdf", "a-2.pdf" (case-insensitive, like file systems).
export function zipEntryNames(names) {
  const used = new Set();
  return names.map((name) => {
    let candidate = name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base}-${n}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
