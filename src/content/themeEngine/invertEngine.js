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
      filter: invert(0.92) hue-rotate(180deg) brightness(var(--force-dark-brightness, 100%)) contrast(var(--force-dark-contrast, 100%)) sepia(var(--force-dark-sepia, 0%)) !important;
    }

    /*
     * Known limitation: this unconditionally re-inverts every image/canvas
     * regardless of whether the site already inverted it itself (e.g. an
     * icon with a Tailwind "dark:invert" class driven by the real system
     * prefers-color-scheme). On those sites this double-inverts the icon
     * back to its original (now-invisible) color. See README's Theme
     * Engines section. No general fix without risking the common case this
     * rule exists for: un-inverting ordinary images on the vast majority
     * of sites that don't do their own conditional icon inversion.
     */
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
