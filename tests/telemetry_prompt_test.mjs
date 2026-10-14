// tests/telemetry_prompt_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
const sandbox = {};
vm.runInNewContext(read("src/popup/telemetryPrompt.js"), sandbox);
const P = sandbox.TelemetryPrompt;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log("=========================================");
console.log("📊 Running Telemetry Prompt Tests");
console.log("=========================================\n");

test("constants", () => {
  assert.strictEqual(P.STATE_KEY, "telemetryPromptState");
  assert.strictEqual(P.SHOW_AFTER_OPENS, 5);
});

test("garbage state is treated as fresh and never shows", () => {
  for (const bad of [undefined, null, "x", 5, { opens: "9" }, { opens: -3 }, { opens: NaN }]) {
    assert.strictEqual(P.shouldShow(bad), false);
    assert.strictEqual(P.recordOpen(bad).opens, 1);
  }
});

test("shows only after the threshold number of opens", () => {
  let s;
  for (let i = 1; i < P.SHOW_AFTER_OPENS; i++) {
    s = P.recordOpen(s);
    assert.strictEqual(P.shouldShow(s), false, `open ${i}`);
  }
  s = P.recordOpen(s);
  assert.strictEqual(P.shouldShow(s), true);
});

test("decide hides forever and stops counting", () => {
  const s = P.decide({ opens: 40, decided: false });
  assert.strictEqual(s.decided, true);
  assert.strictEqual(P.shouldShow(s), false);
  assert.strictEqual(P.recordOpen(s).opens, 40);
  assert.strictEqual(P.shouldShow(P.recordOpen(s)), false);
});

test("functions do not mutate their input", () => {
  const s = Object.freeze({ opens: 3, decided: false });
  P.recordOpen(s); P.decide(s);
  assert.strictEqual(s.opens, 3);
});

test("popup declares a hidden consent card with the exact copy", () => {
  const html = read("src/popup/popup.html");
  assert.ok(/id="telemetry-prompt"[^>]*hidden/.test(html), "card must start hidden");
  for (const id of ["telemetry-yes", "telemetry-no"]) assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  assert.ok(html.includes("Share anonymous usage stats?"));
  assert.ok(html.includes("We count: that you used the extension today, which engine and built-in theme you use, which features you used, and your version, Chrome version, OS family and language."));
  assert.ok(html.includes("We never see: the sites you visit, what you read or watch, your documents, or anything you type."));
  assert.ok(html.includes("Yes, share stats") && html.includes("No thanks"));
  assert.ok(html.includes('src="telemetryPrompt.js"'));
});

test("options page has the usage stats controls", () => {
  const html = read("src/options/options.html");
  for (const id of ["telemetry-toggle", "telemetry-preview", "telemetry-delete"]) assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  assert.ok(/<pre[^>]*id="telemetry-preview"/.test(html));
  assert.ok(/Usage stats/.test(html) && /Delete my data/.test(html));
  assert.ok(/id="telemetry-preview-label"/.test(html), "preview needs a label element");
  assert.ok(!html.includes("Exactly what would be sent"), "the live tally can differ from what was sent; do not say Exactly");
});

test("options preview labels: example before opt-in, today's report after; textContent only", () => {
  const opt = read("src/options/options.js");
  assert.ok(opt.includes("Example of what would be sent if you turn this on (nothing is sent while this is off)"));
  assert.ok(opt.includes("Today's report if sent now"));
  assert.ok(!/Exactly what is sent/i.test(opt) && !/Exactly what is sent/i.test(read("src/options/options.html")));
  assert.ok(/telemetryPreviewLabel\.textContent\s*=/.test(opt), "label must be set with textContent");
  assert.ok(/telemetryPreview\.textContent\s*=/.test(opt), "preview must be set with textContent");
  assert.ok(/status\??\.example === true/.test(opt) || /\.example === true/.test(opt), "options must distinguish the example");
});

test("popup and options code use messages only, no network or innerHTML", () => {
  for (const f of ["src/popup/telemetryPrompt.js", "src/popup/popup.js", "src/options/options.js"]) {
    const code = read(f);
    for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /https?:\/\//, /\.innerHTML/]) {
      assert.ok(!re.test(code), `prohibited pattern ${re} in ${f}`);
    }
  }
  const pop = read("src/popup/popup.js");
  assert.ok(pop.includes("TELEMETRY_CONSENT"));
  const opt = read("src/options/options.js");
  for (const t of ["TELEMETRY_CONSENT", "TELEMETRY_STATUS", "TELEMETRY_DELETE"]) assert.ok(opt.includes(t), t);
  assert.ok(opt.includes("Nothing is sent while this is off"));
  assert.ok(opt.includes("Removed from this device; server deletion could not be confirmed"));
});

console.log(`\n🎉 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
