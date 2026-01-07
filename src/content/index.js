const host = location.hostname;

function applyEngine(config) {
  disableDarkMode();
  disableInvert();

  if (!config?.enabled) return;

  if (config.engine === "invert") {
    enableInvert();
  } else {
    enableDarkMode();
  }
}

// Initial load
chrome.storage.sync.get(host, data => {
  applyEngine(data[host]);
});

// 🔑 THIS IS THE FIX
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (!changes[host]) return;

  applyEngine(changes[host].newValue);
});

// Optional but fine
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "APPLY_CONFIG") {
    applyEngine(msg.config);
  }
});