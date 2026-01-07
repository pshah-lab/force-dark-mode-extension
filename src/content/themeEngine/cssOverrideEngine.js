const STYLE_ID = "__force_dark_mode__";

function enableDarkMode() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html, body {
      background-color: #121212 !important;
      color: #e0e0e0 !important;
    }
  `;
  const target = document.head || document.documentElement;
  target.appendChild(style);
}

function disableDarkMode() {
  document.getElementById(STYLE_ID)?.remove();
}