// External link to the separate PDF Tools website (merge, split, compress, convert, encrypt and more).
// The extension only opens it in a new tab; it never sends anything to it.
// TODO(owner): replace with the real domain before release. Must stay a single https URL, no query or fragment.
(function (root) {
  const api = Object.freeze({ PDF_TOOLS_URL: "https://pdf-tools.example.invalid/" });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ExternalLinks = api;
})(typeof window !== "undefined" ? window : globalThis);
