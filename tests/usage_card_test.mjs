// tests/usage_card_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
// usageCard.js is a classic panel script (package is "type": "module"), so run it in a sandbox.
const sandbox = {};
vm.runInNewContext(read("src/popup/usageCard.js"), sandbox);
const { USAGE_COPY, cardFor } = sandbox.UsageCard;

const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

const TOPICS = [
  [/random ID/i, "a random ID"],
  [/not linked to your name or account/i, "not linked to name or account"],
  [/date/i, "the date"],
  [/extension version/i, "the extension version"],
  [/engines/i, "which engines"],
  [/Auto, CSS, Invert/, "the engine names"],
  [/how many sites/i, "how many sites"],
  [/number only, never the sites/i, "a number only, never the sites"],
];
const allText = (c) => [c.title, c.intro, ...c.items, c.note, c.yes, c.no].join(" ");

test("cardFor shows the ask card, the reconfirm card, or nothing", () => {
  assert.strictEqual(cardFor("ask"), USAGE_COPY.ask);
  assert.strictEqual(cardFor("reconfirm"), USAGE_COPY.reconfirm);
  for (const none of [null, undefined, "", "other", 5, {}]) assert.strictEqual(cardFor(none), null, String(none));
});

test("both cards list every field that is sent, and nothing else", () => {
  for (const key of ["ask", "reconfirm"]) {
    const card = USAGE_COPY[key];
    assert.strictEqual(card.items.length, 4, `${key}: exactly four items`);
    const text = card.items.join(" ");
    for (const [re, label] of TOPICS) assert.ok(re.test(text), `${key}: must state ${label}`);
  }
});

test("the buttons say what they do", () => {
  assert.deepStrictEqual([USAGE_COPY.ask.yes, USAGE_COPY.ask.no], ["Turn on", "No thanks"]);
  assert.deepStrictEqual([USAGE_COPY.reconfirm.yes, USAGE_COPY.reconfirm.no], ["Keep it on", "Turn off and delete my data"]);
});

test("the copy is plain: never anonymous, says off by default, may be updated, never the sites, and how to turn it off", () => {
  for (const key of ["ask", "reconfirm"]) {
    const card = USAGE_COPY[key];
    const text = allText(card);
    assert.ok(!/anonym/i.test(text), `${key}: must not say anonymous`);
    assert.ok(!/telemetry|tracking/i.test(text), `${key}: no jargon`);
    assert.ok(/updated/i.test(card.intro), `${key}: must say the day's report may be updated`);
    assert.ok(/never receive the sites you visit, page content, or anything you type/i.test(card.note), `${key}: note`);
    assert.ok(/Options/.test(card.note) && /deletes what we hold for your ID/i.test(card.note), `${key}: how to turn off`);
  }
  assert.ok(/off unless you turn it on/i.test(USAGE_COPY.ask.intro));
  assert.ok(/Nothing new is sent until you confirm/i.test(USAGE_COPY.reconfirm.intro));
  assert.ok(/version 2\.0/i.test(USAGE_COPY.reconfirm.intro));
});

test("the side panel has the card, hidden until asked, and loads the script before popup.js", () => {
  const html = read("src/popup/popup.html");
  for (const id of ["usage-card", "usage-title", "usage-intro", "usage-items", "usage-note", "usage-yes", "usage-no"]) {
    assert.ok(html.includes(`id="${id}"`), `#${id}`);
  }
  assert.ok(/id="usage-card"[^>]*\shidden/.test(html), "hidden by default");
  assert.ok(html.indexOf("usageCard.js") > -1 && html.indexOf("usageCard.js") < html.indexOf("popup.js"));
});

test("the panel asks USAGE_STATUS after the welcome card and answers with USAGE_CONSENT", () => {
  const js = read("src/popup/popup.js");
  assert.ok(/UsageCard\.cardFor\(/.test(js));
  assert.ok(/type: "USAGE_STATUS"/.test(js));
  assert.ok(/type: "USAGE_CONSENT", enabled: true/.test(js) && /type: "USAGE_CONSENT", enabled: false/.test(js));
  assert.ok(/initWelcomeCard\(\)\s*\.then\(\(\) => initUsageCard\(\)\)/.test(js), "usage card follows the welcome card");
});

test("Options has an off-by-default toggle that sends USAGE_CONSENT and lists the same fields", () => {
  const html = read("src/options/options.html");
  assert.ok(/<input[^>]*id="usage-toggle"[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*id="usage-toggle"/.test(html));
  assert.ok(!/id="usage-toggle"[^>]*checked/.test(html), "unchecked in the markup");
  assert.ok(html.includes('id="usage-result"'));
  const section = html.slice(html.indexOf('id="usage-card-options"'), html.indexOf("Privacy & Data Management"));
  for (const [re, label] of TOPICS) assert.ok(re.test(section), `options section must state ${label}`);
  assert.ok(!/anonym/i.test(section));
  const js = read("src/options/options.js");
  assert.ok(/type: "USAGE_CONSENT", enabled: usageToggle\.checked/.test(js));
  assert.ok(/type: "USAGE_STATUS"/.test(js));
});

console.log("\nUsage report card and Options toggle");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
