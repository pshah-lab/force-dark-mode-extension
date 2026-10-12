// Optional, local-only feedback nudge. Counts popup opens in chrome.storage.local
// (never transmitted) and shows a dismissible card once after enough use.
(function (root) {
  const STATE_KEY = "feedbackPromptState";
  const SHOW_AFTER_OPENS = 15;
  const MAX_SNOOZES = 1;

  function normalize(state) {
    const s = state && typeof state === "object" ? state : {};
    return {
      opens: Number.isFinite(s.opens) && s.opens > 0 ? Math.floor(s.opens) : 0,
      snoozes: Number.isFinite(s.snoozes) && s.snoozes > 0 ? Math.floor(s.snoozes) : 0,
      done: s.done === true,
    };
  }

  function recordOpen(state) {
    const s = normalize(state);
    return s.done ? s : { ...s, opens: s.opens + 1 };
  }

  function shouldShow(state) {
    const s = normalize(state);
    return !s.done && s.opens >= SHOW_AFTER_OPENS;
  }

  // "Not now" asks again after another batch of opens, once; after that it is final.
  function snooze(state) {
    const s = normalize(state);
    if (s.snoozes >= MAX_SNOOZES) return { ...s, done: true };
    return { ...s, opens: 0, snoozes: s.snoozes + 1 };
  }

  function finish(state) {
    return { ...normalize(state), done: true };
  }

  const api = { STATE_KEY, SHOW_AFTER_OPENS, recordOpen, shouldShow, snooze, finish };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedbackPrompt = api;
})(typeof window !== "undefined" ? window : globalThis);
