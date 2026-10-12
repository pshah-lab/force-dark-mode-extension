(function (global) {
  const TABLE = [
    ["builtin:midnight", "Midnight", "#0f1115", "#171a20", "#e8eaed", "#b8bec7", "#8ab4f8", "#343b46", 0],
    ["builtin:oled", "OLED Black", "#000000", "#0b0b0b", "#f2f2f2", "#b5b5b5", "#7ab7ff", "#2a2a2a", 0],
    ["builtin:dracula", "Dracula", "#282a36", "#343746", "#f8f8f2", "#bfc3d9", "#8be9fd", "#44475a", 0],
    ["builtin:nord", "Nord", "#2e3440", "#3b4252", "#eceff4", "#c0c8d8", "#88c0d0", "#4c566a", 0],
    ["builtin:solarized", "Solarized Dark", "#002b36", "#073642", "#eee8d5", "#a3b1b1", "#4fa8e8", "#2a5560", 0],
    ["builtin:contrast", "High Contrast", "#000000", "#101010", "#ffffff", "#e0e0e0", "#7fd4ff", "#8a8a8a", 0],
    ["builtin:dim", "Dim", "#22252b", "#2b2f36", "#dcdfe4", "#b0b6c0", "#8fb8f0", "#444b57", 15],
    ["builtin:sepia", "Sepia Dark", "#1f1a14", "#2a231b", "#ead9bf", "#c2ae92", "#e0a85c", "#4a3d2c", 0],
  ];

  function build(row) {
    const [id, name, background, surface, text, muted, link, border, imageDim] = row;
    return Object.freeze({
      id,
      name,
      colors: Object.freeze({ background, surface, text, muted, link, border }),
      imageDim,
    });
  }

  // Fresh frozen copies on every call so callers can never alter the shared table.
  function getBuiltinThemes() {
    return TABLE.map(build);
  }

  function getBuiltinTheme(id) {
    if (typeof id !== "string") return null;
    const row = TABLE.find((r) => r[0] === id);
    return row ? build(row) : null;
  }

  global.ForceDarkThemes = Object.assign(global.ForceDarkThemes || {}, {
    getBuiltinThemes,
    getBuiltinTheme,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
