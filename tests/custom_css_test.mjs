// tests/custom_css_test.mjs
// ForceDarkThemes.validateCss: user-authored CSS must never be able to cause a network
// request or run script. Each case below is a bypass attempt or a legitimate input.
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadUmd } from "./helpers/loadUmd.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

const ctx = loadUmd(["src/shared/themeCore.js", "src/shared/builtinThemes.js", "src/shared/sitePacks.js", "src/shared/customCss.js"]);
const T = ctx.ForceDarkThemes;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

const show = (x) => { try { return JSON.stringify(x); } catch (e) { return typeof x; } };

// Results come from another vm realm, so compare plain fields rather than deepStrictEqual.
function v(css) {
  const r = T.validateCss(css);
  return { ok: r.ok, css: r.css, error: r.error };
}
function accepts(css) {
  const r = v(css);
  assert.strictEqual(r.ok, true, `expected accept: ${show(css)} -> ${r.error}`);
  assert.strictEqual(r.css, css, "returns the original text unchanged");
  assert.strictEqual(r.error, undefined);
}
function rejects(css, mention) {
  const r = v(css);
  assert.strictEqual(r.ok, false, `expected reject: ${show(css)}`);
  assert.strictEqual(typeof r.error, "string");
  assert.ok(r.error.length > 0 && /\.$/.test(r.error), `plain sentence: ${r.error}`);
  assert.strictEqual(r.css, undefined, "no css on failure");
  if (mention) assert.ok(r.error.includes(mention), `error ${JSON.stringify(r.error)} should name ${mention}`);
  return r.error;
}

console.log("=========================================");
console.log("🛡️  Running Custom CSS Sanitiser Tests");
console.log("=========================================\n");

test("validateCss is exported on ForceDarkThemes", () => {
  assert.strictEqual(typeof T.validateCss, "function");
});

test("accepts ordinary CSS and returns it unchanged (comments kept)", () => {
  accepts("body{font-family:Inter,sans-serif !important}");
  accepts("pre{border-radius:12px}");
  accepts("/* note */ a{color:red}");
  accepts("a{color:red} /* trailing */");
  accepts("@media (max-width: 600px) { a { color: #fff; padding: 0 4px } }");
  accepts("a{color:var(--force-dark-link)} :root{--x: 4px}");
  accepts("a{background:linear-gradient(90deg, #000, #111)}");
  accepts("a::after{content:\"done\"} b{content:'x'}");
  accepts("@supports (display:grid){main{display:grid}}");
  accepts("img[src$=\".png\"]{opacity:.9}"); // attribute named src is fine; src( is not
  accepts("h1{color:red}} h2{color:blue}"); // a stray } just starts another rule: still only CSS
});

test("the empty string is valid (means no CSS) and returns \"\"", () => {
  accepts("");
});

test("comment-only CSS is valid", () => {
  accepts("/* just a note */");
  accepts("/**/");
  accepts("/* a */ /* b */\n/* c */");
});

test("non-strings are rejected", () => {
  for (const bad of [undefined, null, 0, 42, true, {}, [], ["a{}"], () => "a{}", Symbol("x"), 10n, new String("a{}")]) {
    rejects(bad, "text");
  }
});

test("length limit is MAX_CSS_CHARS (6000)", () => {
  const max = T.LIMITS.MAX_CSS_CHARS;
  assert.strictEqual(max, 6000);
  const ok = "a{color:red}" + " ".repeat(max - 12);
  assert.strictEqual(ok.length, max);
  accepts(ok);
  rejects(ok + " ", "6000");
  rejects("x".repeat(6001), "6000");
  rejects("a{}".repeat(100000), "6000");
});

test("backslash, <, > and NUL are rejected outright", () => {
  rejects("a{background:u\\72l(x)}", "\\");
  rejects("a{background:\\75rl(x)}", "\\");
  rejects("a{content:\"\\\"\"}", "\\");
  rejects("a{color:red}\\", "\\");
  rejects("</style><script>alert(1)</script>", "<");
  rejects("a{color:red}</style>", "<");
  rejects("<!-- a{color:red} -->", "<");
  rejects("a{color:red}\u0000", "NUL");
  rejects("a{col\u0000or:red}");
});

