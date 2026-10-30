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
  ...fs.readdirSync(path.join(docs, "dark-mode-for")).map((f) => `dark-mode-for/${f}`).filter((f) => f.endsWith(".html")),
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

const sitePages = pages.filter((f) => /^dark-mode-for\/(?!index\.html$)/.test(f));
const pseo = JSON.parse(fs.readFileSync(path.join(rootDir, "tools/pseo/sites.json"), "utf8")).sites;

test("there is one dark-mode-for page per sites.json entry and no others", () => {
  assert.deepStrictEqual(sitePages.sort(), pseo.map((s) => `dark-mode-for/${s.slug}.html`).sort());
});

test("every dark-mode-for page shows real before/after screenshots that exist", () => {
  for (const f of sitePages) {
    const imgs = [...read(f).matchAll(/<img src="\.\.\/(assets\/screenshots\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(imgs.some((i) => i.endsWith("-before.webp")) && imgs.some((i) => i.endsWith("-after.webp")), `${f}: needs a before and an after screenshot`);
    for (const i of imgs) assert.ok(fs.existsSync(path.join(docs, i)), `${f}: missing ${i}`);
  }
});

test("every dark-mode-for page has a visible FAQ with FAQPage markup and links to the hub and key guides", () => {
  for (const f of sitePages) {
    const s = read(f);
    assert.ok(s.includes('"FAQPage"') && /<h2>Frequently asked questions<\/h2>/.test(s), `${f}: FAQ`);
    for (const href of ['href="./"', 'href="../"', "dark-mode-pdf-guide.html", "themeswitcher-vs-dark-reader.html"]) {
      assert.ok(s.includes(href), `${f}: missing link ${href}`);
    }
  }
});

test("the hub links every dark-mode-for page and llms.txt lists them", () => {
  const hub = read("dark-mode-for/index.html");
  const llms = read("llms.txt");
  for (const f of sitePages) {
    const slug = f.replace("dark-mode-for/", "");
    assert.ok(hub.includes(`href="${slug}"`), `hub: missing ${slug}`);
    assert.ok(llms.includes(BASE + f), `llms.txt: missing ${f}`);
  }
});

test("dark-mode-for pages have unique titles and descriptions", () => {
  const titles = sitePages.map((f) => read(f).match(/<title>([^<]+)<\/title>/)[1]);
  const descs = sitePages.map((f) => read(f).match(/name="description" content="([^"]+)"/)[1]);
  assert.strictEqual(new Set(titles).size, titles.length, "duplicate titles");
  assert.strictEqual(new Set(descs).size, descs.length, "duplicate descriptions");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
