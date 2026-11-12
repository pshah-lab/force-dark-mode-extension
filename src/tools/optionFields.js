// Option rows for a tool, built from the registry's option specs with DOM APIs only.
// Shared by the Tools page and the document viewer's Tools control.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

// One <label> per option, each wrapping its input. Input ids are `${idPrefix}${option.id}`, names are option ids.
export function buildOptionFields(tool, idPrefix = "opt-") {
  return tool.options.map((option) => {
    const id = `${idPrefix}${option.id}`;
    let input;
    if (option.type === "select") {
      input = el("select", { id, name: option.id });
      input.replaceChildren(...option.choices.map((c) => el("option", { value: c.value, text: c.label })));
      input.value = option.default;
    } else if (option.type === "checkbox") {
      input = el("input", { id, name: option.id, type: "checkbox", checked: !!option.default });
      return el("label", { className: "checkbox", htmlFor: id }, input, option.label);
    } else {
      input = el("input", { id, name: option.id, type: option.type, autocomplete: "off", spellcheck: false });
      if (option.placeholder) input.placeholder = option.placeholder;
      if (option.type === "number") {
        for (const key of ["min", "max", "step"]) if (option[key] !== undefined) input[key] = String(option[key]);
        input.value = String(option.default);
      } else {
        input.value = option.default;
      }
    }
    return el("label", { htmlFor: id }, option.label, input);
  });
}

// Raw values (strings / booleans) from a form built by buildOptionFields; pass to readValues().
export function rawOptionValues(tool, form) {
  const raw = {};
  for (const option of tool.options) {
    const input = form.elements.namedItem(option.id);
    if (!input) continue;
    raw[option.id] = option.type === "checkbox" ? input.checked : input.value;
  }
  return raw;
}
