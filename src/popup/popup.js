document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("toggle");
  if (!button) return;

  button.onclick = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    chrome.runtime.sendMessage({
      type: "TOGGLE",
      tabId: tab.id,
      url: tab.url
    });
  };
});