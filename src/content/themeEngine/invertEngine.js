const INVERT_STYLE_ID = "__force_dark_invert__";

function enableInvert() {
  if (document.getElementById(INVERT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = INVERT_STYLE_ID;
  style.textContent = `
    :root {
      color-scheme: dark !important;
    }

    html {
      background-color: #121212 !important;
      filter: invert(0.92) hue-rotate(180deg) !important;
    }

    img,
    video,
    canvas,
    picture,
    embed,
    object,
    [style*="background-image"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* Prevent double inversion on media nested inside picture or video */
    picture img,
    picture video,
    video img {
      filter: none !important;
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}

function disableInvert() {
  document.getElementById(INVERT_STYLE_ID)?.remove();
}
