// Tiny fake DOM for testing DOM-writer modules in Node. Not a general DOM:
// only what the spreadsheet renderer needs. Setting innerHTML / outerHTML or calling
// insertAdjacentHTML throws, so tests prove markup is never injected.

export class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.text = String(text);
  }
  get textContent() {
    return this.text;
  }
}

export class FakeElement {
  constructor(tagName, doc) {
    this.nodeType = 1;
    this.tagName = String(tagName).toLowerCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {
      setProperty: (name, value) => {
        this.style[name] = String(value);
      },
    };
    const owner = this;
    this.classList = {
      add: (...names) => {
        const set = new Set((owner.attributes.class || "").split(/\s+/).filter(Boolean));
        for (const n of names) set.add(n);
        owner.attributes.class = [...set].join(" ");
      },
      contains: (name) => (owner.attributes.class || "").split(/\s+/).includes(name),
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  get className() {
    return this.attributes.class || "";
  }
  set className(value) {
    this.attributes.class = String(value);
  }
  get id() {
    return this.attributes.id || "";
  }
  set id(value) {
    this.attributes.id = String(value);
  }
  get colSpan() {
    return Number(this.attributes.colspan || 1);
  }
  set colSpan(value) {
    this.attributes.colspan = String(value);
  }
  get rowSpan() {
    return Number(this.attributes.rowspan || 1);
  }
  set rowSpan(value) {
    this.attributes.rowspan = String(value);
  }
  get scope() {
    return this.attributes.scope;
  }
  set scope(value) {
    this.attributes.scope = String(value);
  }
  get type() {
    return this.attributes.type;
  }
  set type(value) {
    this.attributes.type = String(value);
  }
  get tabIndex() {
    return Number(this.attributes.tabindex);
  }
  set tabIndex(value) {
    this.attributes.tabindex = String(value);
  }

  get textContent() {
    return this.children.map((c) => c.textContent).join("");
  }
  set textContent(value) {
    this.children = value === "" || value == null ? [] : [new FakeText(value)];
  }

  set innerHTML(_) {
    throw new Error("innerHTML must never be assigned");
  }
  get innerHTML() {
    throw new Error("innerHTML must never be read");
  }
  set outerHTML(_) {
    throw new Error("outerHTML must never be assigned");
  }
  insertAdjacentHTML() {
    throw new Error("insertAdjacentHTML must never be called");
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    for (const n of nodes) this.children.push(typeof n === "string" ? new FakeText(n) : n);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }
  dispatch(type, event = {}) {
    const e = { type, target: this, defaultPrevented: false, ...event };
    e.preventDefault = () => {
      e.defaultPrevented = true;
    };
    for (const h of this.listeners[type] || []) h(e);
    return e;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }
}

export class FakeDocument {
  constructor() {
    this.activeElement = null;
  }
  createElement(tag) {
    return new FakeElement(tag, this);
  }
  createTextNode(text) {
    return new FakeText(text);
  }
}

export function createContainer() {
  const doc = new FakeDocument();
  return doc.createElement("div");
}

export function walk(node, visit) {
  if (node.nodeType !== 1) return;
  visit(node);
  for (const c of node.children) walk(c, visit);
}

export function findAll(root, predicate) {
  const out = [];
  walk(root, (n) => {
    if (predicate(n)) out.push(n);
  });
  return out;
}

export const byTag = (root, tag) => findAll(root, (n) => n.tagName === tag);
export const byRole = (root, role) => findAll(root, (n) => n.getAttribute("role") === role);
export const byClass = (root, cls) => findAll(root, (n) => n.classList.contains(cls));
