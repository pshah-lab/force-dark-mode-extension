// src/options/customCssEditor.js
// Custom CSS manager for the Options page. A thin shell over the pure helpers in
// themeCore.js (hostFromHash, canSaveCss, cssSites). Hosts and CSS text reach the DOM
// through textContent / value only.
import { getAllConfigs, getCustomCss, setCustomCss } from "../shared/storage.js";

const MAX_CHARS = 6000;

export async function initCustomCssEditor({ showStatus }) {
  const T = globalThis.ForceDarkThemes;
  const $ = (id) => document.getElementById(id);
  const hostInput = $("css-host");
  const textArea = $("css-text");
  const counter = $("css-counter");
  const errorEl = $("css-error");
  const saveBtn = $("css-save");
  const listEl = $("css-list");
  const emptyEl = $("css-empty");
  if (!T || !hostInput || !textArea || !saveBtn || !listEl) return;

  let loadToken = 0;

  function setError(message) {
    errorEl.textContent = message || "";
  }

  function updateCounter() {
    const n = textArea.value.length;
    counter.textContent = `${n} / ${MAX_CHARS}`;
    counter.classList.toggle("near-limit", n >= MAX_CHARS - 300);
  }

  function summary(css) {
    const first = css.split("\n").find((line) => line.trim() !== "") || "";
    return first.trim().slice(0, 80);
  }

  async function loadHost(host) {
    const token = ++loadToken;
    const css = await getCustomCss(host);
    if (token !== loadToken || hostInput.value.trim().toLowerCase() !== host) return;
    textArea.value = css;
    updateCounter();
    setError("");
  }

  async function startEditing(host) {
    hostInput.value = host;
    textArea.value = "";
    updateCounter();
    await loadHost(host);
    textArea.focus();
  }

  async function applyHash() {
    const host = T.hostFromHash(location.hash);
    if (!host) return;
    await startEditing(host);
    $("css-card").scrollIntoView();
  }

  function siteButton(label, host, className, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn btn-small ${className}`;
    btn.textContent = label;
    btn.setAttribute("aria-label", `${label} custom CSS for ${host}`);
    btn.addEventListener("click", handler);
    return btn;
  }

  async function removeSite(host) {
    if (!window.confirm(`Delete the custom CSS for ${host}?`)) return;
    const result = await setCustomCss(host, "");
    if (!result.ok) {
      showStatus(result.error || "Could not delete the custom CSS.", "error");
      return;
    }
    if (hostInput.value.trim().toLowerCase() === host) {
      textArea.value = "";
      updateCounter();
      setError("");
    }
    await renderList();
    showStatus(`✓ Custom CSS for ${host} deleted.`);
  }

  async function renderList() {
    const all = await getAllConfigs();
    const sites = T.cssSites(all);
    listEl.textContent = "";
    emptyEl.hidden = sites.length > 0;
    for (const { host, length } of sites) {
      const line = summary(all[`__css:${host}`]);
      const item = document.createElement("li");
      item.className = "theme-item";
      const name = document.createElement("span");
      name.className = "theme-item-name css-site-host";
      name.textContent = host;
      const info = document.createElement("span");
      info.className = "css-site-preview";
      info.textContent = line ? `${line}  (${length} chars)` : `${length} chars`;
      const actions = document.createElement("span");
      actions.className = "theme-item-actions";
      actions.append(
        siteButton("Edit", host, "btn-secondary", () => startEditing(host)),
        siteButton("Delete", host, "btn-danger", () => removeSite(host))
      );
      item.append(name, info, actions);
      listEl.appendChild(item);
    }
  }

  async function save() {
    const check = T.canSaveCss(hostInput.value, textArea.value);
    if (!check.ok) {
      setError(check.error);
      showStatus(check.error, "error");
      return;
    }
    setError("");
    const result = await setCustomCss(check.host, textArea.value);
    if (!result.ok) {
      showStatus(result.error || "Could not save the custom CSS.", "error");
      return;
    }
    hostInput.value = check.host;
    await renderList();
    showStatus(
      textArea.value === ""
        ? `✓ Custom CSS for ${check.host} removed.`
        : `✓ Custom CSS for ${check.host} saved.`
    );
  }

  textArea.addEventListener("input", updateCounter);
  saveBtn.addEventListener("click", save);
  hostInput.addEventListener("change", () => {
    const host = T.canSaveCss(hostInput.value, "").host;
    if (host && textArea.value === "") loadHost(host);
  });
  window.addEventListener("hashchange", applyHash);

  updateCounter();
  await renderList();
  await applyHash();
}
