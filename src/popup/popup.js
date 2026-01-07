document.addEventListener("DOMContentLoaded", async () => {
  const button = document.getElementById("toggle");
  const label = button.querySelector(".label");
  const radios = document.querySelectorAll('input[name="engine"]');

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.url) return;

  // Restricted pages
  if (
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://")
  ) {
    button.disabled = true;
    label.textContent = "Unavailable on this page";
    button.classList.remove("active");
    return;
  }

  const host = new URL(tab.url).hostname;

  function updateToggleUI(enabled) {
    button.classList.toggle("active", enabled);
    label.textContent = enabled ? "Dark mode enabled" : "Enable dark mode";
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes[host]) return;

    const enabled = changes[host].newValue?.enabled === true;
    updateToggleUI(enabled);
  });

  function updateUI() {
    chrome.storage.sync.get(host, (data) => {
      const config = data[host] || {};
      const enabled = config.enabled === true;
      const engine = config.engine || "css";

      updateToggleUI(enabled);

      radios.forEach((radio) => {
        radio.checked = radio.value === engine;
      });
    });
  }

  // Toggle dark mode ON / OFF
  button.onclick = () => {
    const selectedEngine =
      document.querySelector('input[name="engine"]:checked')?.value || "css";

    // Read current state first
    chrome.storage.sync.get(host, (data) => {
      const currentlyEnabled = data[host]?.enabled === true;
      const nextEnabled = !currentlyEnabled;

      // Optimistically update UI
      updateToggleUI(nextEnabled);

      chrome.runtime.sendMessage({
        type: "TOGGLE",
        tabId: tab.id,
        url: tab.url,
        engine: selectedEngine,
      });
    });
  };

  // Change engine without toggling enabled state
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
