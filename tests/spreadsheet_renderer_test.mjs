// tests/spreadsheet_renderer_test.mjs
import assert from "assert";
import { renderSpreadsheet } from "../src/viewer/spreadsheet/spreadsheetRenderer.js";
import { MAX_SHEETS } from "../src/viewer/spreadsheet/spreadsheetLimits.js";
import { createContainer, findAll, byTag, byRole, byClass } from "./helpers/fakeDom.mjs";

console.log("=========================================");
console.log("🧱 Running Spreadsheet Renderer (fake DOM) Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

const cell = (text, extra = {}) => ({ text, ...extra });
const mkSheet = (name, rows, extra = {}) => ({ name, rows, ...extra });
const simple = (name = "Sheet1") => mkSheet(name, [[cell("a"), cell("b")], [cell("c"), cell("d")]]);
const settings = { mode: "smart", backgroundColor: "#202020", textColor: "#dddddd" };
const tabs = (c) => byRole(c, "tab");

await test("renders a tablist with one tab per sheet, roving tabindex and aria-selected", () => {
  const c = createContainer();
  renderSpreadsheet(c, { sheets: [simple("One"), simple("Two"), simple("Three")] }, settings, { selected: 1 });
  const lists = byRole(c, "tablist");
  assert.strictEqual(lists.length, 1);
  assert.strictEqual(lists[0].getAttribute("aria-label"), "Sheets");
  assert.ok(lists[0].classList.contains("spreadsheet-tabs"));
  const t = tabs(c);
  assert.strictEqual(t.length, 3);
  assert.deepStrictEqual(t.map((x) => x.tagName), ["button", "button", "button"]);
  assert.deepStrictEqual(t.map((x) => x.getAttribute("type")), ["button", "button", "button"]);
  assert.deepStrictEqual(t.map((x) => x.textContent), ["One", "Two", "Three"]);
  assert.deepStrictEqual(t.map((x) => x.getAttribute("aria-selected")), ["false", "true", "false"]);
  assert.deepStrictEqual(t.map((x) => x.getAttribute("tabindex")), ["-1", "0", "-1"]);
  assert.ok(t.every((x) => x.classList.contains("spreadsheet-tab")));
});

await test("tabpanel is labelled by the selected tab and tabs control it", () => {
  const c = createContainer();
  renderSpreadsheet(c, { sheets: [simple("One"), simple("Two")] }, settings, { selected: 1 });
  const panel = byRole(c, "tabpanel");
  assert.strictEqual(panel.length, 1);
  const t = tabs(c);
  assert.strictEqual(panel[0].getAttribute("aria-labelledby"), t[1].getAttribute("id"));
  assert.ok(panel[0].getAttribute("id"));
  assert.ok(t.every((x) => x.getAttribute("aria-controls") === panel[0].getAttribute("id")));
});

await test("ids are unique across separate renders", () => {
  const a = createContainer();
  const b = createContainer();
  renderSpreadsheet(a, { sheets: [simple()] }, settings);
  renderSpreadsheet(b, { sheets: [simple()] }, settings);
  assert.notStrictEqual(tabs(a)[0].getAttribute("id"), tabs(b)[0].getAttribute("id"));
  assert.notStrictEqual(byRole(a, "tabpanel")[0].getAttribute("id"), byRole(b, "tabpanel")[0].getAttribute("id"));
});

await test("clicking a tab selects it, stores it in state and shows that sheet", () => {
  const c = createContainer();
  const state = { selected: 0 };
  renderSpreadsheet(c, { sheets: [simple("One"), mkSheet("Two", [[cell("only-two")]])] }, settings, state);
  tabs(c)[1].dispatch("click");
  assert.strictEqual(state.selected, 1);
  assert.deepStrictEqual(tabs(c).map((x) => x.getAttribute("aria-selected")), ["false", "true"]);
  assert.ok(byTag(c, "td").some((td) => td.textContent === "only-two"));
  assert.strictEqual(byTag(c, "caption")[0].textContent, "Two");
});

function key(c, state, index, k) {
  const ev = tabs(c)[index].dispatch("keydown", { key: k });
  return ev;
}

await test("ArrowRight/ArrowLeft move and wrap; focus follows; default prevented", () => {
  const c = createContainer();
  const state = { selected: 0 };
  renderSpreadsheet(c, { sheets: [simple("A"), simple("B"), simple("C")] }, settings, state);
  let ev = key(c, state, 0, "ArrowRight");
  assert.ok(ev.defaultPrevented);
  assert.strictEqual(state.selected, 1);
  assert.strictEqual(c.ownerDocument.activeElement, tabs(c)[1]);
  key(c, state, 1, "ArrowRight");
  key(c, state, 2, "ArrowRight");
  assert.strictEqual(state.selected, 0);
  assert.strictEqual(c.ownerDocument.activeElement, tabs(c)[0]);
  ev = key(c, state, 0, "ArrowLeft");
  assert.ok(ev.defaultPrevented);
  assert.strictEqual(state.selected, 2);
  assert.strictEqual(c.ownerDocument.activeElement, tabs(c)[2]);
});

await test("Home and End select first and last tab and focus it", () => {
  const c = createContainer();
  const state = { selected: 1 };
  renderSpreadsheet(c, { sheets: [simple("A"), simple("B"), simple("C")] }, settings, state);
  let ev = key(c, state, 1, "End");
  assert.ok(ev.defaultPrevented);
  assert.strictEqual(state.selected, 2);
  assert.strictEqual(c.ownerDocument.activeElement, tabs(c)[2]);
  key(c, state, 2, "Home");
  assert.strictEqual(state.selected, 0);
  assert.strictEqual(c.ownerDocument.activeElement, tabs(c)[0]);
});

await test("other keys are ignored", () => {
  const c = createContainer();
  const state = { selected: 0 };
  renderSpreadsheet(c, { sheets: [simple("A"), simple("B")] }, settings, state);
  const ev = key(c, state, 0, "a");
  assert.ok(!ev.defaultPrevented);
  assert.strictEqual(state.selected, 0);
});

await test("selection survives a re-render and is clamped to the sheet count", () => {
  const c = createContainer();
  const state = { selected: 2 };
  const wb = { sheets: [simple("A"), simple("B"), simple("C")] };
  renderSpreadsheet(c, wb, settings, state);
  renderSpreadsheet(c, wb, { ...settings, mode: "sepia" }, state);
  assert.deepStrictEqual(tabs(c).map((x) => x.getAttribute("aria-selected")), ["false", "false", "true"]);
  const small = { sheets: [simple("A")] };
  renderSpreadsheet(c, small, settings, state);
  assert.strictEqual(state.selected, 0);
  assert.strictEqual(tabs(c)[0].getAttribute("aria-selected"), "true");
  const neg = { selected: -3 };
  renderSpreadsheet(c, wb, settings, neg);
  assert.strictEqual(neg.selected, 0);
});

await test("default state argument works", () => {
  const c = createContainer();
  renderSpreadsheet(c, { sheets: [simple("A"), simple("B")] }, settings);
  assert.strictEqual(tabs(c)[0].getAttribute("aria-selected"), "true");
});

await test("re-render clears previous content", () => {
  const c = createContainer();
  renderSpreadsheet(c, { sheets: [simple("A"), simple("B")] }, settings);
  renderSpreadsheet(c, { sheets: [simple("A")] }, settings);
  assert.strictEqual(byRole(c, "tablist").length, 1);
  assert.strictEqual(tabs(c).length, 1);
  assert.strictEqual(byTag(c, "table").length, 1);
});

await test("table structure: caption, colgroup widths, header cells and scopes", () => {
  const c = createContainer();
  renderSpreadsheet(
    c,
    { sheets: [mkSheet("Data", [[cell("a"), cell("b"), cell("c")], [cell("d")]], { columnWidths: [10, undefined, 20] })] },
    settings
  );
  const scroll = byClass(c, "spreadsheet-scroll");
  assert.strictEqual(scroll.length, 1);
  assert.ok(scroll[0].style.background);
  const table = byTag(c, "table")[0];
  assert.ok(table.classList.contains("spreadsheet-table"));
  const cap = byTag(c, "caption")[0];
  assert.ok(cap.classList.contains("visually-hidden"));
  assert.strictEqual(cap.textContent, "Data");
  const cols = byTag(c, "col");
  assert.strictEqual(cols.length, 4);
  assert.ok(cols[0].classList.contains("spreadsheet-rownum-col"));
  assert.strictEqual(cols[1].style.width, "10ch");
  assert.ok(!cols[2].style.width);
  assert.strictEqual(cols[3].style.width, "20ch");
  const colheads = byClass(c, "spreadsheet-colhead");
  assert.deepStrictEqual(colheads.map((h) => h.textContent), ["A", "B", "C"]);
  assert.ok(colheads.every((h) => h.tagName === "th" && h.getAttribute("scope") === "col"));
  assert.strictEqual(byClass(c, "spreadsheet-corner").length, 1);
  assert.strictEqual(byClass(c, "spreadsheet-corner")[0].tagName, "td");
  const rowheads = byClass(c, "spreadsheet-rowhead");
  assert.deepStrictEqual(rowheads.map((h) => h.textContent), ["1", "2"]);
  assert.ok(rowheads.every((h) => h.tagName === "th" && h.getAttribute("scope") === "row"));
  const hdr = byClass(c, "spreadsheet-colhead")[0];
  assert.ok(hdr.style.background && hdr.style.color);
  assert.ok(byClass(c, "spreadsheet-corner")[0].style.background);
});

await test("covered cells are skipped and spans set as attributes", () => {
  const c = createContainer();
  renderSpreadsheet(
    c,
    {
      sheets: [
        mkSheet("M", [
          [cell("m", { colspan: 2, rowspan: 2 }), cell("", { covered: true }), cell("x")],
          [cell("", { covered: true }), cell("", { covered: true }), cell("y")],
        ]),
      ],
    },
    settings
  );
  const trs = byTag(byTag(c, "tbody")[0], "tr");
  assert.strictEqual(trs.length, 2);
  assert.strictEqual(byTag(trs[0], "td").length, 2);
  assert.strictEqual(byTag(trs[1], "td").length, 1);
  const m = byTag(trs[0], "td")[0];
  assert.strictEqual(m.getAttribute("colspan"), "2");
  assert.strictEqual(m.getAttribute("rowspan"), "2");
  const x = byTag(trs[0], "td")[1];
  assert.strictEqual(x.getAttribute("colspan"), null);
  assert.strictEqual(x.getAttribute("rowspan"), null);
});

await test("cell styles are applied inline via style properties", () => {
  const c = createContainer();
  renderSpreadsheet(
    c,
    { sheets: [mkSheet("S", [[cell("a", { bold: true, italic: true, align: "right", fill: "#ffff00" })]])] },
    { mode: "original" }
  );
  const td = byTag(byTag(c, "tbody")[0], "td")[0];
  assert.strictEqual(td.style.background, "#ffff00");
  assert.strictEqual(td.style["font-weight"], "bold");
  assert.strictEqual(td.style["font-style"], "italic");
  assert.strictEqual(td.style["text-align"], "right");
});

await test("truncation notice is a role=status paragraph with exact text", () => {
  const c = createContainer();
  renderSpreadsheet(c, { sheets: [mkSheet("T", [[cell("a"), cell("b")]], { truncated: true })] }, settings);
  const notices = byClass(c, "truncation-notice");
  assert.strictEqual(notices.length, 1);
  assert.strictEqual(notices[0].tagName, "p");
  assert.strictEqual(notices[0].getAttribute("role"), "status");
  assert.strictEqual(notices[0].textContent, "Showing the first 1 rows and 2 columns of this sheet.");
});

await test("empty and too-large sheets show a plain notice and no table", () => {
  const c = createContainer();
  renderSpreadsheet(c, { sheets: [mkSheet("E", [], { truncated: true })] }, settings);
  assert.strictEqual(byTag(c, "table").length, 0);
  let n = byClass(c, "truncation-notice");
  assert.strictEqual(n.length, 1);
  assert.strictEqual(n[0].textContent, "This sheet is empty.");
  assert.strictEqual(n[0].getAttribute("role"), null);
  renderSpreadsheet(c, { sheets: [mkSheet("L", [], { tooLarge: true })] }, settings);
  n = byClass(c, "truncation-notice");
  assert.strictEqual(n.length, 1);
  assert.strictEqual(n[0].textContent, "This sheet is too large to display.");
});

await test("workbook with no sheets shows the empty notice and no tablist", () => {
  const c = createContainer();
  renderSpreadsheet(c, { sheets: [] }, settings);
  assert.strictEqual(byRole(c, "tablist").length, 0);
  const n = byClass(c, "truncation-notice");
  assert.strictEqual(n.length, 1);
  assert.strictEqual(n[0].textContent, "This sheet is empty.");
});

await test("workbook notice appears only when sheetsCapped", () => {
  const c = createContainer();
  renderSpreadsheet(c, { sheets: [simple()], sheetsCapped: true }, settings);
  const n = byClass(c, "truncation-notice");
  assert.strictEqual(n.length, 1);
  assert.strictEqual(n[0].getAttribute("role"), "status");
  assert.strictEqual(n[0].textContent, `Showing the first ${MAX_SHEETS} sheets of this workbook.`);
  assert.strictEqual(n[0].textContent, "Showing the first 50 sheets of this workbook.");
  renderSpreadsheet(c, { sheets: [simple()], sheetsCapped: false }, settings);
  assert.strictEqual(byClass(c, "truncation-notice").length, 0);
});

await test("CSV mode (tabs:false) has no tablist, tabs or tabpanel", () => {
  const c = createContainer();
  renderSpreadsheet(c, { sheets: [simple("file.csv")], tabs: false }, settings);
  assert.strictEqual(byRole(c, "tablist").length, 0);
  assert.strictEqual(tabs(c).length, 0);
  assert.strictEqual(byRole(c, "tabpanel").length, 0);
  assert.strictEqual(byTag(c, "table").length, 1);
  assert.strictEqual(byTag(c, "caption")[0].textContent, "file.csv");
});

await test("hostile cell text is only ever a text node", () => {
  const c = createContainer();
  const evil = "<img src=x onerror=alert(1)>";
  renderSpreadsheet(c, { sheets: [mkSheet("S", [[cell(evil)]])] }, settings);
  assert.strictEqual(byTag(c, "img").length, 0);
  const td = byTag(byTag(c, "tbody")[0], "td")[0];
  assert.strictEqual(td.children.length, 1);
  assert.strictEqual(td.children[0].nodeType, 3);
  assert.strictEqual(td.children[0].text, evil);
  assert.strictEqual(findAll(c, (n) => n.tagName === "script").length, 0);
});

await test("hostile sheet names are only text (tab and caption), never elements", () => {
  const c = createContainer();
  const evil = "<b onclick=x>S</b><script>alert(1)</script>";
  renderSpreadsheet(c, { sheets: [simple(evil), simple("ok")] }, settings);
  assert.strictEqual(byTag(c, "b").length, 0);
  assert.strictEqual(byTag(c, "script").length, 0);
  assert.strictEqual(tabs(c)[0].children.length, 1);
  assert.strictEqual(tabs(c)[0].children[0].nodeType, 3);
  assert.strictEqual(tabs(c)[0].textContent, evil);
  assert.strictEqual(byTag(c, "caption")[0].textContent, evil);
});

await test("no innerHTML/outerHTML/insertAdjacentHTML is ever used (fake DOM throws on them)", () => {
  const c = createContainer();
  // The fake DOM throws if any of these are touched; a full multi-feature render must not trip it.
  renderSpreadsheet(
    c,
    {
      sheets: [
        simple("A"),
        mkSheet("B", [[cell("x", { colspan: 2, bold: true }), cell("", { covered: true })]], { truncated: true }),
        mkSheet("C", [], { tooLarge: true }),
      ],
      sheetsCapped: true,
    },
    settings,
    { selected: 1 }
  );
  tabs(c)[2].dispatch("click");
  tabs(c)[0].dispatch("keydown", { key: "ArrowRight" });
  const probe = c.ownerDocument.createElement("div");
  assert.throws(() => {
    probe.innerHTML = "x";
  });
  assert.throws(() => {
    probe.outerHTML = "x";
  });
  assert.throws(() => probe.insertAdjacentHTML("beforeend", "x"));
});

console.log(`\n🎉 Spreadsheet renderer tests complete. Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
