/*
 * Public usage statistics page. Makes one GET to the developer's own aggregate endpoint and
 * draws the result. Everything is written with textContent / createElement / createElementNS:
 * no HTML strings are ever parsed, so hostile keys or values are only ever inert text.
 */
(function () {
  "use strict";

  var STATS_URL = "https://pshah.fun/api/darkmode-stats";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var FEWER = "fewer than 10";
  var HIDDEN = "hidden to protect privacy";
  var UNAVAILABLE = "Statistics are temporarily unavailable. Please try again later.";

  var isObj = function (v) { return v !== null && typeof v === "object" && !Array.isArray(v); };
  var isNum = function (v) { return typeof v === "number" && isFinite(v); };
  var isCountOrNull = function (v) { return v === null || isNum(v); };

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = String(txt);
    return n;
  }

  function fmtCount(n) { return n === null ? FEWER : String(Math.round(n)); }
  function fmtShare(p) { return p === null ? FEWER : String(clampPct(p)) + "%"; }
  function clampPct(p) {
    var n = Math.round(Number(p));
    if (!isFinite(n)) return 0;
    return Math.min(100, Math.max(0, n));
  }

  // Basic shape check; the server validates strictly, this only protects the renderer.
  function looksValid(doc) {
    if (!isObj(doc) || !isObj(doc.active)) return false;
    var a = doc.active;
    if (!Array.isArray(a.dau) || !isCountOrNull(a.wau) || !isCountOrNull(a.mau)) return false;
    for (var i = 0; i < a.dau.length; i++) {
      if (!isObj(a.dau[i]) || !isCountOrNull(a.dau[i].count)) return false;
    }
    var maps = ["retention", "engines", "themes", "features", "os", "chrome", "lang"];
    for (var m = 0; m < maps.length; m++) {
      var v = doc[maps[m]];
      if (v === undefined) return false;
      if (v === null) continue;
      if (!isObj(v)) return false;
      var keys = Object.keys(v);
      for (var k = 0; k < keys.length; k++) if (!isCountOrNull(v[keys[k]])) return false;
    }
    var nr = doc.newVsReturning;
    if (nr === undefined) return false;
    if (nr !== null) {
      if (!isObj(nr) || !Array.isArray(nr.weeks)) return false;
      for (var w = 0; w < nr.weeks.length; w++) {
        var wk = nr.weeks[w];
        if (!isObj(wk) || !isCountOrNull(wk.new) || !isCountOrNull(wk.returning)) return false;
      }
    }
    return true;
  }

  function section(root, title, note) {
    var s = el("section", "stats-section content-card");
    s.appendChild(el("h2", "", title));
    if (note) s.appendChild(el("p", "stats-note", note));
    root.appendChild(s);
    return s;
  }

  function bars(parent, map, labels, hiddenText) {
    if (map === null) {
      parent.appendChild(el("p", "stats-empty", "Not enough data yet"));
      return;
    }
    var list = el("ul", "stats-bars");
    var keys = Object.keys(map);
    keys.sort(function (a, b) {
      var x = map[a] === null ? -1 : map[a];
      var y = map[b] === null ? -1 : map[b];
      return y - x;
    });
    keys.forEach(function (key) {
      var p = map[key];
      var row = el("li", "stats-bar-row");
      row.appendChild(el("span", "stats-bar-label", labels && Object.prototype.hasOwnProperty.call(labels, key) && labels[key] ? labels[key] : key));
      var track = el("span", "stats-bar-track");
      var fill = el("span", "stats-bar-fill");
      fill.style.width = (p === null ? 0 : clampPct(p)) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("span", "stats-bar-value", p === null && hiddenText ? hiddenText : fmtShare(p)));
      list.appendChild(row);
    });
    parent.appendChild(list);
  }

  function trendChart(parent, dau) {
    var W = 600, H = 140, PAD = 8;
    var segs = [];
    var cur = [];
    var npts = 0;
    var max = 1;
    dau.forEach(function (d) { if (d.count !== null && d.count > max) max = d.count; });
    var step = dau.length > 1 ? (W - 2 * PAD) / (dau.length - 1) : 0;
    dau.forEach(function (d, i) {
      if (d.count === null) { if (cur.length) segs.push(cur); cur = []; return; }
      var x = PAD + i * step;
      var y = H - PAD - (d.count / max) * (H - 2 * PAD);
      cur.push(x.toFixed(1) + "," + y.toFixed(1));
      npts++;
    });
    if (cur.length) segs.push(cur);
    if (npts < 2) {
      parent.appendChild(el("p", "stats-empty", "Not enough daily data to draw a trend yet"));
      return;
    }
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("class", "stats-trend");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Daily active installs over the last 30 days, peaking at " + max);
    segs.forEach(function (seg) {
      if (seg.length < 2) {
        var xy = seg[0].split(",");
        var dot = document.createElementNS(SVG_NS, "circle");
        dot.setAttribute("cx", xy[0]);
        dot.setAttribute("cy", xy[1]);
        dot.setAttribute("r", "2");
        dot.setAttribute("fill", "currentColor");
        svg.appendChild(dot);
        return;
      }
      var line = document.createElementNS(SVG_NS, "polyline");
      line.setAttribute("points", seg.join(" "));
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "2");
      svg.appendChild(line);
    });
    parent.appendChild(svg);
    parent.appendChild(el("p", "stats-note", "Days with fewer than 10 active installs are left out of the line."));
  }

  var FIXED_LABELS = {
    engines: { auto: "Auto", css: "CSS override", invert: "Invert" },
    features: { viewer: "Document viewer", editor: "Theme editor", customCss: "Custom CSS", sitePack: "Site packs" },
    themes: { "builtin:midnight": "Midnight", "builtin:oled": "OLED Black", "builtin:dracula": "Dracula", "builtin:nord": "Nord", "builtin:solarized": "Solarized Dark", "builtin:contrast": "High Contrast", "builtin:dim": "Dim", "builtin:sepia": "Sepia Dark", custom: "Custom", other: "Other" },
    retention: { d1: "Back after 1 day", d7: "Back after 7 days", d30: "Back after 30 days" },
    os: { mac: "macOS", windows: "Windows", linux: "Linux", chromeos: "ChromeOS", other: "Other" },
  };

  function renderStats(doc, root) {
    try {
      root.replaceChildren();
      if (!looksValid(doc)) {
        root.appendChild(el("p", "stats-unavailable", UNAVAILABLE));
        return;
      }
      var a = doc.active;
      var s = section(root, "Active installs", "Installs that reported at least once in the last 30 days.");
      var grid = el("div", "stats-figures");
      [["Monthly (30 days)", a.mau], ["Weekly (7 days)", a.wau]].forEach(function (f) {
        var box = el("div", "stats-figure");
        box.appendChild(el("span", "stats-figure-value", fmtCount(f[1])));
        box.appendChild(el("span", "stats-figure-label", f[0]));
        grid.appendChild(box);
      });
      s.appendChild(grid);

      if (a.mau === null) {
        s.appendChild(el("p", "stats-empty", "Not enough data yet"));
        return;
      }
      trendChart(s, a.dau);

      if (doc.newVsReturning !== null) {
        var nr = section(root, "New and returning installs", "Per week, starting on the Monday shown. A week is hidden when either number is under 10.");
        if (doc.newVsReturning.weeks.length === 0) nr.appendChild(el("p", "stats-empty", "Not enough data yet"));
        var ul = el("ul", "stats-weeks");
        doc.newVsReturning.weeks.forEach(function (w) {
          ul.appendChild(el("li", "", String(w.weekStart) + ": " + (w.new === null || w.returning === null ? HIDDEN : fmtCount(w.new) + " new, " + fmtCount(w.returning) + " returning")));
        });
        nr.appendChild(ul);
      }

      var plan = [
        ["retention", "Retention", "Share of recent new installs that came back. A retention figure of 0% or 100% means none or all of a small group returned."],
        ["engines", "Theme engines", "Share of active installs using each engine. Hidden when fewer than 10 installs used the item, or fewer than 10 did not."],
        ["themes", "Themes", "Share of active installs by theme."],
        ["features", "Features", "Share of active installs that used each feature. Hidden when fewer than 10 installs used the item, or fewer than 10 did not."],
        ["os", "Operating system", null],
        ["chrome", "Chrome version", null],
        ["lang", "Interface language", null],
      ];
      plan.forEach(function (p) {
        var sec = section(root, p[1], p[2]);
        bars(sec, doc[p[0]], FIXED_LABELS[p[0]], p[0] === "engines" || p[0] === "features" ? HIDDEN : null);
      });

      root.appendChild(el("p", "stats-updated", "Generated " + String(doc.generatedAt)));
    } catch (e) {
      try {
        root.replaceChildren();
        root.appendChild(el("p", "stats-unavailable", UNAVAILABLE));
      } catch (_) { /* nothing more to do */ }
    }
  }

  function renderUnavailable(root) {
    try {
      root.replaceChildren();
      root.appendChild(el("p", "stats-unavailable", UNAVAILABLE));
    } catch (_) { /* ignore */ }
  }

  // One GET, credentials omitted, no referrer. Never throws.
  function load(root, fetchImpl) {
    var f = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!f) { renderUnavailable(root); return Promise.resolve(); }
    var req;
    try {
      req = f(STATS_URL, { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
    } catch (e) {
      renderUnavailable(root);
      return Promise.resolve();
    }
    return Promise.resolve(req)
      .then(function (res) {
        if (!res || res.status !== 200) throw new Error("bad status");
        return res.json();
      })
      .then(function (doc) { renderStats(doc, root); })
      .catch(function () { renderUnavailable(root); });
  }

  var api = { renderStats: renderStats, renderUnavailable: renderUnavailable, load: load };
  if (typeof window !== "undefined") window.FdmStats = api;

  if (typeof document !== "undefined" && document.getElementById) {
    var start = function () {
      var root = document.getElementById("stats-root");
      if (root) load(root);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})();
