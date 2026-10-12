// Per-site custom CSS sanitiser. User-authored CSS must never be able to make a
// network request or run script, so anything that could do either is rejected
// outright (nothing is rewritten): the caller stores or injects the original text
// only when validateCss says it is safe.
(function (global) {
  function maxChars() {
    const limits = global.ForceDarkThemes && global.ForceDarkThemes.LIMITS;
    return limits && Number.isInteger(limits.MAX_CSS_CHARS) ? limits.MAX_CSS_CHARS : 6000;
  }

  // Each entry: [label, pattern]. Patterns run on ASCII-lowercased, comment-free text.
  // No "i" or "u" regex flags: CSS matches names ASCII case-insensitively only, and the
  // "u" flag would fold lookalikes such as the long s into ASCII letters. The gap between
  // a name and "(" or ":" (and after "@") uses JS \s, which is wider than CSS whitespace,
  // so any spacing is caught. Longer names come first so ties name the specific one.
  const NETWORK = "could load content from the network";
  const SCRIPT = "could run script";
  const FORBIDDEN = [
    ["@import", /@\s*import/g, NETWORK],
    ["@namespace", /@\s*namespace/g, NETWORK],
    ["@font-face", /@\s*font-face/g, NETWORK],
    ["url(", /url\s*\(/g, NETWORK],
    ["-webkit-image-set(", /-webkit-image-set\s*\(/g, NETWORK],
    ["image-set(", /image-set\s*\(/g, NETWORK],
    ["image(", /image\s*\(/g, NETWORK],
    ["src(", /src\s*\(/g, NETWORK],
    ["cross-fade(", /cross-fade\s*\(/g, NETWORK],
    ["expression(", /expression\s*\(/g, SCRIPT],
    // Needs a left boundary: scroll-behavior and overscroll-behavior are ordinary properties.
    ["behavior:", /(^|[^a-z0-9_-])(?:-ms-)?behavior\s*:/g, SCRIPT],
    ["-moz-binding", /-moz-binding/g, SCRIPT],
    ["javascript:", /javascript\s*:/g, SCRIPT],
  ];

  function fail(error) {
    return { ok: false, error };
  }

  function asciiLower(text) {
    return text.replace(/[A-Z]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 32));
  }

  // Removes /* ... */ comments the way the CSS tokenizer sees them: "/*" inside a
  // string is plain text, a quote inside a comment does not open a string, and a
  // string ends at its closing quote or at a newline (CR, LF or FF). Strings are kept
  // in the output so their contents are scanned too. Comments are removed without a
  // replacement, so "ur/**/l(" is scanned as "url(". Returns null for an unclosed comment.
  function stripComments(text) {
    let out = "";
    let i = 0;
    const n = text.length;
    while (i < n) {
      const ch = text[i];
      if (ch === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        if (end === -1) return null;
        i = end + 2;
        continue;
      }
      if (ch === "\"" || ch === "'") {
        let j = i + 1;
        while (j < n && text[j] !== ch && text[j] !== "\n" && text[j] !== "\r" && text[j] !== "\f") j++;
        if (j < n && text[j] === ch) j++;
        out += text.slice(i, j);
        i = j;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }

  function validateCss(css) {
    if (typeof css !== "string") return fail("Custom CSS must be text.");
    const max = maxChars();
    if (css.length > max) return fail(`Custom CSS must be at most ${max} characters.`);
    if (css.indexOf("\\") !== -1) return fail("Custom CSS cannot contain a backslash (\\).");
    // "<" stays banned as defence in depth: a page that serialises and re-parses its DOM
    // would not escape "</style>". ">" is the child combinator and is harmless here.
    if (css.indexOf("<") !== -1) return fail("Custom CSS cannot contain \"<\".");
    if (css.indexOf("\u0000") !== -1) return fail("Custom CSS cannot contain a NUL character.");

    const stripped = stripComments(css);
    if (stripped === null) return fail("Custom CSS has a comment that is never closed. Add */ to close it.");

    const scan = asciiLower(stripped);
    let first = null;
    for (const [label, pattern, why] of FORBIDDEN) {
      pattern.lastIndex = 0;
      const match = pattern.exec(scan);
      const index = match ? match.index + (match[1] || "").length : -1;
      if (match && (!first || index < first.index)) first = { index, label, why };
    }
    if (first) return fail(`Custom CSS cannot use "${first.label}", which ${first.why}.`);

    return { ok: true, css };
  }

  global.ForceDarkThemes = Object.assign(global.ForceDarkThemes || {}, { validateCss });
})(typeof globalThis !== "undefined" ? globalThis : self);
