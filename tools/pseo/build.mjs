// tools/pseo/build.mjs — builds the "Dark mode for <site>" pages, their hub, and their sitemap and llms.txt entries
// from tools/pseo/sites.json. Dev-only: never shipped (package-extension.sh zips only manifest.json, assets/, src/).
// Usage: node tools/pseo/build.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docs = path.join(rootDir, "docs");
const outDir = path.join(docs, "dark-mode-for");
const BASE = "https://darkmode.pshah.fun/";
const STORE = "https://chromewebstore.google.com/detail/force-dark-mode/kmhhphbakbhohiohagkhhgdgfbplkfke";
const ENGINES = { auto: "Auto Engine", css: "CSS Engine", invert: "Invert Engine" };

const data = JSON.parse(fs.readFileSync(path.join(rootDir, "tools/pseo/sites.json"), "utf8"));
const { sites, published } = data;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ld = (obj) => `    <script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/^/gm, "      ")}\n    </script>`;

// Refuse to build a page without its real screenshots: no evidence, no page.
for (const s of sites) {
  if (!/^[a-z0-9-]+$/.test(s.slug)) throw new Error(`bad slug: ${s.slug}`);
  if (!ENGINES[s.engine]) throw new Error(`${s.slug}: unknown engine ${s.engine}`);
  for (const side of ["before", "after"]) {
    const f = path.join(docs, "assets/screenshots", `${s.shot}-${side}.webp`);
    if (!fs.existsSync(f)) throw new Error(`${s.slug}: missing screenshot ${f}`);
  }
  if (!s.faq || s.faq.length < 2) throw new Error(`${s.slug}: needs a visible FAQ`);
}

const CHROME_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle><line x1="21.17" y1="8" x2="12" y2="8"></line><line x1="3.95" y1="6.06" x2="8.54" y2="14"></line><line x1="10.88" y1="21.94" x2="15.46" y2="14"></line></svg>`;

function head({ title, description, url, image, ogType, blocks }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="index, follow" />
    <meta name="theme-color" content="#090b0e" />
    <meta http-equiv="X-Content-Type-Options" content="nosniff" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />

    <!-- Open Graph -->
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${image}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${image}" />

    <link rel="icon" type="image/svg+xml" href="../assets/icon.svg" />
    <link rel="stylesheet" href="../css/style.css" />
    <link rel="stylesheet" href="../css/home.css" />

${blocks.map(ld).join("\n")}
  </head>
`;
}

function header() {
  return `  <body>
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <header class="site-header" role="banner">
      <div class="container nav-container">
        <a href="../" class="logo-brand" aria-label="PshahLab Home">
          <div class="logo-icon-wrapper chameleon-mark chameleon-mark--nav">
            <svg viewBox="0 0 200 160" class="chameleon-mark-icon" aria-hidden="true">
              <path d="M20 120 C -10 120, -10 80, 20 80 C 45 80, 45 105, 25 105 C 12 105, 12 92, 25 92" stroke="currentColor" stroke-width="10" stroke-linecap="round" fill="none"></path>
              <ellipse cx="95" cy="90" rx="55" ry="38" fill="currentColor"></ellipse>
              <path d="M60 58 L68 46 L76 58 M84 55 L92 42 L100 55 M108 55 L116 44 L124 55" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
              <ellipse cx="150" cy="75" rx="28" ry="24" fill="currentColor"></ellipse>
              <circle cx="158" cy="65" r="10" fill="#fff"></circle>
              <circle cx="160" cy="63" r="4.5" fill="#0b0e14"></circle>
              <path d="M70 118 C 65 130, 55 132, 48 128" stroke="currentColor" stroke-width="9" stroke-linecap="round" fill="none"></path>
              <path d="M120 122 C 122 134, 132 138, 140 134" stroke="currentColor" stroke-width="9" stroke-linecap="round" fill="none"></path>
            </svg>
          </div>
          <span class="logo-lockup">
            <span class="logo-parent">PshahLab</span>
            <span class="logo-divider" aria-hidden="true">/</span>
            <span class="logo-product">ThemeSwitcher</span>
          </span>
        </a>

        <nav role="navigation" aria-label="Main Navigation">
          <button class="mobile-toggle" aria-expanded="false" aria-label="Toggle navigation menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <ul class="nav-menu">
            <li><a href="../" class="nav-link">Home</a></li>
            <li><a href="../features.html" class="nav-link">Features</a></li>
            <li><a href="../how-it-works.html" class="nav-link">How It Works</a></li>
            <li><a href="../blog/" class="nav-link active">Guides</a></li>
            <li><a href="../support.html" class="nav-link">Support</a></li>
            <li><a href="../about.html" class="nav-link">About</a></li>
          </ul>
        </nav>

        <div class="nav-cta">
          <a href="${STORE}" class="btn btn-primary btn-chrome-store" rel="noopener noreferrer" target="_blank">
            ${CHROME_ICON}
            <span>Add to Chrome</span>
          </a>
        </div>
      </div>
    </header>
`;
}

