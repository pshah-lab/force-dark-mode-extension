const INVERT_STYLE_ID = "__force_dark_invert__";

function enableInvert() {
  if (document.getElementById(INVERT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = INVERT_STYLE_ID;
  style.textContent = `
    html {
      filter: invert(1) hue-rotate(180deg);
      background: #111 !important;
    }

    img, video, picture, iframe, canvas {
      filter: invert(1) hue-rotate(180deg) !important;
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}

function disableInvert() {
  document.getElementById(INVERT_STYLE_ID)?.remove();
}