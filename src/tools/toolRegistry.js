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
import { compressPdf } from "../viewer/pdftools/compressTools.js";
import { encryptPdf, decryptPdf } from "../viewer/pdftools/encryptTools.js";
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

const ORGANIZE_RUNNERS = {
  extract: (input, v) => extractPages(input, v.pages),
  remove: (input, v) => removePages(input, v.pages),
  reorder: (input, v) => reorderPages(input, v.pages),
  rotate: (input, v) => rotateAll(input, v.pages, Number(v.angle)),
};

// PDF to Images: the page renders itself first (PDF.js needs a canvas), then passes {name, images, totalPages}.
async function pdfToImages(rendered) {
  const images = Array.isArray(rendered.images) ? rendered.images : [];
  const warnings = [];
  const total = Number(rendered.totalPages) || 0;
  if (total > images.length && images.length > 0) warnings.push(`Only ${images.length} of ${total} pages were converted.`);
  return makeResult(images, warnings);
}

// HTML to PDF: the page rasterises the HTML first, then passes {name, pages: [{width, height, jpegBytes}]}.
async function htmlToPdf(rendered) {
  const result = await rasterToPdf(Array.isArray(rendered.pages) ? rendered.pages : []);
  const file = { ...result.files[0], name: exportFileName(rendered.name, "pdf") };
  return makeResult([file], result.warnings);
}

export const CATEGORIES = Object.freeze(["ORGANIZE", "OPTIMIZE", "EDIT", "CONVERT", "SECURITY", "SHARE"]);

// Grid card data: short summary, category chip, tile colour class (see tools.css), NEW pill, card title.
const META = {
  merge: { cardTitle: "Merge PDF", summary: "Combine multiple PDF files into one", category: "ORGANIZE", tile: "blue", grid: 1 },
  split: { cardTitle: "Split PDF", summary: "Extract pages or split into multiple files", category: "ORGANIZE", tile: "violet", grid: 2 },
  compress: { summary: "Reduce PDF file size", category: "OPTIMIZE", tile: "orange", grid: 3 },
  rotate: { cardTitle: "Rotate PDF", summary: "Rotate PDF pages", category: "EDIT", tile: "green", grid: 4 },
  "pdf-to-images": { summary: "Convert PDF pages to JPG or PNG", category: "CONVERT", tile: "indigo", grid: 5 },
  "images-to-pdf": { cardTitle: "Images to PDF", summary: "Convert images to PDF document", category: "CONVERT", tile: "pink", grid: 6 },
  organize: { summary: "Reorder, rotate, or delete PDF pages", category: "ORGANIZE", tile: "amber", grid: 7 },
  watermark: { cardTitle: "Add Watermark", summary: "Add text watermark to PDF pages", category: "EDIT", tile: "teal", grid: 8 },
  encrypt: { summary: "Add password protection and control permissions", category: "SECURITY", tile: "rose", isNew: true, grid: 9 },
  decrypt: { summary: "Remove password protection from encrypted PDFs", category: "SECURITY", tile: "sky", isNew: true, grid: 10 },
  "html-to-pdf": { summary: "Convert HTML files or code to PDF documents", category: "CONVERT", tile: "purple", grid: 11 },
  share: { summary: "Send files directly between devices on your network", category: "SHARE", tile: "emerald", isNew: true, grid: 12 },
  "page-numbers": { cardTitle: "Add Page Numbers", summary: "Stamp a page number on every page", category: "EDIT", tile: "cyan", grid: 13 },
  "strip-metadata": { cardTitle: "Strip Metadata", summary: "Remove title, author and other document info", category: "SECURITY", tile: "slate", grid: 14 },
  "color-copy": { cardTitle: "Dark, Sepia or Gray Copy", summary: "Make a dark, sepia or grayscale image copy", category: "CONVERT", tile: "navy", grid: 15 },
  // Folded into Organize Pages for the grid; still reachable by hash and from the viewer.
  extract: { grid: 0 },
  remove: { grid: 0 },
  reorder: { grid: 0 },
};
// Not offered by the document viewer's Tools control (they need passwords, an HTML source, or many renders).
const NOT_IN_VIEWER = new Set(["compress", "organize", "encrypt", "decrypt", "pdf-to-images", "html-to-pdf", "share"]);

