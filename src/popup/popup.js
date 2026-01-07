document.addEventListener("DOMContentLoaded", async () => {
  const button = document.getElementById("toggle");
  const radios = document.querySelectorAll('input[name="engine"]');

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://")
  ) {
    button.disabled = true;
    button.textContent = "Unavailable on this page";
    return;
  }

  if (!tab?.url) return;
  const host = new URL(tab.url).hostname;

  function updateUI() {
    chrome.storage.sync.get(host, (data) => {
      const config = data[host] || {};
      const enabled = config.enabled === true;
      const engine = config.engine || "css";

      button.textContent = enabled ? "Disable Dark Mode" : "Enable Dark Mode";

      radios.forEach((radio) => {
        radio.checked = radio.value === engine;
      });
    });
  }

  // Toggle dark mode
  button.onclick = () => {
    const selectedEngine =
      document.querySelector('input[name="engine"]:checked')?.value || "css";

    chrome.runtime.sendMessage({
      type: "TOGGLE",
      tabId: tab.id,
      url: tab.url,
      engine: selectedEngine,
    });
  };

  // Change engine without toggling state
  radios.forEach((radio) => {
    radio.onchange = () => {
      chrome.storage.sync.get(host, (data) => {
        const enabled = data[host]?.enabled === true;

        chrome.runtime.sendMessage({
          type: "TOGGLE",
          tabId: tab.id,
          url: tab.url,
          engine: radio.value,
          forceEnabled: enabled,
        });
      });
    };
  });

  updateUI();
});
