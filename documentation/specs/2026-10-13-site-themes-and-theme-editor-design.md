# Site Themes and Theme Editor — Design

Status: **draft for approval** (nothing built). Date: 2026-10-13. Target release: 1.9.0.

## Intent

Give users ready-made looks for the websites they read most, and let them
build and save their own, without any account, server or network call.
This is the privacy-first answer to per-site theming extensions that collect
browsing data: all themes ship inside the extension or live in the user's own
browser storage.

Success: a user opens bbc.com, picks "Midnight" once in the popup (or does
nothing and gets the BBC pack automatically), and every later visit looks the
same. A user can design a palette in Options, see it on a live sample page,
save it, and reuse it on any site. No new permissions, no network.

## Non-goals (this release)

- No marketplace, accounts, ratings, sync service, or remote theme downloads.
- No raw custom CSS (phase 4, separate approval; see "Custom CSS" below).
- No payment code. Everything here is free; revisit monetisation after usage data.
- No new behaviour for the Invert engine (themes apply to the CSS engine only).

## What exists today (facts the design builds on)

- Per-site config in `chrome.storage.sync` keyed by hostname:
  `{ enabled, engine, backgroundColor, brightness, contrast, sepia }`.
- The CSS engine derives a full palette from `backgroundColor` in
  `applyCustomPalette` and exposes it as CSS custom properties
  (`--force-dark-bg`, `-surface`, `-surface-soft`, `-elevated`, `-text`,
  `-muted`, `-border`, `-link`, `-input`, `-selection`).
- Settings export/import and "erase all data" already exist in Options.
- `chrome.storage.sync` limits: 8 KB per item, 100 KB total, 512 items.

## Data model

```
Theme {
  id:        string   // "builtin:midnight" | "user:<random>"
  name:      string   // 1-40 chars, plain text
  colors: {           // all "#rrggbb"
    background, surface, text, muted, link, border
  }
  imageDim:  number   // 0-60 (percent brightness reduction on images)
}
```

- Missing colours are derived from `background` exactly as today, so a theme
  can be as small as one colour.
- Per-site config gains an optional `themeId`. `backgroundColor` stays and is
  used when no theme is chosen (full backward compatibility).
- **User themes** live in `chrome.storage.sync` under one key
  `customThemes` (array, max 20, ≈250 bytes each, well under 8 KB).
- **Built-in themes and site packs** are bundled JS modules, never fetched.

## Built-in themes (phase 1)

Midnight (current default), OLED Black, Dracula, Nord, Solarized Dark,
High Contrast, Dim, Sepia Dark. Every built-in must pass the contrast rule
below (a test enforces it).

## Site packs (phase 2)

A pack = `{ match: ["bbc.com", "bbc.co.uk"], themeId, fixes }`.

- **Matching:** exact hostname or dot-suffix match against a literal list.
  Never regular expressions from data.
- **Fixes:** small declarative entries, not arbitrary CSS:
  `{ selector, action: "invert-image" | "keep-light" | "surface:strong" }`.
  These solve cases the engine cannot infer, for example logos drawn as CSS
  background images (Hindustan Times wordmark) or ad slots that should stay
  light.
- **Resolution order:** user's per-site choice → site pack → Auto.
- Packs ship with the extension and update with normal store releases.
- **First packs**, chosen from the compatibility audit and listing analytics:
  BBC, CNN, Forbes, NPR, Guardian, NYT, Reuters, Al Jazeera, Daily Mail,
  Hindustan Times, Indian Express, NDTV, Globo, Medium, Substack, Wikipedia,
  GitHub, MDN, Reddit, Hacker News. Add Brazilian and Indonesian outlets
  after checking the audience data again.

## Theme editor (phase 3, Options page)

- Colour pickers for background, surface, text, muted, link, border; image
  dim slider; name field.
- **Live preview:** a built-in sample article (headline, paragraph, link,
  button, input, code block, image placeholder, card) rendered with the
  chosen palette. No remote content.
- **Accessibility guard:** text on background and link on background must be
  at least 4.5:1 to save without a warning; below 3:1 the Save button is
  disabled with a plain explanation. Uses the existing luminance helpers.
- Actions: save, duplicate, rename, delete, export one theme as JSON, import
  JSON.
- **Import validation:** parse with `JSON.parse` only; allow-list the keys
  above, validate hex colours and number ranges, cap name length, reject
  `__proto__`/`constructor`/`prototype` (reusing the existing `isSafeKey`),
  cap file size at 16 KB and theme count at 20. Unknown keys are dropped, not
  stored.

## Popup

One new row under the engine list: a theme dropdown (built-ins, "My themes",
and "Site pack: <name>" when one matches). Changing it writes `themeId` for
the current host and re-applies immediately. The popup stays lightweight.

## Engine integration

- `applyCustomPalette(config)` accepts a resolved palette object; when only
  `backgroundColor` is present it derives the palette as before.
- Image dimming uses the existing image handling path with one extra CSS
  variable; no new observers.
- The idempotent-rescan and late-rescan behaviour added in 1.8.0 is unchanged.

## Privacy and security

- No new permissions, host access or network calls. The existing privacy test
  that scans extension JS for network APIs and URLs is extended to the new
  files.
- Theme names are rendered with `textContent` only (existing rule: no
  `innerHTML` in extension pages).
- Theme data never contains URLs or code; import rejects anything outside the
  schema.

## Testing

- Unit (Node `assert`, no new dependencies): palette derivation, contrast
  guard (all built-ins pass), schema validation and import rejection cases,
  quota and count limits, site-pack hostname matching including look-alike
  hosts (`evilbbc.com`, `bbc.com.evil.io` must not match), resolution order.
- DOM tests: popup dropdown writes `themeId`; editor save/delete; preview uses
  `textContent`.
- Real-browser checks with the audit harness: each shipped pack on its site
  before and after, screenshot reviewed. Packs are not merged on a guess.

## Phases and sizing

1. Built-in themes + popup dropdown (small).
2. Site packs for the first 20 sites (medium; mostly per-site audit work).
3. Theme editor, preview, import/export (medium).
4. Custom CSS per site (separate approval; needs a sanitiser that strips
   `@import`, `url(` to non-`data:` targets and anything that could cause a
   network request, to keep the "no network calls" claim true).

Ship 1 + 2 as 1.9.0; 3 as 1.10.0.

## Open decisions for the owner

1. Free for all phases 1-3? (Recommended: yes. Decide on any paid tier only
   after seeing real usage, and only for phase 4.)
2. Pack priority: confirm the first-20 list or reorder by what readers ask for.
3. Theme names and a visual identity for the built-ins.
