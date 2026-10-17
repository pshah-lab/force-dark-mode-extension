// Wording for the broken-site report. The consent text says exactly what is sent, including the domain.
(function (root) {
  const REPORT_COPY = {
    title: "Report this site as broken?",
    body: "This sends the site's domain (for example example.com), the engine and theme you are using, and the extension version to the developer so the site can be fixed. It does not send the page address, page content, anything you type, or any ID. You are asked every time.",
    send: "Send report",
    cancel: "Cancel",
    sent: "Thanks, report sent",
    already: "Already reported today",
    failed: "Could not send, try again",
    invalid: "This site cannot be reported",
  };

  // Anything unexpected is shown as a failure, never as success.
  function outcomeMessage(outcome) {
    if (outcome === "sent" || outcome === "already" || outcome === "invalid") return REPORT_COPY[outcome];
    return REPORT_COPY.failed;
  }

  const api = { REPORT_COPY, outcomeMessage };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ReportCard = api;
})(typeof window !== "undefined" ? window : globalThis);