test("the child combinator > is allowed; < stays banned", () => {
  accepts("ul > li{color:red}");
  accepts("a>b{color:red}");
  accepts("ul>li>a{color:red}");
  accepts("@media (min-width: 600px){ .a > .b{color:red} }");
  rejects("a < b{color:red}", "<");
  rejects("<", "<");
  rejects("a > b{color:red} </style>", "<");
});

test("scroll-behavior and overscroll-behavior are not the IE behavior property", () => {
  accepts("html{scroll-behavior:smooth}");
  accepts("body{overscroll-behavior:contain}");
  accepts("body{overscroll-behavior-x:none}");
  accepts("body{overscroll-behavior-inline:auto}");
  accepts("HTML{SCROLL-BEHAVIOR : smooth}");
  accepts(":root{--behavior:1}");
});

test("behavior: is still rejected at every declaration boundary", () => {
  rejects("a{behavior:foo}", "behavior");
  rejects("a{-ms-behavior:foo}", "behavior");
  rejects("a{-MS-BEHAVIOR :foo}", "behavior");
  rejects("a{color:red;behavior:foo}", "behavior");
  rejects("a{color:red; behavior:foo}", "behavior");
  rejects("a{ behavior:foo}", "behavior");
  rejects("behavior:foo", "behavior");
  rejects("a{color:red;\nbehavior:foo}", "behavior");
  rejects("a{/* c */behavior:foo}", "behavior");
});

test("an unterminated comment is rejected", () => {
  rejects("/* never closed", "comment");
  rejects("a{color:red} /*", "comment");
  rejects("a{color:red} /*/", "comment"); // "/*/" opens but does not close
  rejects("/* a */ /* b", "comment");
});

const MUST_REJECT = [
  ["@import \"x\"", "@import"],
  ["@import url(x);", "@import"],
  ["@IMPORT \"x\";", "@import"],
  ["@ImPoRt 'x';", "@import"],
  ["@ import 'x';", "@import"],
  ["@\n\timport 'x';", "@import"],
  ["@im/**/port 'x';", "@import"],
  ["@namespace svg \"x\";", "@namespace"],
  ["@NameSpace x;", "@namespace"],
  ["@font-face{font-family:x;src:local(Arial)}", "@font-face"],
  ["@FONT-FACE{font-family:x}", "@font-face"],
  ["@font/**/-face{font-family:x}", "@font-face"],
  ["a{background:url(x)}", "url("],
  ["a{background:URL( x )}", "url("],
  ["a{background:Url(x)}", "url("],
  ["a{background:url (x)}", "url("],
  ["a{background:url\n(x)}", "url("],
  ["a{background:url\t(x)}", "url("],
  ["a{background:url\r\n(x)}", "url("],
  ["a{background:url\f(x)}", "url("],
  ["a{background:ur/**/l(x)}", "url("],
  ["a{background:u/* x */r/**/l/**/(x)}", "url("],
  ["a{background:url/**/(x)}", "url("],
  ["a{background:url('data:image/png;base64,AAAA')}", "url("],
  ["a{cursor:url(x), auto}", "url("],
  ["a{filter:url(#f)}", "url("],
  ["a{background:image-set(\"x\" 1x)}", "image-set("],
  ["a{background:IMAGE-SET(\"x\" 1x)}", "image-set("],
  ["a{background:image-set (\"x\" 1x)}", "image-set("],
  ["a{background:-webkit-image-set(\"x\" 1x)}", "-webkit-image-set("],
  ["a{background:-WEBKIT-IMAGE-SET(\"x\" 1x)}", "-webkit-image-set("],
  ["a{background:image(\"x\")}", "image("],
  ["a{background:Image (\"x\")}", "image("],
  ["a{background:src(\"x\")}", "src("],
  ["a{background:SRC(\"x\")}", "src("],
  ["a{background:cross-fade(\"a\", \"b\", 50%)}", "cross-fade("],
  ["a{background:-webkit-cross-fade(\"a\", \"b\", 50%)}", "cross-fade("],
  ["a{width:expression(alert(1))}", "expression("],
  ["a{width:EXPRESSION (alert(1))}", "expression("],
  ["a{behavior:x}", "behavior"],
  ["a{BEHAVIOR : x}", "behavior"],
  ["a{-moz-binding:x}", "-moz-binding"],
  ["a{-MOZ-BINDING:x}", "-moz-binding"],
  ["a{x:javascript:alert(1)}", "javascript:"],
  ["a{x:JavaScript :alert(1)}", "javascript:"],
  ["@media screen{a{background:url(x)}}", "url("],
  ["@media screen{@media (min-width:1px){a{background:url(x)}}}", "url("],
  ["@supports (color:red){@import 'x';}", "@import"],
  ["a{color:red}} b{background:url(x)}", "url("],
  ["a{content:\"url(x)\"}", "url("], // inside a string: conservatively rejected
];

