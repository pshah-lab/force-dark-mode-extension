(function (global) {
  const LIMITS = Object.freeze({
    MAX_USER_THEMES: 20,
    MAX_NAME: 40,
    MAX_IMAGE_DIM: 60,
    MAX_IMPORT_BYTES: 16384,
    MAX_CSS_CHARS: 6000,
    MAX_CSS_SITES: 30,
    // All sites' custom CSS together, so it can never fill the 102,400-byte sync quota.
    MAX_CSS_TOTAL_CHARS: 40000,
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

  const DEFAULT_BACKGROUND = "#0f1115";

  function hasCustomBackground(config) {
    const bg = config && config.backgroundColor;
    return typeof bg === "string" && HEX_PATTERN.test(bg) && bg.toLowerCase() !== DEFAULT_BACKGROUND;
  }

  // Decides which theme a site gets: its own choice, else none when a non-default colour is
  // saved, else a site pack's, else none.
  function resolveTheme(args) {
    const { config, host, userThemes } = args || {};
    const themeId = config && typeof config.themeId === "string" ? config.themeId : "";
    const finder = global.ForceDarkThemes && global.ForceDarkThemes.findSitePack;
    const pack = (typeof finder === "function" ? finder(host) : null) || null;

    if (themeId === "default") return { theme: null, source: "default", pack };

    const chosen = themeId ? findTheme(themeId, userThemes) : null;
    if (chosen) return { theme: chosen.theme, source: chosen.source, pack };

    // No theme chosen but a saved background colour other than the default: that colour
    // wins over the pack theme (the pack's fixes still apply), so 1.x colours keep working.
    if (!themeId && hasCustomBackground(config)) return { theme: null, source: "default", pack };

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

  // Turns the editor's form fields into a theme without an id. Pure and forgiving: validateTheme decides validity.
  function themeFromForm(formState) {
    const form = isPlainObject(formState) ? formState : {};
    const src = isPlainObject(form.colors) ? form.colors : {};
    const colors = {};
    for (const key of ["background"].concat(OPTIONAL_COLORS)) {
      const value = typeof src[key] === "string" ? src[key].trim().toLowerCase() : "";
      if (value) colors[key] = value;
    }
    const dim = Math.round(Number(form.imageDim));
    const imageDim = Number.isFinite(dim) ? Math.min(LIMITS.MAX_IMAGE_DIM, Math.max(0, dim)) : 0;
    const name = typeof form.name === "string" ? form.name.trim() : "";
    return { name, colors, imageDim };
  }

  function freshUserId() {
    let rand = "";
    const c = global.crypto;
    if (c && typeof c.getRandomValues === "function") {
      const bytes = c.getRandomValues(new Uint8Array(6));
      for (const b of bytes) rand += b.toString(16).padStart(2, "0");
    } else {
      rand = Math.random().toString(16).slice(2, 14).padEnd(12, "0");
    }
    return `user:${Date.now().toString(36)}-${rand}`;
  }

  // Parses one exported theme file. The id in the file is never trusted: a fresh user: id is always assigned.
  function importThemeFile(text) {
    if (typeof text !== "string") return fail("The file could not be read.");
    if (text.length > LIMITS.MAX_IMPORT_BYTES) {
      return fail(`The file is too large. Theme files must be under ${LIMITS.MAX_IMPORT_BYTES} bytes.`);
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail("The file is not valid JSON.");
    }
    if (!isPlainObject(parsed)) return fail("The file does not contain a theme.");
    if (hasForbiddenKey(parsed, 0)) return fail("Theme contains a forbidden key.");
    const checked = validateTheme(Object.assign({}, parsed, { id: freshUserId() }));
    if (!checked.ok) return checked;
    return { ok: true, theme: checked.theme };
  }

  function withSuffix(name, suffix) {
    const base = (typeof name === "string" ? name : "").trim().slice(0, LIMITS.MAX_NAME - suffix.length - 1).trim();
    return base ? `${base} ${suffix}` : suffix;
  }
  // "X" -> "X copy" -> "X copy 2" -> "X copy 3"... The root is truncated, never the suffix.
  // The counter is read up to 4 digits (9999); beyond that a name is treated as a plain root.
  function duplicateName(name) {
    const trimmed = (typeof name === "string" ? name : "").trim();
    const match = /\s+copy(?:\s+(\d{1,4}))?$/.exec(trimmed);
    const root = match ? trimmed.slice(0, match.index) : trimmed;
    const suffix = match ? ` copy ${match[1] ? Number(match[1]) + 1 : 2}` : " copy";
    const room = Math.max(1, LIMITS.MAX_NAME - suffix.length);
    const base = root.slice(0, room).trim();
    return base ? base + suffix : suffix.trim();
  }
  function templateName(name) {
    return withSuffix(name, "custom");
  }

  function safeFileName(name) {
    const base = String(name === undefined || name === null ? "" : name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "");
    return `themeswitcher-theme-${base || "theme"}.json`;
  }

  // Save guard: a valid name and colours, and contrast not blocked.
  function canSaveTheme(theme) {
    const checked = validateTheme(Object.assign({}, theme, { id: "user:check" }));
    return checked.ok && contrastIssues(checked.theme).level !== "block";
  }

  function importFileTooLarge(file) {
    return !file || typeof file.size !== "number" || file.size > LIMITS.MAX_IMPORT_BYTES;
  }

  // ----- Custom CSS manager helpers (pure) -----
  const HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
  const CSS_KEY_PREFIX = "__css:";

  // A bare hostname as location.hostname reports it (lowercase letters, digits, dots,
  // hyphens, no empty labels), or the "local_files" token used for file URLs. Else "".
  function cleanCssHost(value) {
    if (typeof value !== "string") return "";
    const host = value.trim().toLowerCase();
    if (host.length === 0 || host.length > 253) return "";
    if (host === "local_files") return host;
    if (host === "constructor" || host === "prototype" || host === "__proto__") return "";
    return HOST_PATTERN.test(host) ? host : "";
  }

  function hostFromHash(hash) {
    if (typeof hash !== "string" || hash.slice(0, 5) !== "#css=") return "";
    let raw = hash.slice(5);
    try {
      raw = decodeURIComponent(raw);
    } catch {
      return "";
    }
    return cleanCssHost(raw);
  }

  // Combines host validity and the CSS sanitiser. Empty CSS is valid (it means delete).
  function canSaveCss(host, css) {
    const clean = cleanCssHost(host);
    if (!clean) return { ok: false, error: "Enter a site name such as example.com (no scheme, path or spaces)." };
    const text = typeof css === "string" ? css : "";
    if (text === "") return { ok: true, host: clean };
    const validate = global.ForceDarkThemes && global.ForceDarkThemes.validateCss;
    if (typeof validate !== "function") return { ok: false, error: "Custom CSS is not available yet." };
    const result = validate(text);
    if (!result || !result.ok) return { ok: false, error: (result && result.error) || "Custom CSS is invalid." };
    return { ok: true, host: clean };
  }

  // Sites that have saved custom CSS, from the raw storage map: [{host, length}] sorted by host.
  function cssSites(all) {
    const out = [];
    if (!all || typeof all !== "object") return out;
    for (const key of Object.keys(all)) {
      if (key.slice(0, CSS_KEY_PREFIX.length) !== CSS_KEY_PREFIX) continue;
      const host = key.slice(CSS_KEY_PREFIX.length);
      const value = all[key];
      if (typeof value !== "string" || value === "") continue;
      if (!cleanCssHost(host) || cleanCssHost(host) !== host) continue;
      out.push({ host, length: value.length });
    }
    return out.sort((a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  }

  global.ForceDarkThemes = Object.assign(global.ForceDarkThemes || {}, {
    LIMITS,
    hostFromHash,
    cleanCssHost,
    canSaveCss,
    cssSites,
    duplicateName,
    templateName,
    safeFileName,
    canSaveTheme,
    importFileTooLarge,
    themeFromForm,
    importThemeFile,
    newThemeId: freshUserId,
    THEME_ID_PATTERN,
    validateTheme,
    derivePalette,
    paletteFromTheme,
    contrastIssues,
    resolveTheme,
    buildThemeOptions,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
