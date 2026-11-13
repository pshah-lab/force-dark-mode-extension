// tests/pro_interest_test.mjs — the "Pro is coming" interest page and the single link to it from the Tools page.
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

console.log("\nTools page link");

test("tools.html has exactly one link to the pro page, opened safely", () => {
  const html = read("src/tools/tools.html");
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  const pro = anchors.filter((a) => a.includes(PRO_URL));
  assert.strictEqual(pro.length, 1);
  assert.ok(/target="_blank"/.test(pro[0]));
  assert.ok(/rel="[^"]*noopener[^"]*"/.test(pro[0]));
  assert.ok(html.includes("Pro is coming: tell us what you'd want ↗") || html.includes("Pro is coming: tell us what you&#39;d want ↗"));
});

test("tools.html has no other external URL, script src or form action", () => {
  const html = read("src/tools/tools.html");
  const urls = html.match(/https?:\/\/[^\s"'<>]+/g) || [];
  assert.deepStrictEqual(urls, [PRO_URL]);
  assert.ok(!/<form[^>]*\saction=/i.test(html));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