test("rejects every network or script construct, with bypass variants", () => {
  for (const [css, name] of MUST_REJECT) rejects(css, name);
});

test("comments inside strings are not comments: a string cannot hide a live url(", () => {
  // In CSS "/*" inside a string is plain text, so url(x) below is live. A naive comment
  // stripper would delete everything from the first "/*" to the last "*/".
  rejects("a{content:\"/*\"} b{background:url(x)} c{content:\"*/\"}", "url(");
  rejects("a{content:'/*'} b{background:url(x)} c{content:'*/'}", "url(");
  // A string that only contains "/*" is fine and is not an unterminated comment.
  accepts("a{content:\"/* not a comment\"}");
  accepts("a{content:'*/'}");
});

test("quotes inside comments do not start strings", () => {
  rejects("/* it's */ a{background:url(x)}", "url(");
  rejects("/* \" */ a{background:url(x)} /* \" */", "url(");
  accepts("/* it's fine */ a{color:red}");
});

test("a string ends at a newline like in CSS, so it cannot swallow following rules", () => {
  rejects("a{content:\"open\n} b{background:url(x)}", "url(");
  rejects("a{content:'open\r} b{background:url(x)}", "url(");
  rejects("a{content:'open\f} b{background:url(x)}", "url(");
});

test("comments are joined away before scanning (ur/**/l becomes url)", () => {
  rejects("a{background:ur/**/l(x)}", "url(");
  rejects("a{background:i/**/mage-set(x)}", "image-set(");
  rejects("a{x:java/**/script:alert(1)}", "javascript:");
  rejects("a{-moz-/**/binding:x}", "-moz-binding");
  rejects("a{beha/* x */vior:x}", "behavior");
});

test("reports the first offending construct in the text", () => {
  const e1 = rejects("a{background:url(x)} @import 'y';");
  assert.ok(e1.includes("url(") && !e1.includes("@import"), e1);
  const e2 = rejects("@import 'y'; a{background:url(x)}");
  assert.ok(e2.includes("@import") && !e2.includes("url("), e2);
  const e3 = rejects("a{background:-webkit-image-set(x 1x)}");
  assert.ok(e3.includes("-webkit-image-set("), e3);
});

test("no Unicode case folding or normalisation: lookalikes are not CSS function names", () => {
  // CSS matches names ASCII case-insensitively only. These are different identifiers to
  // the browser, so they cannot load anything and must not be rejected or "fixed up".
  accepts("a{background:ｕｒｌ(x)}"); // full-width "url"
  accepts("a{background:uгl(x)}"); // Cyrillic ghe in place of r
  accepts("a{background:ſrc(x)}"); // long s: folds to "s" under Unicode case folding
  accepts("a{background:İmage(x)}"); // dotted capital I
  accepts("＠import 'x';"); // full-width @
  accepts("a{color:red} /* url( in a comment is not live */");
  // ASCII letters are still caught however they are cased.
  rejects("a{background:uRl(x)}", "url(");
  // A non-ASCII space between name and "(" is not CSS whitespace, but it is still
  // rejected on purpose: the gap check uses the broader JS whitespace class.
  rejects("a{background:url (x)}", "url(");
  rejects("a{background:url (x)}", "url(");
});

test("whitespace inside an identifier is a different token and is allowed", () => {
  // "u rl(" is the ident u then the function rl(; neither loads anything.
  accepts("a{background:u rl(x)}");
  accepts("a{x:java script:1}");
});