const NEW_TOOLS = [
  {
    id: "compress",
    title: "Compress PDF",
    description:
      "Makes the PDF smaller by storing uncompressed data efficiently and, if you choose, re-saving large photos as lower-quality JPEGs. " +
      "PDFs that are already compact may not shrink at all; the result tells you the real saving, and you keep the original either way.",
    accepts: "pdf",
    multiple: false,
    options: [
      {
        id: "imageQuality", label: "Photos", type: "select", default: "medium",
        choices: [
          { value: "none", label: "Keep photos as they are" },
          { value: "medium", label: "Shrink photos (good quality)" },
          { value: "low", label: "Shrink photos (smallest file)" },
        ],
      },
      { id: "removeMetadata", label: "Also remove title, author and other document info", type: "checkbox", default: false },
    ],
    run: (files, v, hooks) => compressPdf(first(files), v, hooks),
  },
  {
    id: "pdf-to-images",
    title: "PDF to Images",
    description: "Turn each page of a PDF into a JPG or PNG picture. Up to 50 pages at a time; several images download as one .zip.",
    accepts: "pdf",
    multiple: false,
    renderer: "pdf-images",
    options: [
      {
        id: "format", label: "Image format", type: "select", default: "jpg",
        choices: [{ value: "jpg", label: "JPG (smaller files)" }, { value: "png", label: "PNG (sharp text)" }],
      },
      { id: "pages", label: "Pages (blank = all)", type: "text", default: "", placeholder: RANGE_HINT },
    ],
    run: (files) => pdfToImages(first(files)),
  },
  {
    id: "organize",
    title: "Organize Pages",
    description: "Pick pages to keep or delete, list them in a new order, or rotate pages. Reorder takes every page you want, in the new order; pages left out are dropped.",
    accepts: "pdf",
    multiple: false,
    options: [
      {
        id: "action", label: "What to do", type: "select", default: "extract",
        choices: [
          { value: "extract", label: "Keep only these pages" },
          { value: "remove", label: "Delete these pages" },
          { value: "reorder", label: "Reorder pages" },
          { value: "rotate", label: "Rotate pages" },
        ],
      },
      { id: "pages", label: "Pages (blank = all, when rotating)", type: "text", default: "", placeholder: "e.g. 3, 1, 2, 4-6" },
      {
        id: "angle", label: "Rotate by", type: "select", default: "90", showIf: { option: "action", values: ["rotate"] },
        choices: [
          { value: "90", label: "90° clockwise" },
          { value: "180", label: "180°" },
          { value: "270", label: "90° counter-clockwise" },
        ],
      },
    ],
    run: (files, v) => ORGANIZE_RUNNERS[v.action](first(files), v),
  },
  {
    id: "encrypt",
    title: "Encrypt PDF",
    description:
      "Locks the PDF with a password (AES-256) on this device; the file and password never leave it. Set an owner password too if you want to choose what is allowed once it is open. " +
      "Those permissions are advice: some PDF programs ignore them. Keep the password safe, it cannot be recovered.",
    accepts: "pdf",
    multiple: false,
    options: [
      { id: "userPassword", label: "Password to open", type: "password", default: "" },
      { id: "ownerPassword", label: "Owner password (optional, blank = random)", type: "password", default: "" },
      { id: "allowPrint", label: "Allow printing", type: "checkbox", default: true },
      { id: "allowCopy", label: "Allow copying text", type: "checkbox", default: true },
      { id: "allowEdit", label: "Allow editing", type: "checkbox", default: false },
    ],
    run: (files, v) => encryptPdf(first(files), v),
  },
  {
    id: "decrypt",
    title: "Decrypt PDF",
    description:
      "Removes the password from a PDF you can open, on this device. Enter the password to open it (or the owner password). " +
      "Works on AES-256, AES-128 and RC4 protected files; it cannot guess or crack a lost password.",
    accepts: "pdf",
    multiple: false,
    options: [{ id: "password", label: "Password", type: "password", default: "" }],
    run: (files, v) => decryptPdf(first(files), { password: v.password }),
  },
  {
    id: "html-to-pdf",
    title: "HTML to PDF",
    description:
      "Turns an HTML file or pasted code into a PDF on this device, without scripts and without loading anything from the internet: " +
      "images, fonts and stylesheets that point to remote addresses are left out. Pages become pictures, so text is not selectable. " +
      "Choose a .html file, or paste code below.",
    accepts: "html",
    multiple: false,
    renderer: "html",
    allowPaste: true,
    options: [
      { id: "html", label: "Or paste HTML here", type: "textarea", default: "", placeholder: "<h1>Hello</h1>" },
      {
        id: "pageSize", label: "Page size", type: "select", default: "a4",
        choices: [{ value: "a4", label: "A4" }, { value: "letter", label: "Letter" }],
      },
    ],
    run: (files) => htmlToPdf(first(files)),
  },
  {
    id: "share",
    title: "Share Files",
    description: "Send files directly between devices on the same network.",
    accepts: "none",
    multiple: false,
    disabled: true,
    comingSoon:
      "Coming soon. Sending files between devices on the same network needs a connection set-up server or extra browser permissions. " +
      "This extension keeps everything on your device with no server and no extra permissions, so the card stays off until there is a way to do it without breaking that.",
    options: [],
    run: async () => {
      throw new Error("Share Files is coming soon.");
    },
  },
];

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
].concat(NEW_TOOLS).map((t) => freezeTool({
  ...t,
  ...META[t.id],
  viewer: !NOT_IN_VIEWER.has(t.id),
})));

