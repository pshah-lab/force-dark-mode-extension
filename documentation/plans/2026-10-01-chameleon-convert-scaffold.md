# Chameleon Convert Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Chameleon Convert webapp (new repo, React + Vite) with a landing page and a ported, read-only PDF/docx/pptx dark document viewer, deployed to convert.pshah.fun on Vercel.

**Architecture:** React Router SPA with two routes (`/` landing, `/viewer` the tool). Pure-logic modules (ZIP reader, docx/pptx parsers, pixel-math, PDF render transform, localStorage settings) are framework-free and independently testable; UI is thin React components wrapping them.

**Tech Stack:** React 18, Vite, React Router, `pdfjs-dist` (npm, not hand-vendored), Vitest + React Testing Library, plain CSS with custom properties (no Tailwind), Vercel deployment.

**Spec:** `documentation/specs/2026-10-01-chameleon-convert-scaffold-design.md` (and parent roadmap `documentation/specs/2026-09-30-chameleon-convert-roadmap.md`)

## Global Constraints

- Plain JavaScript, not TypeScript (matches the rest of the user's codebase; revisit at sub-project 4).
- Plain CSS with custom properties, not Tailwind — tokens ported verbatim from `docs/css/style.css`'s `:root` block.
- 100% client-side: no network request may ever carry file content. No backend, no database.
- Settings persist via `localStorage`, not an account system.
- Accepted file types match `viewer.html`'s file input exactly: `.pdf`, `.docx`, `.pptx`, `.doc`, `.ppt`, `.txt`, `.md`, `.markdown`, `.rtf`. `.doc`/`.ppt` keep the same "convert to .docx/.pptx first" rejection behavior as the extension (not real support).
- Deploy target: Vercel, custom domain `convert.pshah.fun`.
- New repo name: `chameleon-convert`, separate from `force-dark-mode-extension`.
- MIT license, matching the extension.

## Review Focus

- **Empty or non-ZIP file dropped as "docx"/"pptx"**: the ZIP reader must throw a clear, distinguishable error (not crash silently or hang) — extension's `zipReader.js` already handles this; the port must not regress it.
- **PDF with zero pages or a corrupt header**: `PdfPageCanvas` must show a readable error state, not a blank screen or an unhandled promise rejection.
- **Rapid mode/color/font-size changes while a PDF is still rendering**: must not race — a stale render must not overwrite a newer one (the extension's `renderGeneration` counter pattern must carry over).
- **Dropping a `.doc` or `.ppt` file (legacy binary format)**: must show the explicit rejection message, not attempt to parse it as a ZIP and fail confusingly.
- **A docx/pptx with more paragraphs/slides than the cap (2000 paragraphs / 500 slides)**: must render the truncation notice, not silently drop content with no explanation.

---

## Task 1: Scaffold the repo, build tooling, and test runner

**Files:**
- Create: `chameleon-convert/package.json`
- Create: `chameleon-convert/vite.config.js`
- Create: `chameleon-convert/index.html`
- Create: `chameleon-convert/src/main.jsx`
- Create: `chameleon-convert/src/App.jsx`
- Create: `chameleon-convert/.gitignore`
- Create: `chameleon-convert/README.md`
- Test: `chameleon-convert/src/App.test.jsx`

**Interfaces:**
- Produces: `<App />` default export from `src/App.jsx`, rendering a `<BrowserRouter>` with routes `/` and `/viewer` (both placeholder `<div>` content until Tasks 9 and 14 fill them in).

- [ ] **Step 1: Create the repo and install dependencies**

```bash
mkdir -p ~/Documents/chameleon-convert
cd ~/Documents/chameleon-convert
git init
npm create vite@latest . -- --template react
npm install
npm install react-router-dom
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Configure Vitest in `vite.config.js`**

```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.js",
  },
});
```

- [ ] **Step 3: Create `src/test-setup.js`**

```javascript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test script to `package.json`**

In the `"scripts"` block, add:
```json
"test": "vitest run"
```

- [ ] **Step 5: Write `src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Landing placeholder</div>} />
        <Route path="/viewer" element={<div>Viewer placeholder</div>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Write the failing test `src/App.test.jsx`**

```jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import App from "./App";

