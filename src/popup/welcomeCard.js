// One-time card at the top of the side panel: what is new for people who updated, the best features for
// people who just installed. Both say plainly what the extension sends (nothing, unless a report is confirmed).
(function (root) {
  const STATE_KEY = "welcomeState";

  const DATA_NOTE =
    "Nothing is sent unless you turn on the usage report or press Report this site as broken. A broken-site report sends only the site's domain, the engine and theme you use, and the extension version, and only after you confirm.";

  const WELCOME_COPY = {
    whatsnew: {
      id: "whatsnew",
      title: "What's new",
      items: [
        "Side panel: the controls now open beside the page and follow the tab you are on.",
        "Report this site as broken: if a site looks wrong, press the button to tell us.",
        "Optional usage report: off unless you turn it on. You are asked once, and you can change it in Options.",
      ],
      dataNote: DATA_NOTE,
      button: "Got it",
    },
    best: {
      id: "best",
      title: "Best features",
      items: [
        "8 built-in themes: choose one in the Theme menu for each site.",
        "Site packs: ready-made fixes for 20 popular sites.",
        "Dark PDF and document viewer: read PDFs, Word, PowerPoint and spreadsheets in dark mode.",
        "Press Alt+Shift+D to switch dark mode on or off, or right-click a page.",
      ],
      dataNote: DATA_NOTE,
      button: "Got it",
    },
  };

  // state: { kind: "new" | "update", version, seen }. Returns the card to show, or null.
  function cardFor(state) {
    if (!state || typeof state !== "object" || state.seen !== false) return null;
    if (state.kind === "new") return WELCOME_COPY.best;
    if (state.kind === "update") {
      const version = typeof state.version === "string" ? state.version : "";
      return { ...WELCOME_COPY.whatsnew, title: version ? `What's new in ${version}` : WELCOME_COPY.whatsnew.title };
    }
    return null;
  }

  function markSeen(state) {
    return { kind: state.kind, version: state.version, seen: true };
  }

  const api = { STATE_KEY, WELCOME_COPY, cardFor, markSeen };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.WelcomeCard = api;
})(typeof window !== "undefined" ? window : globalThis);
