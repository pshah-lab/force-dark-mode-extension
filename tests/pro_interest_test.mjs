// tests/pro_interest_test.mjs — the "Pro is coming" interest page on the website.
import fs from "fs";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(rootDir, f), "utf8");
let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}

const PRO_URL = "https://darkmode.pshah.fun/pro.html";
console.log("\nPro interest page");

test("docs/pro.html exists with the exact mailto link", () => {
  const html = read("docs/pro.html");
  const subject = encodeURIComponent("[ThemeSwitcher Pro interest]");
  const m = html.match(/href="(mailto:[^"]+)"/g) || [];
  const links = m.filter((l) => l.startsWith('href="mailto:pshah.lab@gmail.com?subject=' + subject + "&amp;body=") || l.startsWith('href="mailto:pshah.lab@gmail.com?subject=' + subject + "&body="));
  assert.strictEqual(links.length, 1, "exactly one mailto link with the right address and subject");
  assert.ok(html.includes("Tell me what you'd pay for") || html.includes("Tell me what you&#39;d pay for") || html.includes("Tell me what you&rsquo;d pay for"), "CTA text");
  const body = decodeURIComponent(links[0].split("body=")[1].replace(/"$/, ""));
  assert.ok(/feature/i.test(body) && /pay/i.test(body), "prefilled body asks about features and price");
});

test("pro.html uses only the scripts other pages use, and no forms", () => {
  const html = read("docs/pro.html");
  const srcs = (s) => [...s.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).sort();
  const allowed = srcs(read("docs/support.html"));
  for (const s of srcs(html)) assert.ok(allowed.includes(s), `unexpected script ${s}`);
  for (const s of srcs(html)) assert.ok(!/^(https?:)?\/\//.test(s), `third-party script ${s}`);
  assert.ok(!/<form\b/i.test(html), "no form");
  assert.ok(!/localStorage/.test(html), "no localStorage");
  assert.ok(!/<script\b(?![^>]*\ssrc=)(?![^>]*ld\+json)[^>]*>/i.test(html), "no inline script");
});

test("pro.html shows no price or currency", () => {
  const text = read("docs/pro.html").replace(/<script[\s\S]*?<\/script>/g, "");
  for (const re of [/\$/, /€/, /£/, /per month/i, /\bUSD\b/, /\/\s*month/i]) assert.ok(!re.test(text), `forbidden ${re}`);
});

test("pro.html says coming soon and not final", () => {
  const html = read("docs/pro.html");
  assert.ok(/coming soon/i.test(html));
  assert.ok(/not final/i.test(html));
  assert.ok(/<title>Pro \(coming soon\) \| ThemeSwitcher<\/title>/.test(html));
});

test("pro.html is in the sitemap with the right loc", () => {
  assert.ok(read("docs/sitemap.xml").includes(`<loc>${PRO_URL}</loc>`));
});

test("side panel links to the Pro interest page with a plain, untracked link", () => {
  const html = read("src/popup/popup.html");
  const m = html.match(/<a id="pro-interest-link"[^>]*>/);
  assert.ok(m, "pro-interest-link anchor exists");
  assert.ok(m[0].includes(`href="${PRO_URL}"`), "href is the fixed Pro page URL");
  assert.ok(/target="_blank"/.test(m[0]) && /rel="noopener noreferrer"/.test(m[0]), "opens in a new tab safely");
  for (const f of ["src/popup/popup.js", "src/shared/usageReport.js"]) {
    if (fs.existsSync(path.join(rootDir, f))) assert.ok(!/pro-interest/.test(read(f)), `${f} must not count or handle clicks on the Pro link`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
