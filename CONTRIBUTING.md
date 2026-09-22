# Contributing to Force Dark Mode - ThemeSwitcher

Thank you for your interest in improving **Force Dark Mode - ThemeSwitcher**! We welcome bug fixes, documentation improvements, performance optimizations, and site compatibility enhancements.

---

## Code of Conduct

Please be respectful, constructive, and collaborative in all issues and discussions.

---

## Development Workflow

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended for running test scripts).
- Google Chrome or any Chromium-based browser (Edge, Brave, Opera).

### 2. Getting Started
1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/force-dark-mode-extension.git
   cd force-dark-mode-extension
   ```
3. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the repository root directory.

### 3. Testing
Before submitting any changes, you must ensure all automated tests pass:

```bash
# Run unit and security tests (28 tests)
node tests/run_tests.mjs

# Run DOM simulation and engine tests (4 tests)
node tests/dom_engine_test.mjs
```

If you add a new feature or fix a bug on a specific website, consider adding a test case in `tests/`.

### 4. Code Standards & Architecture Guidelines
- **No external dependencies in runtime extension:** The extension runs pure vanilla JavaScript and CSS to keep runtime execution lightweight and avoid supply chain risks.
- **Strict Manifest V3 Compliance:**
  - Service workers must remain stateless and event-driven.
  - Never use `eval()`, `new Function()`, or inline `<script>` tags.
  - Never store persistent state in global service worker variables; always use `chrome.storage`.
- **Performance & Batching:**
  - In content scripts, always decouple DOM reads (`getComputedStyle`, `getBoundingClientRect`) from DOM writes (`setAttribute`, `style`).
  - Batch DOM mutations using `requestAnimationFrame`.
- **Accessibility:**
  - Ensure all colors calculated by `colorUtils.js` meet WCAG 2.2 AA minimum contrast ratios (4.5:1 for body text, 3:1 for large text/borders).

---

## Submitting a Pull Request

1. Create a descriptive branch:
   ```bash
   git checkout -b fix/youtube-player-dark-detection
   ```
2. Commit your changes with clear commit messages:
   ```bash
   git commit -m "fix(engine): improve dark surface threshold for embedded video containers"
   ```
3. Push to your fork and open a Pull Request against the `main` branch.
4. Describe the changes, the websites tested, and confirm that all test suites pass.

---

## Submitting Issues & Suggestions

- **Bug Reports:** Please use our [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md) and include the URL of the affected website and steps to reproduce.
- **Feature Requests:** Please use our [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md) explaining the use case and expected benefit.
