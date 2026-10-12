// tests/feedback_prompt_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// feedbackPrompt.js is a classic popup script (package is "type": "module"), so run it in a sandbox.
const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(rootDir, "src/popup/feedbackPrompt.js"), "utf8"), sandbox);
const P = sandbox.FeedbackPrompt;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log("=========================================");
console.log("💬 Running Feedback Prompt Tests");
console.log("=========================================\n");

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

test("finishing hides it forever and stops counting", () => {
  let s = { opens: 40, snoozes: 0, done: false };
  s = P.finish(s);
  assert.strictEqual(P.shouldShow(s), false);
  assert.strictEqual(P.recordOpen(s).opens, 40);
  assert.strictEqual(P.shouldShow(P.recordOpen(s)), false);
});

test("'Not now' asks again once after another batch, then stops", () => {
  let s = { opens: P.SHOW_AFTER_OPENS, snoozes: 0, done: false };
  s = P.snooze(s);
  assert.strictEqual(P.shouldShow(s), false);
  assert.strictEqual(s.opens, 0);
  for (let i = 0; i < P.SHOW_AFTER_OPENS; i++) s = P.recordOpen(s);
  assert.strictEqual(P.shouldShow(s), true);
  s = P.snooze(s);
  assert.strictEqual(s.done, true);
  assert.strictEqual(P.shouldShow(s), false);
});

test("functions do not mutate their input", () => {
  const s = Object.freeze({ opens: 3, snoozes: 0, done: false });
  P.recordOpen(s); P.snooze(s); P.finish(s);
  assert.strictEqual(s.opens, 3);
});

test("popup declares a hidden prompt card with links; module has no network APIs or URLs", () => {
  const html = fs.readFileSync(path.join(rootDir, "src/popup/popup.html"), "utf8");
  assert.ok(/id="feedback-prompt"[^>]*hidden/.test(html), "prompt card must start hidden");
  for (const id of ["feedback-rate", "feedback-report", "feedback-later", "feedback-never"]) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  const code = fs.readFileSync(path.join(rootDir, "src/popup/feedbackPrompt.js"), "utf8");
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /https?:\/\//, /\.innerHTML/]) {
    assert.ok(!re.test(code), `prohibited pattern ${re} in feedbackPrompt.js`);
  }
});

test("popup footer always offers a rate link and a feedback link", () => {
  const html = fs.readFileSync(path.join(rootDir, "src/popup/popup.html"), "utf8");
  const footer = html.slice(html.indexOf('class="popup-footer"'));
  assert.ok(/id="rate-link"[^>]*href="https:\/\/chromewebstore\.google\.com\/detail\/[^"]*\/reviews"/.test(footer), "footer needs a rate link to the store reviews tab");
  assert.ok(/rel="noopener noreferrer"/.test(footer.slice(footer.indexOf('id="rate-link"'))), "rate link must use rel=noopener noreferrer");
  assert.ok(/feedback-link/.test(footer), "feedback link stays in the footer");
});

console.log(`\n🎉 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
