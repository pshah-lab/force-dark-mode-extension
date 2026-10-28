// The private owner dashboard page (served by api/darkmode-dashboard.js). One self-contained document:
// no external scripts, fonts or images (CSP default-src 'none'), charts drawn on <canvas>, every value
// inserted with textContent. The token is typed in, kept in a JS variable only and sent as a bearer header.
export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Usage dashboard</title>
<style>
:root{color-scheme:dark;--bg:#0f1115;--card:#171a21;--line:#2d3340;--text:#e8eaed;--muted:#9aa0a6;--a:#8ab4f8;--b:#4caf50;--c:#f2b84b;--d:#e06c75}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f6f7f9;--card:#fff;--line:#d9dde3;--text:#1c2024;--muted:#5f6670;--a:#1a5fd0;--b:#1e8a3e;--c:#b27300;--d:#c0392b}}
*{box-sizing:border-box}
body{margin:0;padding:16px;background:var(--bg);color:var(--text);font:14px/1.4 system-ui,-apple-system,sans-serif}
main{max-width:1000px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:0 0 8px}
.sub{color:var(--muted);font-size:12px;margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:12px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:12px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.tile b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.tile span{color:var(--muted);font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
canvas{width:100%;height:220px;display:block}
.row{display:grid;grid-template-columns:90px 1fr 44px;gap:8px;align-items:center;font-size:12px;margin:3px 0}
.row .bar{height:10px;border-radius:5px;background:var(--a)}.row i{font-style:normal;color:var(--muted);text-align:right}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}
form{display:flex;gap:8px;flex-wrap:wrap}input{flex:1;min-width:220px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);font:inherit}
button{padding:8px 14px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--text);font:inherit;cursor:pointer}
.legend{font-size:12px;color:var(--muted);margin-top:6px}.legend span{margin-right:12px}
.err{color:var(--d);font-size:13px;margin:8px 0 0}[hidden]{display:none}
</style>
</head>
<body>
<main>
<h1>Usage dashboard</h1>
<p class="sub" id="sub">Private. Counts only; refreshed nightly.</p>
<div class="card" id="login">
<form id="form"><input id="token" type="password" autocomplete="off" placeholder="Dashboard token" aria-label="Dashboard token"><button type="submit">Open</button></form>
<p class="err" id="err" role="alert" hidden></p>
</div>
<div id="view" hidden>
<div class="tiles" id="tiles"></div>
<div class="card"><h2>Active and new installs per day (last 90 days)</h2><canvas id="c-active" aria-label="Active and new installs per day"></canvas>
<div class="legend"><span style="color:var(--a)">&#9632; active</span><span style="color:var(--b)">&#9632; new</span></div></div>
<div class="card"><h2>Sites darkened per install (daily, last 30 days)</h2><canvas id="c-sites" aria-label="Sites darkened buckets per day"></canvas>
<div class="legend"><span style="color:var(--muted)">&#9632; 0</span><span style="color:var(--a)">&#9632; 1-5</span><span style="color:var(--b)">&#9632; 6-20</span><span style="color:var(--c)">&#9632; 21+</span></div></div>
<div class="grid" id="dists"></div>
<div class="card"><h2>Most reported broken sites (last 30 days)</h2><table><thead><tr><th>Site</th><th>Reports</th><th>Days</th><th>Last</th></tr></thead><tbody id="top"></tbody></table></div>
</div>
</main>
<script>
(function(){
var token = "", cached = null;
var $ = function(id){ return document.getElementById(id); };
function el(tag, text, cls){ var e = document.createElement(tag); if (text !== undefined) e.textContent = String(text); if (cls) e.className = cls; return e; }
function css(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function sum(a){ return a.reduce(function(x, y){ return x + y; }, 0); }

function line(canvas, days, series){
  var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  var g = canvas.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  var max = 1; series.forEach(function(s){ s.v.forEach(function(v){ if (v > max) max = v; }); });
  var L = 36, B = 20, T = 6, R = 6, n = Math.max(days.length - 1, 1);
  g.strokeStyle = css("--line"); g.fillStyle = css("--muted"); g.font = "11px system-ui"; g.lineWidth = 1;
  [0, 0.5, 1].forEach(function(f){ var y = T + (h - T - B) * (1 - f); g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.fillText(Math.round(max * f), 2, y + 4); });
  if (days.length) { g.fillText(days[0].slice(5), L, h - 5); var e = days[days.length - 1].slice(5); g.fillText(e, w - R - g.measureText(e).width, h - 5); }
  series.forEach(function(s){
    g.strokeStyle = css(s.c); g.lineWidth = 2; g.beginPath();
    s.v.forEach(function(v, i){ var x = L + (w - L - R) * i / n, y = T + (h - T - B) * (1 - v / max); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  });
}

function stacked(canvas, days, keys, colors){
  var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  var g = canvas.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  var L = 6, B = 20, T = 6, bw = (w - L * 2) / Math.max(days.length, 1);
  g.fillStyle = css("--muted"); g.font = "11px system-ui";
  days.forEach(function(d, i){
    var tot = sum(keys.map(function(k){ return d.sites[k]; })); if (!tot) return;
    var y = h - B;
    keys.forEach(function(k, j){ var hh = (h - T - B) * d.sites[k] / tot; y -= hh; g.fillStyle = css(colors[j]); g.fillRect(L + i * bw + 1, y, Math.max(bw - 2, 1), hh); });
  });
  g.fillStyle = css("--muted");
  if (days.length) { g.fillText(days[0].day.slice(5), L, h - 5); var e = days[days.length - 1].day.slice(5); g.fillText(e, w - L - g.measureText(e).width, h - 5); }
}

function dist(title, map){
  var card = el("div", undefined, "card"); card.appendChild(el("h2", title));
  var rows = Object.keys(map).map(function(k){ return [k, map[k]]; }).sort(function(a, b){ return b[1] - a[1]; }).slice(0, 12);
  if (!rows.length) { card.appendChild(el("p", "No data yet.", "sub")); return card; }
  var total = sum(rows.map(function(r){ return r[1]; })) || 1, top = rows[0][1] || 1;
  rows.forEach(function(r){
    var row = el("div", undefined, "row"), bar = el("div", undefined, "bar");
    bar.style.width = Math.max(2, 100 * r[1] / top) + "%";
    var wrap = el("div"); wrap.appendChild(bar);
    row.appendChild(el("span", r[0])); row.appendChild(wrap); row.appendChild(el("i", Math.round(100 * r[1] / total) + "%"));
    card.appendChild(row);
  });
  return card;
}

function lastWith(days, key){ for (var i = days.length - 1; i >= 0; i--) if (Object.keys(days[i][key]).length) return days[i][key]; return {}; }

function render(doc){
  var days = doc.days, last = days[days.length - 1];
  $("view").hidden = false; // canvases measure 0 wide while hidden, so show the view before drawing
  $("sub").textContent = "Private. Counts only; updated " + doc.generatedAt.replace("T", " ").replace("Z", " UTC") + ".";
  var tiles = $("tiles"); tiles.textContent = "";
  var week = days.slice(-7), month = days.slice(-30);
  [["Active yesterday", last ? last.active : 0], ["Avg active, 7 days", week.length ? Math.round(sum(week.map(function(d){ return d.active; })) / week.length) : 0],
   ["New installs, 7 days", sum(week.map(function(d){ return d.newInstalls; }))], ["Broken-site reports, 30 days", sum(month.map(function(d){ return d.siteReports; }))]
  ].forEach(function(t){ var d = el("div", undefined, "tile"); d.appendChild(el("b", t[1])); d.appendChild(el("span", t[0])); tiles.appendChild(d); });
  var d90 = days.slice(-90);
  line($("c-active"), d90.map(function(d){ return d.day; }), [{ v: d90.map(function(d){ return d.active; }), c: "--a" }, { v: d90.map(function(d){ return d.newInstalls; }), c: "--b" }]);
  stacked($("c-sites"), days.slice(-30), ["s0", "s1_5", "s6_20", "s21p"], ["--muted", "--a", "--b", "--c"]);
  var dists = $("dists"); dists.textContent = "";
  dists.appendChild(dist("Versions (latest day)", last ? last.versions : {}));
  dists.appendChild(dist("Engines (latest day)", last ? last.engines : {}));
  dists.appendChild(dist("Themes (latest with data)", lastWith(days, "themes")));
  dists.appendChild(dist("OS (latest with data)", lastWith(days, "os")));
  dists.appendChild(dist("Chrome (latest with data)", lastWith(days, "chrome")));
  dists.appendChild(dist("Language (latest with data)", lastWith(days, "lang")));
  var top = $("top"); top.textContent = "";
  if (!doc.topSites.length) { var tr0 = el("tr"); var td0 = el("td", "No reports yet."); td0.colSpan = 4; tr0.appendChild(td0); top.appendChild(tr0); }
  doc.topSites.forEach(function(s){ var tr = el("tr"); [s.site, s.reports, s.days, s.lastDay].forEach(function(v){ tr.appendChild(el("td", v)); }); top.appendChild(tr); });
}

function load(){
  var err = $("err"); err.hidden = true;
  return fetch("/api/darkmode-dashboard-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token }), cache: "no-store" }).then(function(r){
    if (r.status === 401) throw new Error("Wrong token.");
    if (r.status === 503) throw new Error("Dashboard token is not configured on the server.");
    if (!r.ok) throw new Error("Could not load data (" + r.status + ").");
    return r.json();
  }).then(function(doc){ cached = doc; $("login").hidden = true; render(doc); }).catch(function(e){ err.textContent = e.message; err.hidden = false; });
}

$("form").addEventListener("submit", function(ev){ ev.preventDefault(); token = $("token").value.trim(); $("token").value = ""; if (token) load(); });
window.addEventListener("resize", function(){ if (cached) render(cached); });
})();
</script>
</body>
</html>
`;
