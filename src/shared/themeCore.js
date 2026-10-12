(function (global) {
  const LIMITS = Object.freeze({
    MAX_USER_THEMES: 20,
    MAX_NAME: 40,
    MAX_IMAGE_DIM: 60,
    MAX_IMPORT_BYTES: 16384,
    MAX_CSS_CHARS: 6000,
    MAX_CSS_SITES: 30,
  });

  const THEME_ID_PATTERN = /^(?:user|builtin):[a-z0-9-]{1,40}$/;
  const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
  const OPTIONAL_COLORS = ["surface", "text", "muted", "link", "border"];
  const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];

  function utils() {
    return global.ForceDarkColorUtils;
  }

  function hasForbiddenKey(value, depth) {
    if (value === null || typeof value !== "object") return false;
    if (depth > 8) return true;
    for (const key of Object.getOwnPropertyNames(value)) {
      if (FORBIDDEN_KEYS.includes(key)) return true;
      if (hasForbiddenKey(value[key], depth + 1)) return true;
    }
    return false;
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function fail(error) {
    return { ok: false, error };
  }

  function validateTheme(input) {
    if (!isPlainObject(input)) return fail("Theme must be an object.");
    if (hasForbiddenKey(input, 0)) return fail("Theme contains a forbidden key.");

    if (typeof input.id !== "string" || !THEME_ID_PATTERN.test(input.id)) {
      return fail("Theme id is invalid.");
    }

    if (typeof input.name !== "string") return fail("Theme name is required.");
    const name = input.name.trim();
    if (name.length < 1 || name.length > LIMITS.MAX_NAME) {
      return fail(`Theme name must be 1 to ${LIMITS.MAX_NAME} characters.`);
    }
    if (/[<>]/.test(name)) return fail("Theme name cannot contain < or >.");

    if (!isPlainObject(input.colors)) return fail("Theme colors are required.");
    const src = input.colors;
    if (typeof src.background !== "string" || !HEX_PATTERN.test(src.background)) {
      return fail("Background color must be a #rrggbb hex value.");
    }
    const colors = { background: src.background.toLowerCase() };
    for (const key of OPTIONAL_COLORS) {
      const value = src[key];
      if (value === undefined) continue;
      if (typeof value !== "string" || !HEX_PATTERN.test(value)) {
        return fail(`The ${key} color must be a #rrggbb hex value.`);
      }
      colors[key] = value.toLowerCase();
    }

    let imageDim = 0;
    if (input.imageDim !== undefined) {
      imageDim = input.imageDim;
      if (!Number.isInteger(imageDim) || imageDim < 0 || imageDim > LIMITS.MAX_IMAGE_DIM) {
        return fail(`Image dimming must be a whole number from 0 to ${LIMITS.MAX_IMAGE_DIM}.`);
      }
    }

    return { ok: true, theme: { id: input.id, name, colors, imageDim } };
  }

  // Same maths as applyCustomPalette in cssOverrideEngine.js.
  function derivePalette(background) {
    const { normalizeHexColor, hexToRgb, getLuminance, mixColors } = utils();
    const base = normalizeHexColor(background) || "#0f1115";
    const baseRgb = hexToRgb(base);
    const isLight = getLuminance(baseRgb) > 0.5;
    const target = isLight ? "#000000" : "#ffffff";
    return {
      bg: base,
      surface: mixColors(baseRgb, target, isLight ? 0.06 : 0.08),
      surfaceSoft: mixColors(baseRgb, target, isLight ? 0.1 : 0.14),
      elevated: mixColors(baseRgb, target, isLight ? 0.14 : 0.22),
      text: isLight ? "#14171c" : "#e8eaed",
      muted: isLight ? "#4d5663" : "#b8bec7",
      border: mixColors(baseRgb, target, isLight ? 0.25 : 0.2),
      link: isLight ? "#174ea6" : "#8ab4f8",
      input: mixColors(baseRgb, target, isLight ? 0.04 : 0.05),
      selection: mixColors(baseRgb, isLight ? "#174ea6" : "#8ab4f8", 0.35),
    };
  }

  function paletteFromTheme(theme) {
    const colors = (theme && theme.colors) || {};
    const palette = derivePalette(colors.background);
    for (const key of OPTIONAL_COLORS) {
      if (typeof colors[key] === "string" && HEX_PATTERN.test(colors[key])) {
        palette[key] = colors[key].toLowerCase();
      }
    }
    return palette;
  }

  const BLOCK_BELOW = 3;
  const WARN_BELOW = 4.5;

  function contrastIssues(theme) {
    const { hexToRgb, getContrastRatio } = utils();
    const palette = paletteFromTheme(theme);
    const bg = hexToRgb(palette.bg);
    let level = "ok";
    const messages = [];

    for (const [label, key] of [["Text", "text"], ["Link", "link"]]) {
      const ratio = getContrastRatio(hexToRgb(palette[key]), bg);
      const shown = (Math.round(ratio * 10) / 10).toFixed(1);
      if (ratio < BLOCK_BELOW) {
        level = "block";
        messages.push(`${label} contrast is ${shown}:1, too low to read. It needs at least ${BLOCK_BELOW}:1.`);
      } else if (ratio < WARN_BELOW) {
        if (level === "ok") level = "warn";
        messages.push(`${label} contrast is ${shown}:1. ${WARN_BELOW}:1 or more is easier to read.`);
      }
    }

    return { level, messages };
  }

  // Looks a theme id up among the user's themes, then the built-ins. Never throws.
  function findTheme(id, userThemes) {
    if (typeof id !== "string" || !THEME_ID_PATTERN.test(id)) return null;
    if (id.startsWith("user:")) {
      if (!Array.isArray(userThemes)) return null;
      for (const candidate of userThemes) {
        if (!isPlainObject(candidate) || candidate.id !== id) continue;
        const checked = validateTheme(candidate);
        return checked.ok ? { theme: checked.theme, source: "user" } : null;
      }
      return null;
    }
    const lookup = global.ForceDarkThemes && global.ForceDarkThemes.getBuiltinTheme;
    const theme = typeof lookup === "function" ? lookup(id) : null;
    return theme ? { theme, source: "builtin" } : null;
  }

  // Decides which theme a site gets: its own choice, else a site pack's, else none.
  function resolveTheme(args) {
    const { config, host, userThemes } = args || {};
    const themeId = config && typeof config.themeId === "string" ? config.themeId : "";
    const finder = global.ForceDarkThemes && global.ForceDarkThemes.findSitePack;
    const pack = (typeof finder === "function" ? finder(host) : null) || null;

    if (themeId === "default") return { theme: null, source: "default", pack };

    const chosen = themeId ? findTheme(themeId, userThemes) : null;
    if (chosen) return { theme: chosen.theme, source: chosen.source, pack };

    const fromPack = pack ? findTheme(pack.themeId, userThemes) : null;
    if (fromPack) return { theme: fromPack.theme, source: "pack", pack };

    return { theme: null, source: "default", pack };
  }

  // Options for the popup theme dropdown. Labels are plain text; callers must use textContent.
  function buildThemeOptions(userThemes, pack) {
    const packName = pack && typeof pack.name === "string" && pack.name ? pack.name : "";
    const options = [
      { value: "", label: packName ? `Automatic (${packName} theme)` : "Automatic", group: "" },
      { value: "default", label: "Default colour", group: "" },
    ];
    const lister = global.ForceDarkThemes && global.ForceDarkThemes.getBuiltinThemes;
    const builtins = typeof lister === "function" ? lister() : [];
    for (const theme of builtins) {
      options.push({ value: theme.id, label: theme.name, group: "Built-in" });
    }
    if (Array.isArray(userThemes)) {
      let count = 0;
      for (const theme of userThemes) {
        if (count >= LIMITS.MAX_USER_THEMES) break;
        if (!isPlainObject(theme)) continue;
        if (typeof theme.id !== "string" || !/^user:[a-z0-9-]{1,40}$/.test(theme.id)) continue;
        if (typeof theme.name !== "string") continue;
        const label = theme.name.trim().slice(0, LIMITS.MAX_NAME);
        if (!label) continue;
        options.push({ value: theme.id, label, group: "My themes" });
        count++;
      }
    }
    return options;
  }

  global.ForceDarkThemes = Object.assign(global.ForceDarkThemes || {}, {
    LIMITS,
    THEME_ID_PATTERN,
    validateTheme,
    derivePalette,
    paletteFromTheme,
    contrastIssues,
    resolveTheme,
    buildThemeOptions,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
