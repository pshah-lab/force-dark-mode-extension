import { buildSheetView, columnLetters } from "./spreadsheetView.js";
import { MAX_SHEETS } from "./spreadsheetLimits.js";

// Unique per render so ids never collide when the panel is re-rendered.
let renderCounter = 0;

function el(doc, tag, className) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

function textEl(doc, tag, className, text) {
  const node = el(doc, tag, className);
  node.textContent = text;
  return node;
}

function applyStyle(node, style) {
  for (const [name, value] of Object.entries(style)) {
    // Style keys are camelCase in the view model; map to CSS property names.
    node.style.setProperty(name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), value);
  }
}

function buildNotice(doc, text, withRole) {
  const p = textEl(doc, "p", "truncation-notice", text);
  if (withRole) p.setAttribute("role", "status");
  return p;
}

function buildSheet(doc, sheet, settings, tabbed, panelId, labelledBy) {
  const view = buildSheetView(sheet, settings);
  const wrapper = el(doc, "div");
  if (tabbed) {
    wrapper.setAttribute("role", "tabpanel");
    wrapper.setAttribute("id", panelId);
    wrapper.setAttribute("aria-labelledby", labelledBy);
  }
  if (view.notice) wrapper.appendChild(buildNotice(doc, view.notice, true));
  if (view.empty) {
    wrapper.appendChild(
      buildNotice(doc, view.empty === "tooLarge" ? "This sheet is too large to display." : "This sheet is empty.", false)
    );
    return wrapper;
  }

  const scroll = el(doc, "div", "spreadsheet-scroll");
  scroll.style.setProperty("background", view.container);
  const table = el(doc, "table", "spreadsheet-table");
  table.appendChild(textEl(doc, "caption", "visually-hidden", sheet.name));

  const colgroup = el(doc, "colgroup");
  colgroup.appendChild(el(doc, "col", "spreadsheet-rownum-col"));
  for (let i = 0; i < view.columnCount; i++) {
    const col = el(doc, "col");
    const width = view.columnWidths[i];
    if (typeof width === "number" && Number.isFinite(width) && width > 0) {
      col.style.setProperty("width", `${width}ch`);
    }
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  const thead = el(doc, "thead");
  const headRow = el(doc, "tr");
  const corner = el(doc, "td", "spreadsheet-corner");
  applyStyle(corner, view.header);
  headRow.appendChild(corner);
  for (let i = 0; i < view.columnCount; i++) {
    const th = textEl(doc, "th", "spreadsheet-colhead", columnLetters(i));
    th.setAttribute("scope", "col");
    applyStyle(th, view.header);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el(doc, "tbody");
  view.rows.forEach((row, r) => {
    const tr = el(doc, "tr");
    const rowHead = textEl(doc, "th", "spreadsheet-rowhead", String(r + 1));
    rowHead.setAttribute("scope", "row");
    applyStyle(rowHead, view.header);
    tr.appendChild(rowHead);
    for (const cell of row) {
      if (!cell) continue;
      const td = textEl(doc, "td", "", cell.text);
      applyStyle(td, cell.style);
      if (cell.colspan > 1) td.setAttribute("colspan", String(cell.colspan));
      if (cell.rowspan > 1) td.setAttribute("rowspan", String(cell.rowspan));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  scroll.appendChild(table);
  wrapper.appendChild(scroll);
  return wrapper;
}

// workbook: { sheets, sheetsCapped?, tabs? } — pass tabs:false (CSV) to hide the tab strip.
// state.selected holds the active sheet index so re-rendering (recolouring) keeps the tab.
export function renderSpreadsheet(container, workbook, settings, state = { selected: 0 }, focusTab = false) {
  const doc = container.ownerDocument;
  container.replaceChildren();
  const sheets = workbook?.sheets ?? [];

  if (sheets.length === 0) {
    container.appendChild(buildNotice(doc, "This sheet is empty.", false));
    return;
  }

  const selected = Math.min(Math.max(Number.isInteger(state.selected) ? state.selected : 0, 0), sheets.length - 1);
  state.selected = selected;
  const showTabs = workbook.tabs !== false;
  const baseId = `ssv-${++renderCounter}`;
  const panelId = `${baseId}-panel`;
  const tabId = (i) => `${baseId}-tab-${i}`;
  let activeButton = null;

  if (showTabs) {
    const tablist = el(doc, "div", "spreadsheet-tabs");
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "Sheets");
    const select = (index, focus) => {
      state.selected = index;
      renderSpreadsheet(container, workbook, settings, state, focus);
    };
    const last = sheets.length - 1;
    sheets.forEach((sheet, index) => {
      const button = textEl(doc, "button", "spreadsheet-tab", sheet.name);
      button.setAttribute("type", "button");
      button.setAttribute("role", "tab");
      button.setAttribute("id", tabId(index));
      button.setAttribute("aria-selected", index === selected ? "true" : "false");
      button.setAttribute("aria-controls", panelId);
      button.setAttribute("tabindex", index === selected ? "0" : "-1");
      button.addEventListener("click", () => select(index, true));
      button.addEventListener("keydown", (event) => {
        let next = null;
        if (event.key === "ArrowRight") next = selected >= last ? 0 : selected + 1;
        else if (event.key === "ArrowLeft") next = selected <= 0 ? last : selected - 1;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = last;
        if (next === null) return;
        event.preventDefault();
        select(next, true);
      });
      if (index === selected) activeButton = button;
      tablist.appendChild(button);
    });
    container.appendChild(tablist);
  }

  if (workbook.sheetsCapped) {
    container.appendChild(buildNotice(doc, `Showing the first ${MAX_SHEETS} sheets of this workbook.`, true));
  }

  container.appendChild(buildSheet(doc, sheets[selected], settings, showTabs, panelId, tabId(selected)));

  if (focusTab && activeButton) activeButton.focus();
}
