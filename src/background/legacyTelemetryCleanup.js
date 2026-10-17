// Version 2.0.x let people opt in to a daily usage report tied to a random install ID. That report is gone.
// For anyone who opted in, ask the server to delete what it holds for their ID, then forget the ID.
// A failed request keeps the ID (as a pending delete) and is retried on the next worker start.
export const DELETE_URL = "https://pshah.fun/api/darkmode-telemetry-delete";

const STATE_KEY = "telemetryState";
const PROMPT_KEY = "telemetryPromptState";

const isId = (x) => typeof x === "string" && x.length > 0;

export function createLegacyCleanup({ storage, post }) {
  let running = null;

  async function doRun() {
    const state = await storage.get(STATE_KEY);
    const ids = [];
    if (state && typeof state === "object") {
      if (isId(state.id)) ids.push(state.id);
      if (Array.isArray(state.pendingDeleteIds)) ids.push(...state.pendingDeleteIds.filter(isId));
    }
    const unique = [...new Set(ids)];

    const remaining = [];
    for (const id of unique) {
      let ok = false;
      try {
        const res = await post(DELETE_URL, { id });
        ok = !!(res && res.ok);
      } catch (e) {
        ok = false;
      }
      if (!ok) remaining.push(id);
    }

    await storage.remove(PROMPT_KEY);
    if (remaining.length) {
      await storage.set(STATE_KEY, { enabled: false, pendingDeleteIds: remaining });
      return "retry";
    }
    await storage.remove(STATE_KEY);
    return unique.length ? "deleted" : "none";
  }

  function run() {
    if (!running) running = doRun().finally(() => { running = null; });
    return running;
  }

  return { run };
}
