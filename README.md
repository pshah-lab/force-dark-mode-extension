# Force Dark Mode

Force Dark Mode is a Chrome extension that applies a dark theme to websites that do not natively support one.  
It allows users to choose between multiple dark-mode engines and stores preferences per site.

---

## Features

- Enable dark mode on any website
- Choose between:
  - **CSS-based dark mode** (layout-safe, default)
  - **Invert-based dark mode** (useful for image-heavy sites)
- Per-site preferences with automatic persistence
- Instant toggle without page reload
- Lightweight and privacy-friendly

---

## How It Works

The extension uses a **storage-driven architecture**:

- The popup updates site preferences
- Preferences are stored using `chrome.storage.sync`
- Content scripts react immediately to storage changes
- No page refresh is required
- No background DOM manipulation

This approach ensures reliability on both static sites and SPAs.

---

Theme engines are isolated and interchangeable.

---

## Theme Engines

### CSS Engine (Default)
- Overrides background and text colors
- Preserves images and media
- Best for most websites

### Invert Engine
- Uses color inversion with re-inversion for media
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