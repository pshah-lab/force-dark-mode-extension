/*
 * Fills every [data-user-count="total|weekly"] element with the matching figure from
 * users.json, the one place the numbers are edited by hand. The text already in the HTML is
 * the fallback, so a failed or malformed response leaves the page unchanged. textContent only.
 */
(function () {
  "use strict";
  var nodes = document.querySelectorAll("[data-user-count]");
  if (!nodes.length || typeof fetch !== "function") return;

  var LABEL = /^[0-9][0-9,.]*[kK]?\+?$/;
  var FIELDS = { total: "totalLabel", weekly: "weeklyLabel" };

  fetch("users.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      nodes.forEach(function (n) {
        var label = d[FIELDS[n.getAttribute("data-user-count")]];
        if (typeof label === "string" && LABEL.test(label)) n.textContent = label;
      });
    })
    .catch(function () {});
})();