function footer() {
  return `
    <footer class="site-footer" role="contentinfo">
      <div class="container footer-grid">
        <div class="footer-brand">
          <div class="logo-brand">
            <div class="logo-icon-wrapper">
              <img src="../assets/icon.svg" alt="" class="logo-icon" width="28" height="28" />
            </div>
            <span>ThemeSwitcher</span>
          </div>
          <p>
            Force Dark Mode - ThemeSwitcher is a lightweight, privacy-focused browser extension providing intelligent dark themes for websites and PDF documents.
          </p>
        </div>

        <div class="footer-col">
          <h4>Navigation</h4>
          <ul class="footer-links">
            <li><a href="../">Home</a></li>
            <li><a href="../features.html">Features</a></li>
            <li><a href="../how-it-works.html">How It Works</a></li>
            <li><a href="../support.html">Support</a></li>
            <li><a href="../about.html">About Developer</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Dark mode for sites</h4>
          <ul class="footer-links">
${sites.map((s) => `            <li><a href="${s.slug}.html">${esc(s.name)}</a></li>`).join("\n")}
            <li><a href="./">All sites</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Support &amp; Community</h4>
          <ul class="footer-links">
            <li><a href="../privacy.html">Privacy Policy</a></li>
            <li><a href="../stats.html">Usage statistics</a></li>
            <li><a href="../support.html#feedback">Feedback &amp; Suggestions</a></li>
            <li><a href="${STORE}" target="_blank" rel="noopener noreferrer">Chrome Web Store</a></li>
          </ul>
        </div>
      </div>

      <div class="container footer-bottom">
        <div>&copy; 2026 PshahLab. Force Dark Mode - ThemeSwitcher is open source under the MIT License.</div>
        <div class="footer-live-status">
          <span>No tracking. Anonymous usage stats are opt-in.</span>
        </div>
      </div>
    </footer>

    <script src="../js/main.js"></script>
    <script src="../js/clarity-consent.js"></script>
  </body>
</html>
`;
}

function cta(id) {
  return `        <section class="cta-banner" aria-labelledby="${id}">
          <div class="cta-content">
            <h2 id="${id}">Try it on your own pages</h2>
            <p>ThemeSwitcher is free and open source, and it recolors pages on your device.</p>
            <a href="${STORE}" class="btn btn-primary btn-lg btn-chrome-store" rel="noopener noreferrer" target="_blank">
              ${CHROME_ICON}
              <span>Add to Chrome — Free on Web Store</span>
            </a>
          </div>
        </section>`;
}

const breadcrumb = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
});
const HUB_URL = `${BASE}dark-mode-for/`;
const HUB_NAME = "Dark mode for popular sites";

function sitePage(s) {
  const url = `${HUB_URL}${s.slug}.html`;
  const engine = ENGINES[s.engine];
  const img = (side) => `../assets/screenshots/${s.shot}-${side}.webp`;
  const others = sites.filter((o) => o !== s);
  const blocks = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `Dark mode for ${s.name} in Chrome`,
      description: s.description,
      image: `${BASE}assets/screenshots/${s.shot}-after.webp`,
      author: { "@type": "Person", name: "Pratham Shah", url: "https://pshah.fun" },
      publisher: { "@type": "Organization", name: "PshahLab" },
      datePublished: published,
      dateModified: published,
    },
    breadcrumb([["Home", BASE], [HUB_NAME, HUB_URL], [`Dark mode for ${s.name}`, url]]),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: s.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
  return (
    head({ title: s.title, description: s.description, url, image: `${BASE}assets/og-image.jpg`, ogType: "article", blocks }) +
    header() +
    `
    <main id="main-content" class="container article-container">
      <article class="article-header">
        <nav class="badge" aria-label="Breadcrumb"><a href="./">${HUB_NAME}</a></nav>
        <h1>Dark mode for ${esc(s.name)} in Chrome</h1>
        <div class="article-meta">
          <span>By Pratham Shah</span> •
          <span>Screenshots taken September 2026</span> •
          <span>Engine: ${engine}</span>
        </div>
        <p class="hero-subtitle">${esc(s.intro)}</p>

        <div class="article-content">
          <h2>${esc(s.name)} before and after</h2>
          <p>Real screenshots of ${esc(s.captured)}, taken with the extension. They are not mockups.</p>
          <div class="lo-pair">
            <figure><img src="${img("before")}" alt="${esc(s.altBefore)}" loading="lazy" width="${s.width}" height="${s.height}" /><figcaption>Before</figcaption></figure>
            <figure><img src="${img("after")}" alt="${esc(s.altAfter)}" loading="lazy" width="${s.width}" height="${s.height}" /><figcaption>After</figcaption></figure>
          </div>
          <p class="lo-engine">Engine used: ${engine}</p>

          <h2>How to turn on dark mode for ${esc(s.name)}</h2>
          <ol>
            <li>Add ThemeSwitcher to Chrome from the <a href="${STORE}" rel="noopener noreferrer" target="_blank">Chrome Web Store</a>. It is free, and the side panel needs Chrome 114 or newer.</li>
            <li>Open <strong>${esc(s.host)}</strong> in a tab.</li>
            <li>Click the ThemeSwitcher icon in the toolbar to open the side panel.</li>
            <li>Choose <strong>${engine}</strong> and turn dark mode on. ThemeSwitcher remembers both for ${esc(s.host)}. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> toggles it from the keyboard.</li>
            <li>If something looks wrong, press <strong>Report this site as broken</strong>. It shows the domain it will send, and sends only after you press Send report.</li>
          </ol>

          <h2>What changes on ${esc(s.name)}</h2>
          <ul>
${s.notes.map((n) => `            <li>${esc(n)}</li>`).join("\n")}
          </ul>

          <h2>Frequently asked questions</h2>
${s.faq.map(([q, a]) => `          <h3>${esc(q)}</h3>\n          <p>${esc(a)}</p>`).join("\n")}

          <h2>More guides</h2>
          <ul>
${others.map((o) => `            <li><a href="${o.slug}.html">Dark mode for ${esc(o.name)}</a></li>`).join("\n")}
            <li><a href="./">All sites with real screenshots</a></li>
            <li><a href="../blog/dark-mode-pdf-guide.html">Reading PDFs in dark mode</a></li>
            <li><a href="../blog/themeswitcher-vs-dark-reader.html">ThemeSwitcher vs Dark Reader</a></li>
            <li><a href="../">ThemeSwitcher home</a></li>
          </ul>
        </div>

${cta("cta-heading")}
      </article>
    </main>
` +
    footer()
  );
}

