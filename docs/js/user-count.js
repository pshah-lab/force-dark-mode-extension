/*
 * Fills every [data-user-count] element with the figure from users.json, the one place the
 * number is edited by hand. The text already in the HTML is the fallback, so a failed or
 * malformed response leaves the page unchanged. Written with textContent only.
 */
(function () {
  "use strict";
  var nodes = document.querySelectorAll("[data-user-count]");
  if (!nodes.length || typeof fetch !== "function") return;

  fetch("users.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || typeof d.label !== "string" || !/^[0-9][0-9,.]*[kK]?\+?$/.test(d.label)) return;
      nodes.forEach(function (n) { n.textContent = d.label; });
    })
    .catch(function () {});
})();
