// tests/report_card_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
// reportCard.js is a classic panel script (package is "type": "module"), so run it in a sandbox.
const sandbox = {};
vm.runInNewContext(read("src/popup/reportCard.js"), sandbox);
const { REPORT_COPY, outcomeMessage } = sandbox.ReportCard;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n    Error: ${err.message}`);
    failed++;
  }
}

test("the consent text is exactly the approved copy", () => {
  assert.strictEqual(REPORT_COPY.title, "Report this site as broken?");
  assert.strictEqual(
    REPORT_COPY.body,
    "This sends the site's domain (for example example.com), the engine and theme you are using, and the extension version to the developer so the site can be fixed. It does not send the page address, page content, anything you type, or any ID. You are asked every time."
  );
  assert.strictEqual(REPORT_COPY.send, "Send report");
  assert.strictEqual(REPORT_COPY.cancel, "Cancel");
});

test("the consent text names the domain and never claims the data is anonymous", () => {
  assert.ok(/domain/.test(REPORT_COPY.body));
  for (const text of Object.values(REPORT_COPY)) assert.ok(!/anonym/i.test(text), text);
});

test("every outcome has a message", () => {
  assert.strictEqual(outcomeMessage("sent"), "Thanks, report sent");
  assert.strictEqual(outcomeMessage("already"), "Already reported today");
  assert.strictEqual(outcomeMessage("failed"), "Could not send, try again");
  assert.strictEqual(outcomeMessage("invalid"), "This site cannot be reported");
});

test("an unknown outcome is shown as a failure, never as success", () => {
  for (const o of [undefined, null, "", "ok", 5, {}]) assert.strictEqual(outcomeMessage(o), "Could not send, try again");
});

test("the panel has the report button, a confirmation card showing the domain, and both actions", () => {
  const html = read("src/popup/popup.html");
  for (const id of ["report-site", "report-card", "report-domain", "report-send", "report-cancel", "report-status"]) {
    assert.ok(html.includes(`id="${id}"`), `popup.html needs #${id}`);
  }
  assert.ok(html.includes("reportCard.js"), "popup.html must load reportCard.js");
});

test("the confirmation card is hidden until the button is pressed", () => {
  const html = read("src/popup/popup.html");
  assert.ok(/id="report-card"[^>]*\shidden/.test(html));
});

test("no usage-statistics or telemetry wording remains in the panel", () => {
  for (const rel of ["src/popup/popup.html", "src/popup/popup.js"]) {
    assert.ok(!/telemetry|usage stat/i.test(read(rel)), `${rel} still mentions telemetry or usage stats`);
  }
});

test("the panel sends only the host, engine and theme id in the report message", () => {
  const js = read("src/popup/popup.js");
  const block = js.match(/type:\s*"SITE_REPORT"[\s\S]{0,200}?\}/);
  assert.ok(block, "popup.js must send a SITE_REPORT message");
  assert.ok(/\bhost\b/.test(block[0]) && /engine/.test(block[0]) && /themeId/.test(block[0]));
  assert.ok(!/tab\.url|href|location/.test(block[0]), "the message must not carry a page address");
});

test("the old report link no longer claims to report a broken site", () => {
  const html = read("src/popup/popup.html");
  assert.ok(!/Report a broken site/.test(html.replace(/Report this site as broken/g, "")));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
