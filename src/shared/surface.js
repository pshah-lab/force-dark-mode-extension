// Which kind of surface a feature was used on, for the opt-in usage report (consent v4). This is the ONLY place a
// URL is read for the report, and the result is always one of the 9 fixed strings in SURFACES: nothing derived
// from the input (no host, path, document ID or file name) is ever returned.
// A classic script (the popup loads it with a <script> tag, setting the global SurfaceKind). ES modules and node
// tests load it with `import "./surface.js"` and read globalThis.SurfaceKind. There is exactly one implementation.
(function (root) {
  const SURFACES = Object.freeze([
    "google_docs", "google_sheets", "google_slides",
    "web_pdf", "local_pdf", "local_sheet", "local_doc",
    "web_other", "other",
  ]);

  // First path segment on docs.google.com (https only) -> surface.
  const GOOGLE_APPS = Object.freeze({ document: "google_docs", spreadsheets: "google_sheets", presentation: "google_slides" });
  const LOCAL_SHEET_KINDS = Object.freeze(["xlsx", "csv"]);
  const LOCAL_DOC_KINDS = Object.freeze(["docx", "pptx", "md", "txt", "rtf"]);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function surfaceForUrl(input) {
    if (input.length === 0) return "other";
    let u;
    try {
      u = new URL(input);
    } catch (_) {
      return "other";
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return "other";
    if (
      u.protocol === "https:" &&
      u.hostname === "docs.google.com" &&
      u.username === "" &&
      u.password === ""
    ) {
      const first = u.pathname.split("/")[1];
      if (hasOwn(GOOGLE_APPS, first)) return GOOGLE_APPS[first];
    }
    return "web_other";
  }

  function surfaceForDescriptor(d) {
    const kind = d.kind;
    if (typeof kind !== "string") return "other";
    if (kind === "pdf") {
      if (d.source === "url") return "web_pdf";
      if (d.source === "file") return "local_pdf";
      return "other";
    }
    if (LOCAL_SHEET_KINDS.includes(kind)) return "local_sheet";
    if (LOCAL_DOC_KINDS.includes(kind)) return "local_doc";
    return "other";
  }

  // input: a page URL string, or a viewer descriptor { kind, source }. Always returns a member of SURFACES.
  function surfaceFor(input) {
    if (typeof input === "string") return surfaceForUrl(input);
    if (input !== null && typeof input === "object" && !Array.isArray(input)) {
      try {
        return surfaceForDescriptor(input);
      } catch (_) {
        return "other";
      }
    }
    return "other";
  }

  const api = Object.freeze({ SURFACES, surfaceFor });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SurfaceKind = api;
})(typeof window !== "undefined" ? window : globalThis);