// Cards shown on the Tools page, in order (extract / remove / reorder live inside Organize Pages).
export function gridTools() {
  return TOOLS.filter((t) => t.grid > 0).sort((a, b) => a.grid - b.grid);
}

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

export function getTool(id) {
  return BY_ID.get(String(id)) || null;
}

// "#merge" -> the merge tool; anything unknown -> null.
export function toolFromHash(hash) {
  const id = String(hash == null ? "" : hash).replace(/^#/, "").trim().toLowerCase();
  const tool = id ? getTool(id) : null;
  return tool && !tool.disabled ? tool : null;
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
export async function runTool(tool, files, values, onProgress = () => {}, hooks = {}) {
  const outputs = [];
  const errors = [];
  if (tool.disabled) {
    errors.push({ name: "", message: `${tool.title} is coming soon.` });
    return { outputs, errors };
  }
  const list = Array.isArray(files) ? files : [];
  if (tool.multiple) {
    const label = tool.id === "merge" ? "PDFs to merge" : "files";
    if (list.length < (tool.minFiles || 1)) {
      errors.push({ name: "", message: `Add at least ${tool.minFiles || 1} ${label}.` });
      return { outputs, errors };
    }
    onProgress(`Working on ${list.length} file${list.length > 1 ? "s" : ""}…`);
    try {
      const r = await tool.run(list, values, hooks);
      outputs.push({ source: list.map((f) => f.name).join(", "), files: r.files, warnings: r.warnings, notes: r.notes || [] });
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
      const r = await tool.run([f], values, hooks);
      outputs.push({ source: f.name, files: r.files, warnings: r.warnings, notes: r.notes || [] });
    } catch (e) {
      errors.push({ name: f.name, message: messageOf(e) });
    }
  }
  return { outputs, errors };
}

const ACCEPTED = {
  pdf: { exts: [".pdf"], mimes: ["application/pdf"], reason: "not a PDF" },
  html: { exts: [".html", ".htm"], mimes: ["text/html"], reason: "not an HTML file" },
  images: { exts: [".jpg", ".jpeg", ".png"], mimes: ["image/jpeg", "image/png"], reason: "not a JPG or PNG image" },
};

// Does this dropped / chosen file match what the tool takes? {name, type} like a DOM File. Never throws.
export function acceptsFile(tool, file) {
  const rule = tool && ACCEPTED[tool.accepts];
  if (!rule || !file) return false;
  const name = String(file.name == null ? "" : file.name).toLowerCase();
  const type = String(file.type == null ? "" : file.type).toLowerCase();
  return rule.mimes.includes(type) || rule.exts.some((ext) => name.endsWith(ext) && name.length > ext.length);
}

const MAX_SHOWN_NAME = 80;

// Status text for a rejected file. Control / bidi characters removed and long names truncated;
// the caller shows it with textContent.
export function skipMessage(tool, name) {
  const rule = (tool && ACCEPTED[tool.accepts]) || ACCEPTED.pdf;
  let shown = String(name == null ? "" : name).replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "").trim();
  const chars = Array.from(shown);
  if (chars.length > MAX_SHOWN_NAME) shown = `${chars.slice(0, MAX_SHOWN_NAME).join("")}…`;
  return `Skipped ${shown || "an unnamed item"}: ${rule.reason}`;
}

// Whether the selected tool should show what it found in the loaded files (strip metadata).
export function needsInspection(tool, files) {
  return !!(tool && typeof tool.inspect === "function" && Array.isArray(files) && files.length > 0);
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
