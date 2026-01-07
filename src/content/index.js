const host = location.hostname;

chrome.storage.sync.get(host, data => {
  if (data[host]?.enabled) {
    enableDarkMode();
  }
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "ENABLE") enableDarkMode();
  if (msg.type === "DISABLE") disableDarkMode();
});