// We can't easily swap BrowserRouter for MemoryRouter without changing
// App itself, so this test just verifies the root route renders without
// throwing when the app mounts at "/".
describe("App", () => {
  it("renders the landing placeholder at the root route", () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(screen.getByText("Landing placeholder")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 8: Write `README.md`**

```markdown
# Chameleon Convert

Dark-mode document viewer for PDF, Word, and PowerPoint files — 100%
client-side, zero uploads, zero tracking. Built by Chameleon Labs, the
makers of [Force Dark Mode / ThemeSwitcher](https://darkmode.pshah.fun).

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

## Testing

\`\`\`bash
npm test
\`\`\`

## License

MIT
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + Vitest project"
```

---

## Task 2: Design tokens — port the Chameleon Labs CSS custom properties

**Files:**
- Create: `chameleon-convert/src/styles/tokens.css`
- Modify: `chameleon-convert/src/main.jsx` (import the stylesheet)

**Interfaces:**
- Produces: global CSS custom properties (`--bg-deep`, `--accent-cyan`, etc.) available to every component via plain CSS, no CSS-in-JS.

- [ ] **Step 1: Write `src/styles/tokens.css`**

```css
:root {
  /* Color Tokens — ported verbatim from force-dark-mode-extension's
     docs/css/style.css, kept in sync manually (no shared package yet). */
  --bg-deep: #07090e;
  --bg-base: #0b0e14;
  --bg-surface: #10141d;
  --bg-surface-elevated: #161c28;
  --bg-surface-glass: rgba(16, 20, 29, 0.72);
  --bg-glass-card: rgba(22, 28, 40, 0.55);

  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-hover: rgba(255, 255, 255, 0.16);
  --border-glow: rgba(99, 102, 241, 0.35);

  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --text-inverse: #0b0e14;

  --accent-primary: #6366f1;
  --accent-primary-hover: #4f46e5;
  --accent-cyan: #38bdf8;
  --accent-cyan-glow: rgba(56, 189, 248, 0.25);
  --accent-indigo-glow: rgba(99, 102, 241, 0.28);
  --accent-success: #10b981;
  --accent-warning: #f59e0b;

  --chameleon-pink: #f472b6;
  --chameleon-orange: #fb923c;
  --chameleon-lime: #a3e635;
  --chameleon-teal: #2dd4bf;
  --chameleon-violet: #a78bfa;

  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;

  --container-max: 1240px;
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-xl: 32px;
  --radius-full: 9999px;

  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
}

body {
  margin: 0;
  background: var(--bg-deep);
  color: var(--text-primary);
  font-family: var(--font-sans);
}
```

- [ ] **Step 2: Import it in `src/main.jsx`**

Add near the top of the file, before the `ReactDOM.createRoot(...)` call:

```javascript
import "./styles/tokens.css";
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: port Chameleon Labs design tokens"
```

---

## Task 3: Port the zero-dependency ZIP reader

**Files:**
- Create: `chameleon-convert/src/lib/zipReader.js` (copy of `force-dark-mode-extension/src/shared/zipReader.js`, no changes needed — zero relative imports)
- Test: `chameleon-convert/src/lib/zipReader.test.js` (Vitest port of `force-dark-mode-extension/tests/zip_reader_test.mjs`)

**Interfaces:**
- Produces: `listZipEntryNames(bytes)`, `readZipEntryText(bytes, entryName)` — identical signatures to the extension's version.

- [ ] **Step 1: Copy the file verbatim**

```bash
cp /Users/pshah/Documents/force-dark-mode-extension/src/shared/zipReader.js \
   ~/Documents/chameleon-convert/src/lib/zipReader.js
```

- [ ] **Step 2: Port the test file to Vitest syntax**

Read `force-dark-mode-extension/tests/zip_reader_test.mjs` in full, then
write `src/lib/zipReader.test.js` converting its custom `test()`/`assert`
pattern to Vitest's `describe`/`it`/`expect`, preserving every test case
(all 8: list entries, decompress deflate-raw, read stored/uncompressed
entry, missing entry returns null, non-ZIP buffer throws, encrypted entry
throws with a tagged error, non-ZIP error is not tagged as ENCRYPTED).
Update the import to `from "./zipReader.js"`.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npm test -- zipReader`
Expected: PASS (8 tests)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: port zero-dependency ZIP reader from the extension"
```

---

## Task 4: Port the docx parser

**Files:**
- Create: `chameleon-convert/src/lib/docxParser.js` (copy of `force-dark-mode-extension/src/viewer/parsers/docxParser.js`, no changes needed)
- Test: `chameleon-convert/src/lib/docxParser.test.js` (Vitest port of `force-dark-mode-extension/tests/docx_parser_test.mjs`)

**Interfaces:**
- Consumes: nothing (self-contained).
- Produces: `parseDocxDocument(xmlText)` → `{ blocks, truncated }`.

- [ ] **Step 1: Copy the file verbatim**

```bash
cp /Users/pshah/Documents/force-dark-mode-extension/src/viewer/parsers/docxParser.js \
   ~/Documents/chameleon-convert/src/lib/docxParser.js
```

- [ ] **Step 2: Port the test file to Vitest syntax**

Read `force-dark-mode-extension/tests/docx_parser_test.mjs` in full, port
all 8 cases (heading with level, Title style maps to h1, bold/italic
runs, w:val=0 bold flag treated as not-bold, list item via numPr, empty
XML returns empty non-truncated result, `<w:tab/>` not treated as
`<w:t>`, caps at 2000 paragraphs and marks truncated) to
`describe`/`it`/`expect`. Update the import to `from "./docxParser.js"`.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npm test -- docxParser`
Expected: PASS (8 tests)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: port docx parser from the extension"
```

---

## Task 5: Port the pptx parser

**Files:**
- Create: `chameleon-convert/src/lib/pptxParser.js` (copy of `force-dark-mode-extension/src/viewer/parsers/pptxParser.js`, no changes needed)
- Test: `chameleon-convert/src/lib/pptxParser.test.js` (Vitest port of `force-dark-mode-extension/tests/pptx_parser_test.mjs`)

**Interfaces:**
- Consumes: nothing (self-contained).
- Produces: `parsePptxSlideXml(xmlText)` → `blocks[]`; `parsePptxPresentation(entryNames, fetchEntryText)` → `{ slides, truncated }`.

- [ ] **Step 1: Copy the file verbatim**

```bash
cp /Users/pshah/Documents/force-dark-mode-extension/src/viewer/parsers/pptxParser.js \
   ~/Documents/chameleon-convert/src/lib/pptxParser.js
```

- [ ] **Step 2: Port the test file to Vitest syntax**

Read `force-dark-mode-extension/tests/pptx_parser_test.mjs` in full, port
all 6 cases (bold/italic runs per paragraph, empty slide returns empty
array, hypothetical `<a:tXY>` not treated as `<a:t>`, slides ordered
numerically not lexicographically, no slide entries returns empty
non-truncated result, caps at 500 slides and marks truncated) to
`describe`/`it`/`expect`. Update the import to `from "./pptxParser.js"`.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npm test -- pptxParser`
Expected: PASS (6 tests)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: port pptx parser from the extension"
```

---

## Task 6: Pixel-math module

**Files:**
- Create: `chameleon-convert/src/lib/pixelMath.js`
- Test: `chameleon-convert/src/lib/pixelMath.test.js`

**Interfaces:**
- Produces: `hexToRgb(hex)`, `rgbToHsl({r,g,b})`, `getRelativeLuminance({r,g,b})`, `mixRgb(colorA, colorB, amount)`, `dimColor(color, amount)`, `applyContrast(color, amount)`, `clampColorChannel(value)`, `clampNumber(value, min, max, fallback)`.
- Consumed by: Task 7's `pdfRender.js`.

This extracts the extension's inline pixel-math helpers (currently
embedded in `viewer.js`, lines 897-978) into their own testable module —
they were never framework- or extension-specific, just never split out.

- [ ] **Step 1: Write the failing tests**

```javascript
import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  rgbToHsl,
  getRelativeLuminance,
  mixRgb,
  dimColor,
  applyContrast,
  clampColorChannel,
  clampNumber,
} from "./pixelMath.js";

describe("hexToRgb", () => {
  it("parses a 6-digit hex color", () => {
    expect(hexToRgb("#0f1115")).toEqual({ r: 15, g: 17, b: 21 });
  });
});

describe("rgbToHsl", () => {
  it("returns zero saturation for a pure gray", () => {
    const { h, s, l } = rgbToHsl({ r: 128, g: 128, b: 128 });
    expect(h).toBe(0);
    expect(s).toBe(0);
    expect(l).toBeCloseTo(0.5, 1);
  });

  it("detects a saturated red", () => {
    const { s } = rgbToHsl({ r: 220, g: 40, b: 40 });
    expect(s).toBeGreaterThan(0.5);
  });
});

describe("getRelativeLuminance", () => {
  it("returns 1 for white", () => {
    expect(getRelativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 2);
  });

  it("returns 0 for black", () => {
    expect(getRelativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });
});

describe("mixRgb", () => {
  it("returns colorA at amount 0", () => {
    const a = { r: 10, g: 20, b: 30 };
    const b = { r: 200, g: 200, b: 200 };
    expect(mixRgb(a, b, 0)).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("returns colorB at amount 1", () => {
    const a = { r: 10, g: 20, b: 30 };
    const b = { r: 200, g: 200, b: 200 };
    expect(mixRgb(a, b, 1)).toEqual({ r: 200, g: 200, b: 200 });
  });

  it("clamps amount above 1", () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 100, g: 100, b: 100 };
    expect(mixRgb(a, b, 5)).toEqual({ r: 100, g: 100, b: 100 });
  });
});

describe("dimColor", () => {
  it("scales each channel by the given amount", () => {
    expect(dimColor({ r: 200, g: 100, b: 50 }, 0.5)).toEqual({ r: 100, g: 50, b: 25 });
  });
});

describe("applyContrast", () => {
  it("returns the color unchanged at amount 1", () => {
    expect(applyContrast({ r: 100, g: 150, b: 200 }, 1)).toEqual({ r: 100, g: 150, b: 200 });
  });
});

describe("clampColorChannel", () => {
  it("clamps below 0 to 0", () => {
    expect(clampColorChannel(-10)).toBe(0);
  });

  it("clamps above 255 to 255", () => {
    expect(clampColorChannel(300)).toBe(255);
  });

  it("rounds fractional values", () => {
    expect(clampColorChannel(127.6)).toBe(128);
  });
});

describe("clampNumber", () => {
  it("returns the fallback for non-finite input", () => {
    expect(clampNumber(NaN, 0, 10, 5)).toBe(5);
  });

  it("clamps within range", () => {
    expect(clampNumber(50, 0, 10, 5)).toBe(10);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- pixelMath`
Expected: FAIL with "Failed to resolve import ./pixelMath.js"

- [ ] **Step 3: Write `src/lib/pixelMath.js`**

```javascript
export function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return { h: hue / 6, s: saturation, l: lightness };
}

export function getRelativeLuminance({ r, g, b }) {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function clampColorChannel(value) {
  return Math.min(Math.max(Math.round(value), 0), 255);
}

export function mixRgb(colorA, colorB, amount) {
  const ratio = Math.min(Math.max(amount, 0), 1);
  return {
    r: clampColorChannel(colorA.r + (colorB.r - colorA.r) * ratio),
    g: clampColorChannel(colorA.g + (colorB.g - colorA.g) * ratio),
    b: clampColorChannel(colorA.b + (colorB.b - colorA.b) * ratio),
  };
}

export function dimColor(color, amount) {
  return {
    r: clampColorChannel(color.r * amount),
    g: clampColorChannel(color.g * amount),
    b: clampColorChannel(color.b * amount),
  };
}

export function applyContrast(color, amount) {
  return {
    r: clampColorChannel((color.r - 128) * amount + 128),
    g: clampColorChannel((color.g - 128) * amount + 128),
    b: clampColorChannel((color.b - 128) * amount + 128),
  };
}

export function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- pixelMath`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pixel-math module (extracted from extension's viewer.js)"
```

---

## Task 7: PDF render-transform module

**Files:**
- Create: `chameleon-convert/src/lib/pdfRender.js`
- Test: `chameleon-convert/src/lib/pdfRender.test.js`

**Interfaces:**
- Consumes: `hexToRgb`, `rgbToHsl`, `getRelativeLuminance`, `mixRgb`, `dimColor`, `applyContrast` from `./pixelMath.js`.
- Produces: `transformPixel(pixel, mode, palette)`, `getPdfPageColors(settings)`, `transformPdfCanvas(canvas, settings)`.

Ports the mode-dispatch and per-pixel transform logic from the
extension's `viewer.js` (lines 413-536), with the pixel-math calls now
imported instead of inline.

- [ ] **Step 1: Write the failing tests**

```javascript
import { describe, it, expect } from "vitest";
import { transformPixel, getPdfPageColors } from "./pdfRender.js";

const palette = {
  background: { r: 15, g: 17, b: 21 },
  text: { r: 232, g: 234, b: 237 },
  contrast: 1.05,
};

describe("transformPixel", () => {
  it("inverts in invert mode", () => {
    const result = transformPixel({ r: 255, g: 255, b: 255 }, "invert", palette);
    // 255 inverted is 0, then contrast is applied around 128 — stays near 0.
    expect(result.r).toBeLessThan(20);
  });

  it("darkens a near-white pixel in smart mode", () => {
    const result = transformPixel({ r: 250, g: 250, b: 250 }, "smart", palette);
    expect(result.r).toBeLessThan(250);
  });

  it("warms toward sepia tones in sepia mode", () => {
    const result = transformPixel({ r: 250, g: 250, b: 250 }, "sepia", palette);
    // Sepia background is warm dark brown (36, 30, 23) — result should
    // trend toward more red than blue.
    expect(result.r).toBeGreaterThanOrEqual(result.b);
  });

  it("preserves saturated colors in smart mode rather than flattening them", () => {
    const saturatedRed = { r: 220, g: 30, b: 30 };
    const result = transformPixel(saturatedRed, "smart", palette);
    // Should still read as reddish, not converted to a flat gray.
    expect(result.r).toBeGreaterThan(result.g);
    expect(result.r).toBeGreaterThan(result.b);
  });
});

describe("getPdfPageColors", () => {
  it("returns null when mode is not smart", () => {
    expect(getPdfPageColors({ mode: "invert", backgroundColor: "#000", textColor: "#fff" })).toBeNull();
  });

  it("returns background/foreground when mode is smart", () => {
    const result = getPdfPageColors({ mode: "smart", backgroundColor: "#0f1115", textColor: "#e8eaed" });
    expect(result).toEqual({ background: "#0f1115", foreground: "#e8eaed" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- pdfRender`
Expected: FAIL with "Failed to resolve import ./pdfRender.js"

- [ ] **Step 3: Write `src/lib/pdfRender.js`**

```javascript
import {
  rgbToHsl,
  getRelativeLuminance,
  mixRgb,
  dimColor,
  applyContrast,
} from "./pixelMath.js";

export function getPdfPageColors(settings) {
  if (settings.mode !== "smart") return null;

  return {
    background: settings.backgroundColor,
    foreground: settings.textColor,
  };
}

export function transformPixel(pixel, mode, palette) {
  if (mode === "invert") {
    return applyContrast(
      { r: 255 - pixel.r, g: 255 - pixel.g, b: 255 - pixel.b },
      palette.contrast
    );
  }

  if (mode === "sepia") {
    return transformSepiaPixel(pixel);
  }

  return transformSmartPixel(pixel, palette);
}

function transformSmartPixel(pixel, { background, text, contrast }) {
  const hsl = rgbToHsl(pixel);
  const luminance = getRelativeLuminance(pixel);

  if (hsl.s > 0.32 && luminance > 0.18 && luminance < 0.88) {
    return applyContrast(dimColor(pixel, 0.82), contrast);
  }

  if (luminance > 0.78) {
    return mixRgb(background, text, (1 - luminance) * 0.16);
  }

  if (luminance < 0.35) {
    return mixRgb(text, background, 0.08 + luminance * 0.28);
  }

  return applyContrast(
    mixRgb(background, text, 1 - Math.min(Math.max(luminance, 0.2), 0.86)),
    contrast
  );
}

function transformSepiaPixel(pixel) {
  const luminance = getRelativeLuminance(pixel);
  const background = { r: 36, g: 30, b: 23 };
  const text = { r: 240, g: 221, b: 193 };
  const preserveColor = rgbToHsl(pixel).s > 0.36 && luminance > 0.18 && luminance < 0.82;

  if (preserveColor) {
    return dimColor(pixel, 0.78);
  }

  return mixRgb(text, background, luminance);
}

export function transformPdfCanvas(canvas, settings) {
  if (settings.mode === "original" || settings.mode === "smart") return;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const background = hexToRgbLocal(settings.backgroundColor);
  const text = hexToRgbLocal(settings.textColor);
  const contrast = settings.contrast / 100;

  for (let index = 0; index < data.length; index += 4) {
    const pixel = { r: data[index], g: data[index + 1], b: data[index + 2] };
    const transformed = transformPixel(pixel, settings.mode, { background, text, contrast });
    data[index] = transformed.r;
    data[index + 1] = transformed.g;
    data[index + 2] = transformed.b;
  }

  context.putImageData(image, 0, 0);
}

function hexToRgbLocal(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}
```

Note: `transformPdfCanvas` needs `hexToRgb` for the *settings colors*
(already-defined hex strings), which is identical to `pixelMath.js`'s
`hexToRgb` — re-declared locally here as `hexToRgbLocal` to avoid an
unused-import lint warning in the common case where `transformPixel` is
imported standalone without canvas transforms. If that feels redundant
during implementation, importing `hexToRgb` from `./pixelMath.js`
directly instead is equally correct — either is fine.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- pdfRender`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add PDF render-transform module (ported from extension)"
```

---

## Task 8: Settings persistence module

**Files:**
- Create: `chameleon-convert/src/lib/settings.js`
- Test: `chameleon-convert/src/lib/settings.test.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS` (object), `getSettings()` → settings object, `setSettings(partial)` → void.
- Consumed by: Task 14's `Viewer.jsx`.

Replaces the extension's `chrome.storage.sync` calls with `localStorage`
— same default shape, different storage mechanism, as called out in the
spec.

- [ ] **Step 1: Write the failing tests**

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_SETTINGS, getSettings, setSettings } from "./settings.js";

describe("settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when nothing is stored", () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("persists a partial update and merges it with defaults", () => {
    setSettings({ mode: "invert" });
    expect(getSettings()).toEqual({ ...DEFAULT_SETTINGS, mode: "invert" });
  });

  it("persists across separate getSettings calls", () => {
    setSettings({ fontSize: 20 });
    setSettings({ backgroundColor: "#000000" });
    expect(getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      fontSize: 20,
      backgroundColor: "#000000",
    });
  });

  it("ignores corrupted stored JSON and falls back to defaults", () => {
    localStorage.setItem("chameleon-convert-settings", "{not valid json");
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- settings`
Expected: FAIL with "Failed to resolve import ./settings.js"

- [ ] **Step 3: Write `src/lib/settings.js`**

```javascript
const STORAGE_KEY = "chameleon-convert-settings";

export const DEFAULT_SETTINGS = {
  mode: "smart",
  backgroundColor: "#0f1115",
  textColor: "#e8eaed",
  fontSize: 17,
  contrast: 105,
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(partial) {
  const merged = { ...getSettings(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- settings`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add localStorage settings module"
```

---

## Task 9: Landing page

**Files:**
- Create: `chameleon-convert/src/routes/Landing.jsx`
- Create: `chameleon-convert/src/routes/Landing.css`
- Test: `chameleon-convert/src/routes/Landing.test.jsx`
- Modify: `chameleon-convert/src/App.jsx` (replace the `/` placeholder with `<Landing />`)

**Interfaces:**
- Produces: `<Landing />` default export — hero + tool-card grid.

- [ ] **Step 1: Write the failing test**

```jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import Landing from "./Landing";

describe("Landing", () => {
  it("renders the hero heading", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /chameleon convert/i })).toBeInTheDocument();
  });

  it("links the live Dark Document Viewer card to /viewer", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /dark document viewer/i });
    expect(link).toHaveAttribute("href", "/viewer");
  });

  it("marks Excel and Edit & Export as Coming Soon, not linked", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const comingSoonBadges = screen.getAllByText(/coming soon/i);
    expect(comingSoonBadges).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Landing`
Expected: FAIL with "Failed to resolve import ./Landing"

- [ ] **Step 3: Write `src/routes/Landing.jsx`**

```jsx
import { Link } from "react-router-dom";
import "./Landing.css";

const TOOLS = [
  {
    name: "Dark Document Viewer",
    description: "PDF, Word, and PowerPoint files — rendered dark, entirely offline.",
    href: "/viewer",
    live: true,
  },
  {
    name: "Excel Dark Mode",
    description: "Spreadsheets with full sheet/cell-style support.",
    href: null,
    live: false,
  },
  {
    name: "Edit & Export",
    description: "Edit documents in place and download the result.",
    href: null,
    live: false,
  },
];

export default function Landing() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <h1>Chameleon Convert</h1>
        <p>File tools that stay on your device. No uploads, no tracking.</p>
      </section>

      <section className="landing-tools" aria-label="Tools">
        {TOOLS.map((tool) => (
          <article className="tool-card" key={tool.name}>
            <h2>{tool.name}</h2>
            <p>{tool.description}</p>
            {tool.live ? (
              <Link to={tool.href} className="tool-card-cta">
                Open tool
              </Link>
            ) : (
              <span className="tool-card-badge">Coming Soon</span>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Write `src/routes/Landing.css`**

```css
.landing-hero {
  text-align: center;
  padding: 4rem 1.5rem 2rem;
}

.landing-hero h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  margin: 0 0 0.75rem;
}

.landing-hero p {
  color: var(--text-secondary);
  margin: 0;
}

.landing-tools {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
  max-width: var(--container-max);
  margin: 0 auto;
  padding: 0 1.5rem 4rem;
}

.tool-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 1.75rem;
}

.tool-card h2 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}

.tool-card p {
  color: var(--text-secondary);
  margin: 0 0 1.25rem;
}

.tool-card-cta {
  display: inline-block;
  padding: 0.6rem 1.25rem;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover));
  color: #fff;
  text-decoration: none;
  font-weight: 600;
}

.tool-card-badge {
  display: inline-block;
  padding: 0.3rem 0.8rem;
  border-radius: var(--radius-full);
  background: rgba(251, 146, 60, 0.16);
  color: var(--chameleon-orange);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- Landing`
Expected: PASS (3 tests)

- [ ] **Step 6: Wire it into `App.jsx`**

```jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./routes/Landing";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/viewer" element={<div>Viewer placeholder</div>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add landing page with tool cards"
```

---

## Task 10: Toolbar controls (mode, colors, font size)

**Files:**
- Create: `chameleon-convert/src/components/Toolbar.jsx`
- Create: `chameleon-convert/src/components/Toolbar.css`
- Test: `chameleon-convert/src/components/Toolbar.test.jsx`

**Interfaces:**
- Consumes: `settings` object (shape from `DEFAULT_SETTINGS` in Task 8), `onChange(partialSettings)` callback.
- Produces: `<Toolbar settings={...} onChange={...} />` — controlled component, no internal state.

- [ ] **Step 1: Write the failing test**

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Toolbar from "./Toolbar";
import { DEFAULT_SETTINGS } from "../lib/settings.js";

describe("Toolbar", () => {
  it("calls onChange with the new mode when the mode select changes", () => {
    const onChange = vi.fn();
    render(<Toolbar settings={DEFAULT_SETTINGS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/mode/i), { target: { value: "invert" } });
    expect(onChange).toHaveBeenCalledWith({ mode: "invert" });
  });

  it("calls onChange with the new font size when the slider moves", () => {
    const onChange = vi.fn();
    render(<Toolbar settings={DEFAULT_SETTINGS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/size/i), { target: { value: "20" } });
    expect(onChange).toHaveBeenCalledWith({ fontSize: 20 });
  });

  it("calls onChange with the new background color", () => {
    const onChange = vi.fn();
    render(<Toolbar settings={DEFAULT_SETTINGS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/background/i), { target: { value: "#000000" } });
    expect(onChange).toHaveBeenCalledWith({ backgroundColor: "#000000" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Toolbar`
Expected: FAIL with "Failed to resolve import ./Toolbar"

- [ ] **Step 3: Write `src/components/Toolbar.jsx`**

```jsx
import "./Toolbar.css";

export default function Toolbar({ settings, onChange }) {
  return (
    <div className="toolbar">
      <label>
        Mode
        <select
          value={settings.mode}
          onChange={(event) => onChange({ mode: event.target.value })}
        >
          <option value="smart">Smart Dark</option>
          <option value="invert">Invert</option>
          <option value="sepia">Sepia</option>
          <option value="original">Original</option>
        </select>
      </label>

      <label>
        Background
        <input
          type="color"
          value={settings.backgroundColor}
          onChange={(event) => onChange({ backgroundColor: event.target.value })}
        />
      </label>

      <label>
        Text
        <input
          type="color"
          value={settings.textColor}
          onChange={(event) => onChange({ textColor: event.target.value })}
        />
      </label>

      <label>
        Size
        <input
          type="range"
          min="14"
          max="24"
          value={settings.fontSize}
          onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
        />
      </label>

      <label>
        Contrast
        <input
          type="range"
          min="80"
          max="135"
          value={settings.contrast}
          onChange={(event) => onChange({ contrast: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/Toolbar.css`**

```css
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: center;
  padding: 1rem 1.5rem;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
}

.toolbar label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- Toolbar`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add toolbar controls (mode, colors, font size, contrast)"
```

---

## Task 11: File dropzone

**Files:**
- Create: `chameleon-convert/src/components/FileDropzone.jsx`
- Create: `chameleon-convert/src/components/FileDropzone.css`
- Test: `chameleon-convert/src/components/FileDropzone.test.jsx`

**Interfaces:**
- Consumes: `onFile(file)` callback.
- Produces: `<FileDropzone onFile={...} />` — drag-and-drop area plus a "Browse" button, accepts the same file types as the extension's `viewer.html` file input.

- [ ] **Step 1: Write the failing test**

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import FileDropzone from "./FileDropzone";

function makeFile(name, type) {
  return new File(["content"], name, { type });
}

describe("FileDropzone", () => {
  it("calls onFile when a file is dropped", () => {
    const onFile = vi.fn();
    render(<FileDropzone onFile={onFile} />);
    const file = makeFile("sample.pdf", "application/pdf");

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [file] },
    });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("calls onFile when a file is chosen via the Browse button", () => {
    const onFile = vi.fn();
    render(<FileDropzone onFile={onFile} />);
    const file = makeFile("sample.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const input = screen.getByTestId("file-input");

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("does not call onFile when the drop has no files", () => {
    const onFile = vi.fn();
    render(<FileDropzone onFile={onFile} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [] },
    });

    expect(onFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- FileDropzone`
Expected: FAIL with "Failed to resolve import ./FileDropzone"

- [ ] **Step 3: Write `src/components/FileDropzone.jsx`**

```jsx
import { useRef } from "react";
import "./FileDropzone.css";

const ACCEPT =
  ".pdf,.txt,.md,.markdown,.rtf,.docx,.pptx,.doc,.ppt,application/pdf,text/plain,text/markdown,application/rtf,text/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.ms-powerpoint";

export default function FileDropzone({ onFile }) {
  const inputRef = useRef(null);

  function handleDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function handleChange(event) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className="dropzone"
      data-testid="dropzone"
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
    >
      <p>Drag a file here</p>
      <button type="button" onClick={() => inputRef.current?.click()}>
        Browse
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        data-testid="file-input"
        onChange={handleChange}
        hidden
      />
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/FileDropzone.css`**

```css
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem;
  border: 2px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-align: center;
}

.dropzone button {
  padding: 0.6rem 1.25rem;
  border-radius: var(--radius-full);
  border: none;
  background: var(--accent-primary);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- FileDropzone`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add file dropzone component"
```

---

## Task 12: PDF page canvas

**Files:**
- Create: `chameleon-convert/src/components/PdfPageCanvas.jsx`
- Create: `chameleon-convert/src/lib/pdfjsSetup.js`
- Test: `chameleon-convert/src/components/PdfPageCanvas.test.jsx`

**Interfaces:**
- Consumes: `file` (a `File`/`Blob`), `settings` (from `DEFAULT_SETTINGS` shape), `getPdfPageColors`/`transformPdfCanvas` from `../lib/pdfRender.js`.
- Produces: `<PdfPageCanvas file={...} settings={...} />` — renders every page of the PDF as a canvas, dark-converted per `settings.mode`.

- [ ] **Step 1: Install pdfjs-dist**

```bash
cd ~/Documents/chameleon-convert
npm install pdfjs-dist
```

- [ ] **Step 2: Write `src/lib/pdfjsSetup.js`**

```javascript
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default pdfjsLib;
```

- [ ] **Step 3: Write the failing test**

```jsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import PdfPageCanvas from "./PdfPageCanvas";
import { DEFAULT_SETTINGS } from "../lib/settings.js";

// A minimal single-page PDF, same fixture content used in the
// extension's test-fixtures/sample.pdf.
const MINIMAL_PDF_BASE64 =
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxOTAKJSVFT0Y=";

function base64ToFile(base64, name) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: "application/pdf" });
}

describe("PdfPageCanvas", () => {
  it("renders one canvas for a one-page PDF", async () => {
    const file = base64ToFile(MINIMAL_PDF_BASE64, "sample.pdf");
    render(<PdfPageCanvas file={file} settings={DEFAULT_SETTINGS} />);

    await waitFor(() => {
      expect(screen.getAllByTestId("pdf-page-canvas")).toHaveLength(1);
    });
  });

  it("shows an error state for a corrupt file instead of a blank screen", async () => {
    const file = new File(["not a real pdf"], "broken.pdf", { type: "application/pdf" });
    render(<PdfPageCanvas file={file} settings={DEFAULT_SETTINGS} />);

    await waitFor(() => {
      expect(screen.getByText(/couldn't load this pdf/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- PdfPageCanvas`
Expected: FAIL with "Failed to resolve import ./PdfPageCanvas"

- [ ] **Step 5: Write `src/components/PdfPageCanvas.jsx`**

```jsx
import { useEffect, useRef, useState } from "react";
import pdfjsLib from "../lib/pdfjsSetup.js";
import { getPdfPageColors, transformPdfCanvas } from "../lib/pdfRender.js";

export default function PdfPageCanvas({ file, settings }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const generationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const generation = ++generationRef.current;
    setError(null);

    async function renderAllPages() {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled || generation !== generationRef.current) return;

        const container = containerRef.current;
        if (container) container.replaceChildren();

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled || generation !== generationRef.current) return;
          await renderPage(pdf, pageNumber, container, settings, generation, generationRef);
        }
      } catch {
        if (!cancelled && generation === generationRef.current) {
          setError("Couldn't load this PDF — it may be corrupted or password-protected.");
        }
      }
    }

    renderAllPages();

    return () => {
      cancelled = true;
    };
  }, [file, settings]);

  if (error) {
    return <p className="pdf-error">{error}</p>;
  }

  return <div ref={containerRef} data-testid="pdf-pages" />;
}

async function renderPage(pdf, pageNumber, container, settings, generation, generationRef) {
  const page = await pdf.getPage(pageNumber);
  if (generation !== generationRef.current) return;

  const viewport = page.getViewport({ scale: 1.2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.setAttribute("data-testid", "pdf-page-canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  await page.render({
    canvasContext: context,
    viewport,
    background: "rgb(255, 255, 255)",
    pageColors: getPdfPageColors(settings),
  }).promise;

  if (generation !== generationRef.current) return;
  transformPdfCanvas(canvas, settings);

  if (container) container.appendChild(canvas);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- PdfPageCanvas`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add PDF page canvas component with pdfjs-dist"
```

---

## Task 13: Document panel (docx/pptx renderer)

**Files:**
- Create: `chameleon-convert/src/components/DocumentPanel.jsx`
- Create: `chameleon-convert/src/components/DocumentPanel.css`
- Test: `chameleon-convert/src/components/DocumentPanel.test.jsx`

**Interfaces:**
- Consumes: `kind` (`"docx"` or `"pptx"`), `file` (a `File`/`Blob`), `listZipEntryNames`/`readZipEntryText` from `../lib/zipReader.js`, `parseDocxDocument` from `../lib/docxParser.js`, `parsePptxPresentation` from `../lib/pptxParser.js`.
- Produces: `<DocumentPanel kind={...} file={...} />` — renders the parsed document as JSX (headings, lists, paragraphs for docx; numbered slide sections for pptx), replacing the extension's imperative DOM-building functions (`renderDocxBlocksSafely`, `renderPptxSlidesSafely`, `renderRunsInto`) with declarative JSX.

- [ ] **Step 1: Write the failing test**

Build a minimal real docx fixture inline using the ZIP format the parser
expects, rather than relying on an external file:

```jsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import DocumentPanel from "./DocumentPanel";

// A docx is a ZIP containing word/document.xml. We build one in-memory
// using CompressionStream so the test doesn't depend on a binary fixture
// file living in the repo.
async function makeDocxFile(documentXml) {
  const files = {
    "word/document.xml": documentXml,
    "[Content_Types].xml": "<Types/>",
  };
  // Minimal uncompressed (stored) ZIP writer, sufficient for this test —
  // not the real writer that ships in sub-project 4.
  const encoder = new TextEncoder();
  const parts = [];
  const centralDirectory = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(content);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true); // stored, no compression
    view.setUint32(14, crc32(contentBytes), true);
    view.setUint32(18, contentBytes.length, true);
    view.setUint32(22, contentBytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    parts.push(localHeader, contentBytes);
    centralDirectory.push({ name: nameBytes, offset, size: contentBytes.length, crc: crc32(contentBytes) });
    offset += localHeader.length + contentBytes.length;
  }

  const centralStart = offset;
  for (const entry of centralDirectory) {
    const header = new Uint8Array(46 + entry.name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.size, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, entry.name.length, true);
    view.setUint32(42, entry.offset, true);
    header.set(entry.name, 46);
    parts.push(header);
    offset += header.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, centralDirectory.length, true);
  eocdView.setUint16(10, centralDirectory.length, true);
  eocdView.setUint32(12, offset - centralStart, true);
  eocdView.setUint32(16, centralStart, true);
  parts.push(eocd);

  return new File(parts, "sample.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

describe("DocumentPanel", () => {
  it("renders a heading and paragraph from a docx file", async () => {
    const xml =
      '<w:document xmlns:w="x"><w:body>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>World</w:t></w:r></w:p>' +
      "</w:body></w:document>";
    const file = await makeDocxFile(xml);

    render(<DocumentPanel kind="docx" file={file} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
      expect(screen.getByText("World")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- DocumentPanel`
Expected: FAIL with "Failed to resolve import ./DocumentPanel"

- [ ] **Step 3: Write `src/components/DocumentPanel.jsx`**

```jsx
import { useEffect, useState } from "react";
import { listZipEntryNames, readZipEntryText } from "../lib/zipReader.js";
import { parseDocxDocument } from "../lib/docxParser.js";
import { parsePptxPresentation } from "../lib/pptxParser.js";
import "./DocumentPanel.css";

export default function DocumentPanel({ kind, file }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    async function load() {
      try {
        const buffer = new Uint8Array(await file.arrayBuffer());

        if (kind === "docx") {
          const xml = readZipEntryText(buffer, "word/document.xml");
          const result = parseDocxDocument(xml);
          if (!cancelled) setState({ status: "ready", kind, result });
          return;
        }

        if (kind === "pptx") {
          const entryNames = listZipEntryNames(buffer);
          const result = await parsePptxPresentation(entryNames, (name) =>
            Promise.resolve(readZipEntryText(buffer, name))
          );
          if (!cancelled) setState({ status: "ready", kind, result });
          return;
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error?.code === "ENCRYPTED"
              ? "This file is password-protected and can't be opened."
              : "Couldn't read this file — it may not be a valid document.";
          setState({ status: "error", message });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [kind, file]);

  if (state.status === "loading") return <p>Loading…</p>;
  if (state.status === "error") return <p className="document-error">{state.message}</p>;

  if (state.kind === "docx") return <DocxView result={state.result} />;
  return <PptxView result={state.result} />;
}

function Runs({ runs }) {
  return runs.map((run, index) => {
    let node = run.text;
    if (run.bold) node = <strong key={index}>{node}</strong>;
    if (run.italic) node = <em key={index}>{node}</em>;
    return <span key={index}>{node}</span>;
  });
}

function DocxView({ result }) {
  const elements = [];
  let currentListItems = null;

  result.blocks.forEach((block, index) => {
    if (block.type === "heading") {
      currentListItems = null;
      const Heading = `h${block.level}`;
      elements.push(<Heading key={index}>{block.text}</Heading>);
      return;
    }

    if (block.type === "listItem") {
      if (!currentListItems) {
        currentListItems = [];
        elements.push(<ul key={`list-${index}`}>{currentListItems}</ul>);
      }
      currentListItems.push(
        <li key={index}>
          <Runs runs={block.runs} />
        </li>
      );
      return;
    }

    currentListItems = null;
    elements.push(
      <p key={index}>
        <Runs runs={block.runs} />
      </p>
    );
  });

  return (
    <article className="document-panel">
      {elements}
      {result.truncated && (
        <p className="truncation-notice">
          This document is very long — only the first 2000 paragraphs are shown.
        </p>
      )}
    </article>
  );
}

function PptxView({ result }) {
  return (
    <article className="document-panel">
      {result.slides.map((slide) => (
        <section className="pptx-slide" key={slide.number}>
          <div className="pptx-slide-label">Slide {slide.number}</div>
          {slide.blocks.map((block, index) => (
            <p key={index}>
              <Runs runs={block.runs} />
            </p>
          ))}
        </section>
      ))}
      {result.truncated && (
        <p className="truncation-notice">
          This presentation has a lot of slides — only the first 500 are shown.
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Write `src/components/DocumentPanel.css`**

```css
.document-panel {
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.38);
  margin: 24px auto 42px;
  padding: 2rem;
  max-width: 760px;
}

.pptx-slide {
  border-top: 1px solid var(--border-subtle);
  padding-top: 1rem;
  margin-top: 1rem;
}

.pptx-slide-label {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

.truncation-notice,
.document-error {
  color: var(--text-muted);
  font-style: italic;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- DocumentPanel`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add document panel for docx/pptx rendering"
```

---

## Task 14: Viewer route — wire everything together

**Files:**
- Create: `chameleon-convert/src/routes/Viewer.jsx`
- Create: `chameleon-convert/src/routes/Viewer.css`
- Test: `chameleon-convert/src/routes/Viewer.test.jsx`
- Modify: `chameleon-convert/src/App.jsx` (replace the `/viewer` placeholder with `<Viewer />`)

**Interfaces:**
- Consumes: `FileDropzone` (Task 11), `Toolbar` (Task 10), `PdfPageCanvas` (Task 12), `DocumentPanel` (Task 13), `getSettings`/`setSettings` (Task 8).
- Produces: `<Viewer />` — the full page: toolbar, dropzone/empty state when no file is loaded, routes to `PdfPageCanvas` or `DocumentPanel` based on file type once one is loaded. `.doc`/`.ppt` show the rejection message instead of attempting to parse.

- [ ] **Step 1: Write the failing test**

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Viewer from "./Viewer";

describe("Viewer", () => {
  it("shows the dropzone when no file is loaded", () => {
    render(<Viewer />);
    expect(screen.getByTestId("dropzone")).toBeInTheDocument();
  });

  it("shows the legacy-format rejection message for a .doc file", () => {
    render(<Viewer />);
    const file = new File(["x"], "legacy.doc", { type: "application/msword" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    expect(
      screen.getByText(/convert.*\.docx.*first/i)
    ).toBeInTheDocument();
  });

  it("shows the legacy-format rejection message for a .ppt file", () => {
    render(<Viewer />);
    const file = new File(["x"], "legacy.ppt", { type: "application/vnd.ms-powerpoint" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    expect(
      screen.getByText(/convert.*\.pptx.*first/i)
    ).toBeInTheDocument();
  });

  it("renders the PDF canvas container when a .pdf file is chosen", () => {
    render(<Viewer />);
    const file = new File(["x"], "sample.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    expect(screen.getByTestId("pdf-pages")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Viewer`
Expected: FAIL with "Failed to resolve import ./Viewer"

- [ ] **Step 3: Write `src/routes/Viewer.jsx`**

```jsx
import { useState } from "react";
import Toolbar from "../components/Toolbar.jsx";
import FileDropzone from "../components/FileDropzone.jsx";
import PdfPageCanvas from "../components/PdfPageCanvas.jsx";
import DocumentPanel from "../components/DocumentPanel.jsx";
import { getSettings, setSettings } from "../lib/settings.js";
import "./Viewer.css";

function detectKind(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".doc")) return "legacy-doc";
  if (name.endsWith(".ppt")) return "legacy-ppt";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pptx")) return "pptx";
  return "unsupported";
}

export default function Viewer() {
  const [settings, setSettingsState] = useState(() => getSettings());
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState(null);

  function handleSettingsChange(partial) {
    const next = { ...settings, ...partial };
    setSettingsState(next);
    setSettings(partial);
  }

  function handleFile(newFile) {
    setFile(newFile);
    setKind(detectKind(newFile));
  }

  return (
    <div className="viewer-page">
      <Toolbar settings={settings} onChange={handleSettingsChange} />

      {!file && <FileDropzone onFile={handleFile} />}

      {file && kind === "legacy-doc" && (
        <p className="legacy-notice">
          This is an older .doc file — convert it to .docx first, then open it here.
        </p>
      )}

      {file && kind === "legacy-ppt" && (
        <p className="legacy-notice">
          This is an older .ppt file — convert it to .pptx first, then open it here.
        </p>
      )}

      {file && kind === "pdf" && <PdfPageCanvas file={file} settings={settings} />}

      {file && (kind === "docx" || kind === "pptx") && (
        <DocumentPanel kind={kind} file={file} />
      )}

      {file && kind === "unsupported" && (
        <p className="legacy-notice">This file type isn't supported yet.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/routes/Viewer.css`**

```css
.viewer-page {
  min-height: 100vh;
}

.legacy-notice {
  text-align: center;
  padding: 3rem 1.5rem;
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- Viewer`
Expected: PASS (4 tests)

- [ ] **Step 6: Wire it into `App.jsx`**

```jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./routes/Landing";
import Viewer from "./routes/Viewer";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/viewer" element={<Viewer />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests across every file — ~50+ total)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: wire viewer route — file detection, toolbar, PDF/docx/pptx dispatch"
```

---

## Task 15: Deploy to Vercel at convert.pshah.fun

**Files:**
- Create: `chameleon-convert/vercel.json` (only if default Vite detection needs overriding — try without first)

**Interfaces:** none (deployment/infra task).

- [ ] **Step 1: Push the repo to GitHub**

```bash
cd ~/Documents/chameleon-convert
gh repo create pshah-lab/chameleon-convert --public --source=. --push
```

- [ ] **Step 2: Create the Vercel project**

Connect the new `pshah-lab/chameleon-convert` GitHub repo to Vercel
(via the Vercel dashboard or `vercel` CLI — `vercel link` then `vercel
--prod` from inside the repo). Vite projects are auto-detected; no
`vercel.json` should be needed for a standard build.

- [ ] **Step 3: Add the custom domain**

In the Vercel project's Domains settings, add `convert.pshah.fun`.
Vercel will show a CNAME target — add that CNAME record at the DNS
provider for `pshah.fun` (same place `darkmode.pshah.fun`'s GitHub
Pages CNAME is configured).

- [ ] **Step 4: Verify the live deployment**

Once DNS propagates, confirm:
- `https://convert.pshah.fun/` loads the landing page.
- `https://convert.pshah.fun/viewer` loads the viewer and accepts a
  real PDF file end-to-end (open the file, see it render dark in Smart
  Dark mode by default).

- [ ] **Step 5: Commit (only if vercel.json was needed)**

```bash
git add -A
git commit -m "chore: configure Vercel deployment"
git push
```

---

## Self-Review Notes

- **Spec coverage:** every section of the scaffold design spec maps to a
  task — repo/stack (Task 1), design tokens (Task 2), parser ports
  (Tasks 3-5), PDF rendering incl. the `pdfjs-dist` npm simplification
  (Tasks 6-7, 12), settings persistence (Task 8), landing page (Task 9),
  file handling (Task 11), toolbar/customization carryover (Task 10),
  document panel (Task 13), full wiring (Task 14), deployment to
  `convert.pshah.fun` (Task 15).
- **Review Focus coverage:** non-ZIP/empty file → `DocumentPanel`'s
  catch block (Task 13); corrupt PDF → `PdfPageCanvas`'s error state
  (Task 12); stale render race → `generationRef` counter in
  `PdfPageCanvas` (Task 12), carrying over the extension's
  `renderGeneration` pattern; `.doc`/`.ppt` rejection → `Viewer`'s
  `detectKind` dispatch (Task 14); truncation notices → ported verbatim
  into `DocumentPanel` (Task 13).
- **Out of scope confirmed:** no editing, no Excel, no export/download —
  those are sub-projects 2-4, not touched here.