function hubPage() {
  const title = "Dark Mode for Notion, YouTube, LeetCode & More (Chrome)";
  const description = "Real before and after screenshots of ThemeSwitcher on popular sites, with the engine that worked on each one and what stays light. No mockups.";
  const blocks = [
    breadcrumb([["Home", BASE], [HUB_NAME, HUB_URL]]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: sites.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: `Dark mode for ${s.name}`, url: `${HUB_URL}${s.slug}.html` })),
    },
  ];
  return (
    head({ title, description, url: HUB_URL, image: `${BASE}assets/og-image.jpg`, ogType: "website", blocks }) +
    header() +
    `
    <main id="main-content" class="container article-container">
      <article class="article-header">
        <div class="badge">Site guides</div>
        <h1>Dark mode for popular sites</h1>
        <p class="hero-subtitle">Each guide shows real before and after screenshots taken with ThemeSwitcher, names the engine that was used, and says what changes and what doesn't. We only publish a guide once we have screenshots of the site.</p>

        <div class="article-content">
          <ul>
${sites.map((s) => `            <li><a href="${s.slug}.html"><strong>Dark mode for ${esc(s.name)}</strong></a>: ${esc(s.captured)}, ${ENGINES[s.engine]}.</li>`).join("\n")}
          </ul>
          <p>Not listed? ThemeSwitcher works on any site. Open the side panel and pick an engine. If a page looks wrong, press <strong>Report this site as broken</strong>; it sends only the domain, engine, theme label and version, and only after you confirm.</p>
          <p>See also: <a href="../blog/how-to-force-dark-mode-chrome.html">how to force dark mode in Chrome</a>, <a href="../blog/dark-mode-pdf-guide.html">dark mode for PDFs</a> and <a href="../blog/themeswitcher-vs-dark-reader.html">ThemeSwitcher vs Dark Reader</a>.</p>
        </div>

${cta("cta-heading")}
      </article>
    </main>
` +
    footer()
  );
}

// Replaces the text between two marker lines (markers kept), or fails if they are missing.
function replaceBetween(text, start, end, body, file) {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error(`${file}: markers ${start} / ${end} not found`);
  return text.slice(0, a + start.length) + "\n" + body + text.slice(b);
}

fs.mkdirSync(outDir, { recursive: true });
for (const s of sites) fs.writeFileSync(path.join(outDir, `${s.slug}.html`), sitePage(s));
fs.writeFileSync(path.join(outDir, "index.html"), hubPage());

const urls = [HUB_URL, ...sites.map((s) => `${HUB_URL}${s.slug}.html`)];
const smPath = path.join(docs, "sitemap.xml");
const smBody = urls
  .map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${published}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`)
  .join("") + "  ";
fs.writeFileSync(smPath, replaceBetween(fs.readFileSync(smPath, "utf8"), "<!-- pseo:start -->", "<!-- pseo:end -->", smBody, "sitemap.xml"));

const llmsPath = path.join(docs, "llms.txt");
const llmsBody = [
  `- Hub, dark mode for popular sites (real before/after screenshots): ${HUB_URL}`,
  ...sites.map((s) => `- Dark mode for ${s.name}: ${HUB_URL}${s.slug}.html (${ENGINES[s.engine]}, screenshots of ${s.captured})`),
  "",
].join("\n");
fs.writeFileSync(llmsPath, replaceBetween(fs.readFileSync(llmsPath, "utf8"), "<!-- pseo:start -->", "<!-- pseo:end -->", llmsBody, "llms.txt"));

console.log(`Built ${sites.length} site pages and the hub in docs/dark-mode-for/`);
