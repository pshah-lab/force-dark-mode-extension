/*
 * Microsoft Clarity for this website only (never the extension). Clarity loads only after the visitor
 * clicks Accept; the choice is remembered in localStorage. Skipped on non-production hosts and when
 * Do Not Track is on, like the visit counter in main.js.
 */
(function () {
  const CLARITY_ID = "z20ivno2wb";
  const KEY = "clarityConsent";

  if (location.hostname !== "darkmode.pshah.fun" || navigator.doNotTrack === "1") return;

  const read = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };
  const write = (value) => {
    try { localStorage.setItem(KEY, value); } catch { /* choice just won't persist */ }
  };

  function loadClarity() {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CLARITY_ID);
  }

  function showBanner() {
    const bar = document.createElement("div");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Analytics consent");
    bar.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;max-width:560px;margin:0 auto;z-index:2147483647;" +
      "background:#1b1b1f;color:#f2f2f5;border:1px solid #3a3a42;border-radius:12px;padding:14px 16px;" +
      "font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35)";
    const text = document.createElement("p");
    text.style.cssText = "margin:0 0 10px";
    text.append("Allow Microsoft Clarity to record anonymous visits to this website (not the extension) so we can improve the pages? ");
    const link = document.createElement("a");
    link.href = (location.pathname.includes("/blog/") ? "../" : "") + "privacy.html";
    link.textContent = "Privacy";
    link.style.color = "#9ec5ff";
    text.append(link);

    const button = (label, primary, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "cursor:pointer;border-radius:8px;padding:7px 14px;font:inherit;margin-right:8px;" +
        (primary ? "background:#9ec5ff;color:#101014;border:1px solid #9ec5ff" : "background:transparent;color:#f2f2f5;border:1px solid #5a5a66");
      b.addEventListener("click", onClick);
      return b;
    };
    bar.append(
      text,
      button("Accept", true, () => { write("granted"); bar.remove(); loadClarity(); }),
      button("Decline", false, () => { write("denied"); bar.remove(); })
    );
    document.body.append(bar);
  }

  const choice = read();
  if (choice === "granted") loadClarity();
  else if (choice !== "denied") showBanner();
})();
