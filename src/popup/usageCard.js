// One-time consent card for the optional daily usage report. Off unless the user turns it on. The card says exactly
// what is received, that the day's report may be updated, and how to turn it off. A 2.0.x opt-in sees the
// "reconfirm" version because this version also counts how many sites dark mode was applied on.
(function (root) {
  const ITEMS = [
    "A random ID for this install, not linked to your name or account.",
    "The date and the extension version.",
    "Which engines you used that day (Auto, CSS, Invert).",
    "How many sites dark mode was applied on that day. A number only, never the sites.",
  ];
  const NOTE =
    "We never receive the sites you visit, page content, or anything you type. Turn it off any time in Options: that stops reports and deletes what we hold for your ID.";
  const UPDATED = "each day you use dark mode we receive the items below, and the day's report may be updated as the numbers change.";

  const USAGE_COPY = {
    ask: {
      id: "ask",
      title: "Share a daily usage report?",
      intro: `It is off unless you turn it on. If you do, ${UPDATED}`,
      items: ITEMS,
      note: NOTE,
      yes: "Turn on",
      no: "No thanks",
    },
    reconfirm: {
      id: "reconfirm",
      title: "Usage report: please confirm",
      intro: `You turned on the usage report in version 2.0. This version also counts how many sites dark mode was applied on each day (a number only). Nothing new is sent until you confirm. If you keep it on, ${UPDATED}`,
      items: ITEMS,
      note: NOTE,
      yes: "Keep it on",
      no: "Turn off and delete my data",
    },
  };

  // consentNeeded comes from the worker's USAGE_STATUS reply: "ask", "reconfirm" or null.
  function cardFor(consentNeeded) {
    if (consentNeeded === "ask") return USAGE_COPY.ask;
    if (consentNeeded === "reconfirm") return USAGE_COPY.reconfirm;
    return null;
  }

  const api = { USAGE_COPY, cardFor };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.UsageCard = api;
})(typeof window !== "undefined" ? window : globalThis);
