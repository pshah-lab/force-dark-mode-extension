# Force Dark Mode

Force Dark Mode is a Chrome extension that applies a dark theme to websites that do not natively support one.  
It allows users to choose between multiple dark-mode engines and stores preferences per site.

---

## Features

- Enable dark mode on any website
- Choose between:
  - **Auto mode** (default, chooses the best engine per site)
  - **CSS-based dark mode** (layout-safe, with broad element coverage)
  - **Invert-based dark mode** (useful for image-heavy sites)
- Per-site preferences with automatic persistence
- Instant toggle without page reload
- Popup state that reflects the current site and selected engine
- Active-tab engine recommendation based on page content
- Native dark-site detection so already-dark pages are left alone in Auto mode
- Per-site CSS background color picker
- Lightweight and privacy-friendly

---

## How It Works

The extension uses a **storage-driven architecture**:

- The popup updates site preferences
- Preferences are stored using `chrome.storage.sync`
- The popup asks the active tab to recommend the best engine for the current page
- Auto mode applies CSS, Invert, or no extra styling when the site already appears dark
- CSS background colors are stored per site and applied immediately
- Content scripts react immediately to storage changes
- No page refresh is required
- No background DOM manipulation

This approach ensures reliability on both static sites and SPAs.

---

Theme engines are isolated and interchangeable.

---

## Theme Engines

### Auto Engine (Default)
- Detects whether the current page is text-heavy, media-heavy, or already dark
- Applies CSS Engine, Invert Engine, or no extra styling based on page analysis
- Best default for most users

### CSS Engine
- Overrides backgrounds, text, borders, form controls, links, and code blocks
- Supports a user-selected background color from the popup
- Preserves images and media
- Best for most websites

### Invert Engine
- Uses color inversion with re-inversion for media and embedded content
- Useful for sites with complex or image-heavy layouts

---

## Privacy

Force Dark Mode does **not** collect, transmit, or track any user data.

- No analytics
- No external services
- No network requests
- All settings remain on the user’s device

---

## Installation (Development)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project root directory

---

## Chrome Web Store

The extension is available on the Chrome Web Store.

> (Add store link here after approval)

---

## Tech Stack

- Chrome Extensions API (Manifest V3)
- Vanilla JavaScript
- CSS
- No frameworks, no bundlers

---

## License

MIT License
