// tests/welcome_card_test.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { buildWelcomeState, WELCOME_KEY } from "../src/background/welcomeState.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");
// welcomeCard.js is a classic panel script (package is "type": "module"), so run it in a sandbox.
const sandbox = {};
vm.runInNewContext(read("src/popup/welcomeCard.js"), sandbox);
const { WELCOME_COPY, cardFor, markSeen, STATE_KEY } = sandbox.WelcomeCard;

const queue = [];
let passed = 0;
let failed = 0;
function test(name, fn) { queue.push({ name, fn }); }

test("the Rate and Feedback links are real buttons, big enough to hit", () => {
  const html = read("src/popup/popup.html");
  for (const id of ["rate-link", "feedback-link"]) {
    assert.ok(new RegExp(`id="${id}"[^>]*class="[^"]*footer-btn`).test(html) || new RegExp(`class="[^"]*footer-btn[^"]*"[^>]*id="${id}"`).test(html), `#${id} must use .footer-btn`);
  }
  const css = read("src/popup/popup.css");
  const block = css.match(/\.footer-btn\s*\{[^}]*\}/);
  assert.ok(block, "popup.css needs a .footer-btn rule");
  const size = Number(block[0].match(/font-size:\s*(\d+)px/)?.[1]);
  const minH = Number(block[0].match(/min-height:\s*(\d+)px/)?.[1]);
  assert.ok(size >= 13, `font-size ${size}px must be at least 13px`);
  assert.ok(minH >= 36, `min-height ${minH}px must be at least 36px`);
});

test("install writes the new-user card; an update from another version writes the what's-new card", () => {
  assert.deepStrictEqual(buildWelcomeState({ reason: "install" }, "2.1.0"), { kind: "new", version: "2.1.0", seen: false });
  assert.deepStrictEqual(buildWelcomeState({ reason: "update", previousVersion: "2.0.0" }, "2.1.0"), { kind: "update", version: "2.1.0", seen: false });
});

test("nothing is written for a same-version reload, browser updates, or junk", () => {
  assert.strictEqual(buildWelcomeState({ reason: "update", previousVersion: "2.1.0" }, "2.1.0"), null);
  for (const reason of ["chrome_update", "shared_module_update"]) assert.strictEqual(buildWelcomeState({ reason }, "2.1.0"), null, reason);
  for (const bad of [undefined, null, {}, "x", 5, { reason: "update" }]) assert.strictEqual(buildWelcomeState(bad, "2.1.0"), null, JSON.stringify(bad));
  assert.strictEqual(buildWelcomeState({ reason: "install" }, "not a version"), null);
});

test("the storage key is the same in the worker and the panel", () => {
  assert.strictEqual(WELCOME_KEY, "welcomeState");
  assert.strictEqual(STATE_KEY, WELCOME_KEY);
});

test("cardFor shows one card per unseen state and none otherwise", () => {
  assert.strictEqual(cardFor({ kind: "new", version: "2.1.0", seen: false }).id, "best");
  assert.strictEqual(cardFor({ kind: "update", version: "2.1.0", seen: false }).id, "whatsnew");
  assert.strictEqual(cardFor({ kind: "new", version: "2.1.0", seen: true }), null);
  for (const bad of [undefined, null, {}, "x", { kind: "other", seen: false }]) assert.strictEqual(cardFor(bad), null, JSON.stringify(bad));
});

test("markSeen keeps the kind and version and sets seen", () => {
  assert.strictEqual(JSON.stringify(markSeen({ kind: "update", version: "2.1.0", seen: false })), JSON.stringify({ kind: "update", version: "2.1.0", seen: true }));
});

test("what's new names the real changes and says exactly what is sent", () => {
  const card = cardFor({ kind: "update", version: "2.1.0", seen: false });
  const text = [card.title, ...card.items, card.dataNote].join(" ");
  assert.ok(/side panel/i.test(text));
  assert.ok(/Report this site as broken/.test(text));
  assert.ok(/usage report/i.test(text) && /optional/i.test(text) && /off unless you turn it on/i.test(text), "must say the usage report is optional and off unless turned on");
  assert.ok(/domain/.test(card.dataNote) && /Nothing is sent unless you turn on the usage report or press Report this site as broken/.test(card.dataNote));
});

test("best features for new users names features that exist, with the same data note", () => {
  const card = cardFor({ kind: "new", version: "2.1.0", seen: false });
  const text = card.items.join(" ");
  for (const word of ["theme", "site pack", "PDF", "Alt+Shift+D"]) assert.ok(text.toLowerCase().includes(word.toLowerCase()), `must mention ${word}`);
  assert.ok(/domain/.test(card.dataNote) && /Nothing is sent unless you turn on the usage report/.test(card.dataNote));
  assert.strictEqual(card.dataNote, cardFor({ kind: "update", version: "2.1.0", seen: false }).dataNote);
});

test("no card text calls the data anonymous or promises more than is true", () => {
  for (const id of ["whatsnew", "best"]) {
    const card = WELCOME_COPY[id];
    for (const text of [card.title, card.dataNote, card.button, ...card.items]) {
      assert.ok(!/anonym/i.test(text), text);
      assert.ok(!/telemetry|tracking/i.test(text), text);
    }
  }
});

test("the worker records the state on install and update; the panel shows and dismisses the card", () => {
  const sw = read("src/background/serviceWorker.js");
  assert.ok(/onInstalled\.addListener\(\s*\(details\)/.test(sw), "onInstalled must receive details");
  assert.ok(/buildWelcomeState\(details/.test(sw) && /WELCOME_KEY/.test(sw));
  const html = read("src/popup/popup.html");
  for (const id of ["welcome-card", "welcome-title", "welcome-items", "welcome-data", "welcome-dismiss"]) assert.ok(html.includes(`id="${id}"`), `#${id}`);
  assert.ok(html.includes("welcomeCard.js"));
  assert.ok(/id="welcome-card"[^>]*\shidden/.test(html), "the card is hidden until a state asks for it");
  const js = read("src/popup/popup.js");
  assert.ok(/WelcomeCard\.cardFor\(/.test(js) && /WelcomeCard\.markSeen\(/.test(js));
});

console.log("\nWelcome card and footer buttons");
for (const { name, fn } of queue) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    Error: ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