test("very long valid and invalid inputs are handled quickly", () => {
  const start = Date.now();
  const long = "a{color:red}".repeat(490);
  accepts(long);
  rejects(long.slice(0, 5000) + "b{background:url(x)}", "url(");
  rejects("/*".repeat(2999), "comment");
  accepts("/**/".repeat(1500));
  accepts("\"".repeat(6000));
  assert.ok(Date.now() - start < 1000, "fast");
});

// Property test: random mutations of each forbidden construct must still be rejected.
// Mutations: ASCII case flips anywhere, comment insertion anywhere inside the token,
// and whitespace only where CSS (or our deliberately broader check) puts it: between
// a function name and "(", between "@" and the at-rule name, and before ":".
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TOKENS = [
  ["@", "import", ""],
  ["@", "namespace", ""],
  ["@", "font-face", ""],
  ["", "url", "("],
  ["", "image-set", "("],
  ["", "-webkit-image-set", "("],
  ["", "image", "("],
  ["", "src", "("],
  ["", "cross-fade", "("],
  ["", "expression", "("],
  ["", "behavior", ":"],
  ["", "-moz-binding", ""],
  ["", "javascript", ":"],
];
const GAPS = [" ", "\t", "\n", "\r\n", "\f", "  \n\t"];
const COMMENTS = ["/**/", "/* x */", "/*\n*/", "/* ' */", "/* \" */"];

test("property: 200 random case/comment/whitespace mutations per token are all rejected", () => {
  const rand = rng(0xc55);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  for (const [pre, name, post] of TOKENS) {
    for (let n = 0; n < 200; n++) {
      let body = "";
      for (const ch of name) {
        body += rand() < 0.5 ? ch.toUpperCase() : ch;
        if (rand() < 0.15) body += pick(COMMENTS);
      }
      let token = pre;
      if (pre && rand() < 0.5) token += rand() < 0.5 ? pick(GAPS) : pick(COMMENTS);
      token += body;
      if (post && rand() < 0.6) token += rand() < 0.5 ? pick(GAPS) : pick(COMMENTS);
      token += post;
      const css = `a{background:${token}x)}`;
      const r = v(css);
      assert.strictEqual(r.ok, false, `mutation slipped through: ${JSON.stringify(css)}`);
    }
  }
});

test("property: the same mutations wrapped in harmless comments and rules are still rejected", () => {
  const rand = rng(0xbad5eed);
  for (const [pre, name, post] of TOKENS) {
    for (let n = 0; n < 50; n++) {
      const token = pre + name.split("").map((c) => (rand() < 0.5 ? c.toUpperCase() : c)).join("") + post;
      const css = `/* lead */ b{color:red} @media print{c{d:e} a{f:${token}x)}} /* tail */`;
      assert.strictEqual(v(css).ok, false, JSON.stringify(css));
    }
  }
});

test("customCss.js uses no banned APIs, URL literals or Unicode-folding regexes", () => {
  const src = read("src/shared/customCss.js");
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /\beval\s*\(/, /\.innerHTML/, /new Function/, /https?:\/\//]) {
    assert.ok(!re.test(src), `prohibited ${re}`);
  }
  assert.ok(!/toLowerCase|toUpperCase|normalize\(|localeCompare/.test(src), "only ASCII case mapping");
});

test("manifest loads customCss.js after sitePacks.js and before the engines", () => {
  const js = JSON.parse(read("manifest.json")).content_scripts[0].js;
  const order = ["colorUtils.js", "themeCore.js", "builtinThemes.js", "sitePacks.js", "customCss.js", "cssOverrideEngine.js", "invertEngine.js", "index.js"];
  const idx = order.map((n) => js.findIndex((p) => p.endsWith("/" + n)));
  idx.forEach((i, k) => assert.ok(i > -1, order[k] + " present"));
  for (let k = 1; k < idx.length; k++) assert.ok(idx[k] > idx[k - 1], `${order[k]} after ${order[k - 1]}`);
  assert.ok(js.includes("src/shared/customCss.js"));
});

test("storage.js imports customCss.js after themeCore.js", () => {
  const src = read("src/shared/storage.js");
  const a = src.indexOf('import "./themeCore.js";');
  const b = src.indexOf('import "./customCss.js";');
  assert.ok(a > -1 && b > a, "storage.js imports customCss.js after themeCore.js");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
