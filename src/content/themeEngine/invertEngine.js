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
    }

    body {
      background-color: #ffffff !important;
      filter: invert(1) hue-rotate(180deg) !important;
    }

    body * {
      border-color: #d7d7d7 !important;
    }

    img,
    video,
    picture,
    iframe,
    canvas,
    embed,
    object,
    svg,
    [style*="background-image"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* Prevent double inversion on media nested inside picture or media containers */
    picture img,
    picture svg,
    picture video {
      filter: none !important;
    }

    iframe {
      background-color: #ffffff !important;
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}

function disableInvert() {
  document.getElementById(INVERT_STYLE_ID)?.remove();
}
