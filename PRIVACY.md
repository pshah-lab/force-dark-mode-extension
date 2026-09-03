# Privacy Policy for Force Dark Mode

**Last updated:** September 4, 2026

Force Dark Mode is committed to protecting your privacy. This policy outlines our data handling practices.

## 1. Data Collection & Transmission
Force Dark Mode does **not** collect, track, sell, or transmit any personal information, browsing history, or user activity.
- **Zero Telemetry / Analytics:** There are no analytics libraries, tracking pixels, or external API calls.
- **Zero Third-Party Sharing:** No user data is ever sold, transferred, or shared with third parties.

## 2. Storage & Preferences
The extension uses Chrome's built-in `chrome.storage.sync` API solely to store your dark mode preferences:
- Selected theme engine per domain (`auto`, `css`, or `invert`).
- Custom background color selections.
- Viewer display settings (mode, font size, contrast).

These preferences are synchronized through your Google Chrome account using Google's secure synchronization infrastructure. No proprietary servers or external databases are used.

## 3. Document & PDF Viewer
The built-in Dark Document Viewer processes all PDF, TXT, Markdown, and RTF documents **100% locally on your machine** using local browser APIs and bundled client-side rendering engines. Your documents are never uploaded, analyzed, or sent to any remote server.

## 4. Permissions
- **`storage`**: Used to save your per-site preferences and viewer configuration across sessions.
- **`activeTab`**: Used only when you click the extension popup to analyze the active tab for dark-mode suitability and apply your theme selection.

## 5. Contact
If you have any questions or feedback regarding this privacy policy, please open an issue on the project repository:
https://github.com/pshah-lab/force-dark-mode-extension