// One-time consent nudge for opt-in anonymous usage stats. Counts popup opens in
// chrome.storage.local (never transmitted) and shows the card once after enough use.
(function (root) {
  const STATE_KEY = "telemetryPromptState";
  const SHOW_AFTER_OPENS = 5;

  function normalize(state) {
    const s = state && typeof state === "object" ? state : {};
    return {
      opens: Number.isFinite(s.opens) && s.opens > 0 ? Math.floor(s.opens) : 0,
      decided: s.decided === true,
    };
  }

  function recordOpen(state) {
    const s = normalize(state);
    return s.decided ? s : { ...s, opens: s.opens + 1 };
  }

  function shouldShow(state) {
    const s = normalize(state);
    return !s.decided && s.opens >= SHOW_AFTER_OPENS;
  }

  function decide(state) {
    return { ...normalize(state), decided: true };
  }

  const api = { STATE_KEY, SHOW_AFTER_OPENS, recordOpen, shouldShow, decide };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TelemetryPrompt = api;
})(typeof window !== "undefined" ? window : globalThis);
