# ThemeSwitcher Data Flow Map

This document maps all architectural boundaries and data flows within the ThemeSwitcher browser extension and companion website.

---

## 1. Architectural Boundary Map

```mermaid
flowchart TD
    subgraph ClientDevice ["User Local Device (Browser Sandbox)"]
        subgraph ActiveWebTab ["Active Web Tab Context"]
            WebPage["Visited Web Page DOM"]
            ContentScript["ThemeSwitcher Content Script"]
            CSSEngine["CSS Override Engine / Invert Engine"]
        end

        subgraph ExtensionContext ["Extension Privileged Context"]
            PopupUI["Extension Popup (popup.html / js)"]
            OptionsUI["Options & Privacy UI (options.html / js)"]
            ViewerUI["Dark Document Viewer (viewer.html / js)"]
            SW["Background Service Worker (serviceWorker.js)"]
            SyncStorage[("chrome.storage.sync (Local Profile Storage)")]
        end

        subgraph LocalDocs ["Local Documents & Files"]
            PDFFile["Local PDF / Markdown / TXT File"]
        end
    end

    subgraph ExternalServices ["External Infrastructure"]
        GoogleSyncService["Google Chrome Sync Infrastructure (Optional)"]
        StaticCDN["GitHub Pages Static Hosting (Companion Website)"]
    end

    %% Content Script interactions
    WebPage -- "1. Read computed styles only (colors, background)" --> ContentScript
    ContentScript -- "2. Inject dynamic dark CSS variables & attributes" --> CSSEngine
    CSSEngine -- "3. Apply theme styles to DOM" --> WebPage
    SyncStorage -. "Read host preference" .-> ContentScript

    %% Popup interactions
    PopupUI -- "4. Query active tab (hostname only)" --> ActiveWebTab
    PopupUI -- "5. Send TOGGLE message { host, engine, color }" --> SW
    SW -- "6. Persist preference { enabled, engine, color }" --> SyncStorage

    %% Viewer interactions
    PDFFile -- "7. Load via File ArrayBuffer / Blob URL" --> ViewerUI
    ViewerUI -- "8. Render locally via bundled PDF.js canvas" --> ViewerUI

    %% Options interactions
    OptionsUI -- "9. Export / Import / Clear stored data" --> SyncStorage

    %% External boundaries
    SyncStorage -. "Encrypted Sync (if user signed in to Google)" .-> GoogleSyncService
    StaticCDN -. "HTTP GET (Static HTML/CSS/JS only)" .-> ActiveWebTab
```

---

## 2. Granular Data Flow Analysis

### Flow 1: Web Page Recoloring (Content Script)
- **Source:** Web Page DOM computed styles (`getComputedStyle`).
- **Data Extracted:** Background color, text color, element dimensions, image/svg tag types.
- **Data Not Extracted:** Text content, form input, cookies, tokens.
- **Destination:** In-memory algorithm inside the tab's isolated world.
- **Egress:** **Zero.** Nothing leaves the tab.

### Flow 2: Extension Popup & Preference Toggle
- **Source:** User clicks extension action icon.
- **Data Extracted:** Active tab URL -> parsed to extract hostname only (`location.hostname`).
- **Data Minimization:** No path or query parameters are transmitted.
- **Message Transmitted:** `{ type: "TOGGLE", host: "example.com", engine: "css", backgroundColor: "#0f1115" }`.
- **Destination:** Background Service Worker -> `chrome.storage.sync`.
- **Egress:** **Zero.** Internal Chrome runtime message passing only.

### Flow 3: Dark Document Viewer
- **Source:** Local user-selected file or document URL.
- **Processing:** Client-side ArrayBuffer read -> Rendered to `<canvas>` via bundled `pdf.min.mjs` and `pdf.worker.min.mjs`.
- **Sandbox Isolation:** Fallback iframe runs with `sandbox="allow-scripts"` and `referrerpolicy="no-referrer"`.
- **Egress:** **Zero.** Documents never leave the user's browser.

### Flow 4: Companion Website
- **Source:** Browser navigation to `https://darkmode.pshah.fun`.
- **Delivery:** Static GitHub Pages CDN delivery over HTTPS.
- **Egress:** **Zero.** Zero analytics scripts, zero external counter APIs, zero third-party font or tracking pixels.
