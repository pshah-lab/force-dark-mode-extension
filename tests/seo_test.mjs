// tests/seo_test.mjs — keeps the published site's SEO/AEO basics from regressing.
import fs from "fs";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(rootDir, "docs");
const BASE = "https://darkmode.pshah.fun/";

const pages = [
  ...fs.readdirSync(docs).filter((f) => f.endsWith(".html")),
  ...fs.readdirSync(path.join(docs, "blog")).map((f) => `blog/${f}`).filter((f) => f.endsWith(".html")),
];
const read = (f) => fs.readFileSync(path.join(docs, f), "utf8");
const indexable = pages.filter((f) => !/noindex/.test(read(f)));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}

console.log("\n🔎 SEO checks");

test("every indexable page has title, description, canonical and one H1", () => {
  for (const f of indexable) {
    const s = read(f);
    assert.ok(/<title>[^<]{10,}<\/title>/.test(s), `${f}: title`);
    assert.ok(/name="description"[^>]*content="[^"]{60,}"/s.test(s), `${f}: description`);
    assert.ok(/rel="canonical" href="https:\/\/darkmode\.pshah\.fun\//.test(s), `${f}: canonical`);
    assert.strictEqual((s.match(/<h1[\s>]/g) || []).length, 1, `${f}: exactly one h1`);
  }
});

test("every indexable page has Open Graph and Twitter card tags", () => {
  for (const f of indexable) {
    const s = read(f);
    for (const tag of ["og:title", "og:description", "og:url", "og:image", "twitter:card"]) {
      assert.ok(s.includes(tag), `${f}: missing ${tag}`);
    }
  }
});

test("every indexable page is in the sitemap", () => {
  const sm = read("sitemap.xml");
  for (const f of indexable) {
    const url = f === "index.html" ? BASE : BASE + f.replace(/(^|\/)index\.html$/, "$1");
    assert.ok(sm.includes(`<loc>${url}</loc>`), `${f}: not in sitemap (${url})`);
  }
});

test("all JSON-LD blocks are valid JSON", () => {
  for (const f of pages) {
    for (const m of read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(m[1]), `${f}: invalid JSON-LD`);
    }
  }
});

test("every indexable page except the homepage has BreadcrumbList", () => {
  for (const f of indexable.filter((f) => f !== "index.html")) {
    assert.ok(read(f).includes('"BreadcrumbList"'), `${f}: missing BreadcrumbList`);
  }
});

test("FAQPage markup only appears where a visible FAQ exists", () => {
  for (const f of pages) {
    const s = read(f);
    if (s.includes('"FAQPage"')) {
      assert.ok(/frequently asked|<h2[^>]*>[^<]*FAQ/i.test(s), `${f}: FAQPage without a visible FAQ`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
